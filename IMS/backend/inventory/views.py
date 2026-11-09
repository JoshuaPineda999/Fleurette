from rest_framework import mixins, viewsets, status
import logging
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
import re
import secrets
import uuid
from datetime import timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.utils import timezone
from django.db import connection, transaction
from django.db.models import Q, Sum
from .models import Garment, GarmentPhoto, SizeStock, SaleLog, Expense, OnlineOrder, PopUpEvent, PAYMENT_METHODS, SPLIT_PAYMENT
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers as drf_serializers

from rest_framework.permissions import IsAdminUser
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
import io
from django.core.management import call_command
from django.http import HttpResponse
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .serializers import GarmentSerializer, SaleLogSerializer, ExpenseSerializer, CatalogGarmentSerializer, OnlineOrderSerializer, PopUpEventSerializer, clean_payment_split, split_total


def _norm(value):
    return str(value or '').strip().lower()


def _sale_discount(request):
    """Discount (pesos, whole sale) and promo code sent with a sale; None if the discount is invalid."""
    try:
        discount = Decimal(str(request.data.get('discount') or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None, ''
    # "NaN" gets through quantize, and comparing it raises an error.
    if not discount.is_finite() or discount < 0:
        return None, ''
    return discount, str(request.data.get('promo_code') or '').strip()[:100]


PAYMENT_METHOD_ERROR = 'Choose a mode of payment: GCash, Maya, GoTyme, Cash, Installment or Split Payment'


def _payment_method(request, current=''):
    """Mode of payment sent with a sale (current if none was sent); None if it isn't a known one."""
    value = str(request.data.get('payment_method', current) or '')
    return value if not value or value in dict(PAYMENT_METHODS) else None


def _sale_popup(request, current=None):
    """(event, error): the pop-up event a sale was made at; None for the boutique.
    The current event is kept if none was sent."""
    if 'popup' not in request.data:
        return current, None
    value = request.data.get('popup')
    if value in (None, ''):
        return None, None
    try:
        return PopUpEvent.objects.get(pk=int(value)), None
    except (TypeError, ValueError, PopUpEvent.DoesNotExist):
        return None, 'That pop-up event no longer exists. Refresh and choose again.'


def _split_discount(discount, grosses):
    """Split one sale-wide discount across sale records in proportion to their gross amounts.
    The last record takes the rounding remainder, so the shares always add up to the discount."""
    total = sum(grosses)
    shares, given = [], Decimal('0')
    for i, gross in enumerate(grosses):
        if i == len(grosses) - 1:
            share = discount - given
        else:
            share = (discount * gross / total).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if total else Decimal('0')
            given += share
        shares.append(share)
    return shares


def _norm_color(value):
    # Blank, null and the 'N/A' placeholder all mean "no color".
    v = _norm(value)
    return '' if v in ('', 'n/a') else v


def _matching_product(name, color, category):
    """Garments considered the same visual product (mirrors the frontend's
    mergeGarments grouping key), oldest id first."""
    qs = Garment.objects.filter(name__iexact=_norm(name))
    matches = []
    for g in qs:
        if _norm_color(g.color) != _norm_color(color):
            continue
        if category and _norm(g.category) != _norm(category):
            continue
        matches.append(g)
    matches.sort(key=lambda g: g.id)
    return matches


def _take_items(items, visible_only=False):
    """Take stock for sale items inside the caller's transaction.

    Each item is {size, quantity, garment_id} (that exact batch record) or
    {size, quantity, name, color, category} (oldest batch first across the product).
    Returns (taken, shortages, error): taken is [(garment, size, pieces)]. When
    shortages or error is set the caller must roll back. visible_only leaves out hidden batches.
    """
    taken, shortages = [], []
    for it in items:
        size = (it or {}).get('size')
        try:
            quantity = int((it or {}).get('quantity', 0))
        except (TypeError, ValueError):
            quantity = 0
        if not size or quantity <= 0:
            return [], [], 'Every item needs a size and a positive quantity'

        if it.get('garment_id'):
            candidates = list(Garment.objects.filter(id=it['garment_id']))
            label = candidates[0].name if candidates else f"item {it['garment_id']}"
        else:
            candidates = _matching_product(it.get('name'), it.get('color'), it.get('category'))
            if visible_only:
                candidates = [g for g in candidates if not g.batch_hidden]
            label = it.get('name') or 'item'
        stocks = {
            st.garment_id: st
            for st in SizeStock.objects.select_for_update().filter(garment_id__in=[g.id for g in candidates], size=size)
        }
        available = sum(stocks[g.id].quantity for g in candidates if g.id in stocks)
        if available < quantity:
            shortages.append({'item': label, 'color': it.get('color') or '', 'size': size, 'requested': quantity, 'available': available})
            continue

        remaining = quantity
        for g in candidates:
            stock = stocks.get(g.id)
            if remaining <= 0 or not stock or stock.quantity <= 0:
                continue
            take = min(stock.quantity, remaining)
            stock.quantity -= take
            stock.save()
            remaining -= take
            taken.append((g, size, take))
    return taken, shortages, None


ONLINE_ORDER_HOLD_HOURS = 24
ONLINE_ORDER_MAX_LINES = 20
ONLINE_ORDER_MAX_PIECES_PER_LINE = 20


def _release_online_order_stock(order):
    """Give an online order's held pieces back to the batches they came from."""
    for it in order.items:
        for a in it.get('allocations') or []:
            if Garment.objects.filter(id=a.get('garment_id')).exists():
                stock, _ = SizeStock.objects.select_for_update().get_or_create(garment_id=a['garment_id'], size=it.get('size'))
                stock.quantity += int(a.get('quantity') or 0)
                stock.save()


def release_expired_online_orders():
    """Expire unconfirmed orders past their hold. Render's free tier has no scheduled jobs, so
    this runs whenever stock is about to be read."""
    due = OnlineOrder.objects.filter(status='Awaiting', expires_at__lte=timezone.now())
    if not due.exists():
        return
    with transaction.atomic():
        for order in due.select_for_update():
            _release_online_order_stock(order)
            order.status = 'Expired'
            order.save(update_fields=['status'])


class OnlineOrderThrottle(AnonRateThrottle):
    scope = 'online_order'


def _new_order_code():
    alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'  # no look-alikes (0/O, 1/I/L)
    while True:
        code = 'FL-' + ''.join(secrets.choice(alphabet) for _ in range(6))
        if not OnlineOrder.objects.filter(code=code).exists():
            return code


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([OnlineOrderThrottle])
def place_online_order(request):
    """A customer places an order: all of it is held, or nothing is. Prices come from the server.

    customer_name, contact_number, items: [{name, color, category, size, quantity}]
    """
    name = str(request.data.get('customer_name') or '').strip()
    contact = str(request.data.get('contact_number') or '').strip()
    items = request.data.get('items')
    if not name or len(name) > 255:
        return Response({'error': 'Please enter your name.'}, status=status.HTTP_400_BAD_REQUEST)
    if not re.fullmatch(r'[0-9+()\-\s]{7,20}', contact):
        return Response({'error': 'Please enter a valid contact number.'}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(items, list) or not items or len(items) > ONLINE_ORDER_MAX_LINES:
        return Response({'error': f'An order needs 1 to {ONLINE_ORDER_MAX_LINES} items.'}, status=status.HTTP_400_BAD_REQUEST)

    release_expired_online_orders()
    with transaction.atomic():
        lines, shortages = [], []
        for it in items:
            if not isinstance(it, dict):
                transaction.set_rollback(True)
                return Response({'error': 'Invalid item.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                quantity = int(it.get('quantity', 0))
            except (TypeError, ValueError):
                quantity = 0
            if quantity < 1 or quantity > ONLINE_ORDER_MAX_PIECES_PER_LINE:
                transaction.set_rollback(True)
                return Response({'error': f'Each item can have 1 to {ONLINE_ORDER_MAX_PIECES_PER_LINE} pieces.'}, status=status.HTTP_400_BAD_REQUEST)
            # Only product details are read from the customer (never a garment id or a price).
            clean = {'name': it.get('name'), 'color': it.get('color'), 'category': it.get('category'), 'size': it.get('size'), 'quantity': quantity}
            taken, short, error = _take_items([clean], visible_only=True)
            if error:
                transaction.set_rollback(True)
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
            shortages += short
            if taken:
                first = taken[0][0]
                lines.append({
                    'item_name': first.name, 'color': first.color or '', 'category': first.category or '',
                    'size': clean['size'], 'quantity': quantity,
                    'amount': str(sum(g.selling_price * pieces for g, _, pieces in taken)),
                    'allocations': [{'garment_id': g.id, 'batch_name': g.batch_name, 'quantity': pieces} for g, _, pieces in taken],
                })
        if shortages:
            transaction.set_rollback(True)
            return Response({'error': 'Not enough stock', 'shortages': shortages}, status=status.HTTP_400_BAD_REQUEST)

        order = OnlineOrder.objects.create(
            code=_new_order_code(), customer_name=name, contact_number=contact, items=lines,
            total=sum(Decimal(line['amount']) for line in lines),
            expires_at=timezone.now() + timedelta(hours=ONLINE_ORDER_HOLD_HOURS),
        )
    return Response(OnlineOrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OnlineOrderViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Admin view of website orders: list, confirm into a pre-order, or cancel."""
    queryset = OnlineOrder.objects.all().order_by('-id')
    serializer_class = OnlineOrderSerializer

    def list(self, request, *args, **kwargs):
        release_expired_online_orders()
        return super().list(request, *args, **kwargs)

    def perform_destroy(self, instance):
        with transaction.atomic():
            order = OnlineOrder.objects.select_for_update().get(pk=instance.pk)
            if order.status == 'Awaiting':
                _release_online_order_stock(order)
            order.delete()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Turn an awaiting order into a pre-order, which takes over the held stock."""
        release_expired_online_orders()
        with transaction.atomic():
            order = OnlineOrder.objects.select_for_update().get(pk=self.get_object().pk)
            if order.status != 'Awaiting':
                return Response({'error': f'This order is already {order.status.lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
            items = [{
                'item_name': it['item_name'], 'size': it['size'], 'color': it.get('color') or 'N/A',
                'quantity': it['quantity'], 'reserved': it['quantity'], 'allocations': it.get('allocations') or [],
            } for it in order.items]
            first = items[0]
            preorder = PreOrder.objects.create(
                customer_name=order.customer_name, contact_number=order.contact_number,
                item_name=f"{first['item_name']} +{len(items) - 1} more" if len(items) > 1 else first['item_name'],
                size=first['size'], color=first['color'], items=items,
                price=order.total, discount=order.discount, promo_code=order.promo_code,
                down_payment=0, balance=order.total, is_paid=order.total <= 0,
            )
            order.status = 'Confirmed'
            order.preorder_id = preorder.id
            order.save(update_fields=['status', 'preorder_id'])
        return Response(OnlineOrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='discount')
    def set_discount(self, request, pk=None):
        """Set (or, with 0, remove) the discount on an awaiting order."""
        discount, promo_code = _sale_discount(request)
        if discount is None:
            return Response({'error': 'Enter a valid discount.'}, status=status.HTTP_400_BAD_REQUEST)
        release_expired_online_orders()
        with transaction.atomic():
            order = OnlineOrder.objects.select_for_update().get(pk=self.get_object().pk)
            if order.status != 'Awaiting':
                return Response({'error': f'This order is already {order.status.lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
            subtotal = order.total + order.discount
            if discount > subtotal:
                return Response({'error': f'The discount is more than the order (₱{subtotal}).'}, status=status.HTTP_400_BAD_REQUEST)
            order.discount = discount
            order.promo_code = promo_code if discount > 0 else ''
            order.total = subtotal - discount
            order.save(update_fields=['discount', 'promo_code', 'total'])
        return Response(OnlineOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel an awaiting order and give its stock back to its batches."""
        with transaction.atomic():
            order = OnlineOrder.objects.select_for_update().get(pk=self.get_object().pk)
            if order.status != 'Awaiting':
                return Response({'error': f'This order is already {order.status.lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
            _release_online_order_stock(order)
            order.status = 'Cancelled'
            order.save(update_fields=['status'])
        return Response(OnlineOrderSerializer(order).data)


class CatalogViewSet(viewsets.ReadOnlyModelViewSet):
    """Public, read-only product list for the customer page (no costs or profit)."""
    queryset = Garment.objects.filter(batch_hidden=False).order_by('id').prefetch_related('sizes', 'photos')
    serializer_class = CatalogGarmentSerializer
    authentication_classes = []  # public: an old admin token in the browser must not cause a 401
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def list(self, request, *args, **kwargs):
        release_expired_online_orders()
        return super().list(request, *args, **kwargs)


class LoginView(TokenObtainPairView):
    """Admin login: username + password in, access + refresh tokens out (10 tries a minute)."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'


class RefreshLoginView(TokenRefreshView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'


class GarmentViewSet(viewsets.ModelViewSet):
    queryset = Garment.objects.all().order_by('id').prefetch_related('sizes', 'photos')
    serializer_class = GarmentSerializer

    MAX_EXTRA_PHOTOS = 6

    def list(self, request, *args, **kwargs):
        release_expired_online_orders()
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='photos')
    def add_photos(self, request, pk=None):
        """Add extra photos (multipart field `images`, one or more files) to a garment."""
        garment = self.get_object()
        files = request.FILES.getlist('images')
        if not files:
            return Response({'error': 'Choose at least one photo'}, status=status.HTTP_400_BAD_REQUEST)
        room = self.MAX_EXTRA_PHOTOS - garment.photos.count()
        if len(files) > room:
            return Response({'error': f'An item can have up to {self.MAX_EXTRA_PHOTOS} extra photos ({max(room, 0)} more allowed)'}, status=status.HTTP_400_BAD_REQUEST)
        checker = drf_serializers.ImageField()
        for f in files:
            try:
                checker.run_validation(f)  # rejects files that are not images
            except (drf_serializers.ValidationError, DjangoValidationError):
                return Response({'error': f'"{f.name}" is not a photo'}, status=status.HTTP_400_BAD_REQUEST)
            if f.size > settings.MAX_IMAGE_UPLOAD_BYTES:
                return Response({'error': f'"{f.name}" is too large (5 MB maximum)'}, status=status.HTTP_400_BAD_REQUEST)
        for f in files:
            GarmentPhoto.objects.create(garment=garment, image=f)
        garment = self.get_queryset().get(pk=garment.pk)
        return Response(GarmentSerializer(garment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'photos/(?P<photo_id>\d+)')
    def delete_photo(self, request, pk=None, photo_id=None):
        """Remove one extra photo from a garment."""
        garment = self.get_object()
        deleted, _ = GarmentPhoto.objects.filter(garment=garment, id=photo_id).delete()
        if not deleted:
            return Response({'error': 'Photo not found'}, status=status.HTTP_404_NOT_FOUND)
        garment = self.get_queryset().get(pk=garment.pk)
        return Response(GarmentSerializer(garment).data)

    @action(detail=True, methods=['patch'])
    def update_stock(self, request, pk=None):
        garment = self.get_object()
        size_label = request.data.get('size')
        try:
            change = int(request.data.get('change', 0))
        except (TypeError, ValueError):
            return Response({'error': 'change must be a whole number'}, status=status.HTTP_400_BAD_REQUEST)
        is_sale = request.data.get('is_sale', False)
        discount, promo_code = _sale_discount(request)
        if discount is None:
            return Response({'error': 'Discount must be a number of pesos, 0 or more'}, status=status.HTTP_400_BAD_REQUEST)
        if change < 0 and is_sale and discount > garment.selling_price * abs(change):
            return Response({'error': 'Discount cannot be more than the sale amount'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                stock = garment.sizes.select_for_update().get(size=size_label)
                if stock.quantity + change < 0:
                    return Response({'error': 'Stock cannot be negative'}, status=status.HTTP_400_BAD_REQUEST)
                stock.quantity += change
                stock.save()

                if change < 0 and is_sale:
                    qty_sold = abs(change)
                    # The discount comes off both what the sale brought in and the profit.
                    profit = garment.profit_per_piece * qty_sold - discount
                    SaleLog.objects.create(
                        garment_name=garment.name,
                        size=size_label,
                        quantity_sold=qty_sold,
                        profit_earned=profit,
                        amount_sold=garment.selling_price * qty_sold - discount,
                        discount=discount,
                        promo_code=promo_code,
                        sold_at=timezone.localdate(),
                        batch_name=garment.batch_name,
                        garment_id=garment.id,
                    )
            return Response(GarmentSerializer(garment).data)
        except SizeStock.DoesNotExist:
            return Response({'error': 'Size not found'}, status=status.HTTP_404_NOT_FOUND)

    def _matching_garments(self, name, color, category):
        return _matching_product(name, color, category)

    @action(detail=False, methods=['post'], url_path='set-batch-visibility')
    def set_batch_visibility(self, request):
        """Hide every garment in `batch_name` from the customer catalogue, or show them again."""
        batch_name = request.data.get('batch_name')
        hidden = request.data.get('hidden')
        if not batch_name or not isinstance(hidden, bool):
            return Response({'error': 'batch_name and hidden (true or false) are required'}, status=status.HTTP_400_BAD_REQUEST)
        garments = Garment.objects.filter(batch_name=batch_name)
        if batch_name == 'Uncategorized':
            garments = Garment.objects.filter(Q(batch_name='Uncategorized') | Q(batch_name__isnull=True) | Q(batch_name=''))
        updated = garments.update(batch_hidden=hidden)
        return Response({'updated': updated, 'batch_name': batch_name, 'hidden': hidden})

    @action(detail=False, methods=['post'], url_path='set-batch-status')
    def set_batch_status(self, request):
        """Mark every garment in `batch_name` as On-hand or Pre-order."""
        batch_name = request.data.get('batch_name')
        batch_status = request.data.get('batch_status')
        valid = [choice for choice, _ in Garment.BATCH_STATUS_CHOICES]
        if not batch_name or batch_status not in valid:
            return Response({'error': f'batch_name and a batch_status of {valid} are required'}, status=status.HTTP_400_BAD_REQUEST)
        updated = Garment.objects.filter(batch_name=batch_name).update(batch_status=batch_status)
        return Response({'updated': updated, 'batch_name': batch_name, 'batch_status': batch_status})

    @action(detail=False, methods=['post'], url_path='fifo-deduct')
    def fifo_deduct(self, request):
        """Atomically deduct `quantity` of `size` across all batches of a
        name+color(+category) product, oldest batch first.

        strict=True (default, used for direct sales): if total available stock
        across all matching batches is less than the requested quantity, no
        stock is deducted at all and a 400 is returned.

        strict=False (used for pre-order reservations, which may legitimately
        reserve against stock that isn't fully available yet): deducts as much
        as is available (possibly zero) and always succeeds.
        """
        name = request.data.get('name')
        color = request.data.get('color')
        category = request.data.get('category')
        size = request.data.get('size')
        try:
            quantity = int(request.data.get('quantity', 0))
        except (TypeError, ValueError):
            quantity = 0
        is_sale = bool(request.data.get('is_sale', False))
        strict = bool(request.data.get('strict', True))
        discount, promo_code = _sale_discount(request)
        if discount is None:
            return Response({'error': 'Discount must be a number of pesos, 0 or more'}, status=status.HTTP_400_BAD_REQUEST)

        if not name or not size or quantity <= 0:
            return Response({'error': 'name, size and a positive quantity are required'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            matching = self._matching_garments(name, color, category)
            garment_ids = [g.id for g in matching]
            stocks = {
                s.garment_id: s
                for s in SizeStock.objects.select_for_update().filter(garment_id__in=garment_ids, size=size)
            }

            total_available = sum(stocks[g.id].quantity for g in matching if g.id in stocks)

            if strict and total_available < quantity:
                return Response({
                    'error': 'Insufficient stock across all batches',
                    'available': total_available,
                    'requested': quantity
                }, status=status.HTTP_400_BAD_REQUEST)

            remaining = quantity
            deducted_total = 0
            # Which batch each deducted piece came from, so callers can give it back to that batch.
            allocations = []
            sales = []  # (garment, pieces) for each sale record to write
            for g in matching:
                if remaining <= 0:
                    break
                stock = stocks.get(g.id)
                if not stock or stock.quantity <= 0:
                    continue
                deduct = min(stock.quantity, remaining)
                stock.quantity -= deduct
                stock.save()
                remaining -= deduct
                deducted_total += deduct
                allocations.append({'garment_id': g.id, 'batch_name': g.batch_name, 'quantity': deduct})

                if is_sale and deduct > 0:
                    sales.append((g, deduct))

            if sales:
                grosses = [g.selling_price * pieces for g, pieces in sales]
                if discount > sum(grosses):
                    transaction.set_rollback(True)
                    return Response({'error': 'Discount cannot be more than the sale amount'}, status=status.HTTP_400_BAD_REQUEST)
                # A sale split across batches shares its discount between the batch records.
                for (g, pieces), gross, share in zip(sales, grosses, _split_discount(discount, grosses)):
                    SaleLog.objects.create(
                        garment_name=g.name,
                        size=size,
                        quantity_sold=pieces,
                        profit_earned=g.profit_per_piece * pieces - share,
                        amount_sold=gross - share,
                        discount=share,
                        promo_code=promo_code,
                        sold_at=timezone.localdate(),
                        batch_name=g.batch_name,
                        garment_id=g.id,
                    )

        return Response({'deducted': deducted_total, 'requested': quantity, 'allocations': allocations})

    @action(detail=False, methods=['post'], url_path='record-sale')
    def record_sale(self, request):
        """Record one sale of one or more items, all or nothing.

        items: [{size, quantity, garment_id}] to sell from that exact batch record, or
               [{size, quantity, name, color, category}] to sell oldest batch first across
               every batch of that product.
        discount / promo_code: one discount (pesos) for the whole sale, shared across its
               records in proportion to their amounts.
        payment_method: GCash, Maya, GoTyme, Cash, Installment or Split Payment (required).
        payment_split: for a Split Payment, [{method, amount}] x 2, adding up to the sale's total.
        popup: id of the pop-up event the sale was made at; empty for the boutique.
        Every record written gets the same sale_group. If any item is short on stock,
        nothing is sold and a 400 lists what is short.
        """
        items = request.data.get('items')
        if not isinstance(items, list) or not items:
            return Response({'error': 'items must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)
        discount, promo_code = _sale_discount(request)
        if discount is None:
            return Response({'error': 'Discount must be a number of pesos, 0 or more'}, status=status.HTTP_400_BAD_REQUEST)
        payment_method = _payment_method(request)
        if not payment_method:
            return Response({'error': PAYMENT_METHOD_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        payment_split = []
        if payment_method == SPLIT_PAYMENT:
            payment_split, error = clean_payment_split(request.data.get('payment_split'))
            if error:
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
        popup, error = _sale_popup(request)
        if error:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            sales, shortages, error = _take_items(items)
            if error:
                transaction.set_rollback(True)
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

            if shortages:
                transaction.set_rollback(True)
                return Response({'error': 'Not enough stock', 'shortages': shortages}, status=status.HTTP_400_BAD_REQUEST)

            grosses = [g.selling_price * pieces for g, _, pieces in sales]
            if discount > sum(grosses):
                transaction.set_rollback(True)
                return Response({'error': 'Discount cannot be more than the sale amount'}, status=status.HTTP_400_BAD_REQUEST)
            if payment_split and split_total(payment_split) != sum(grosses) - discount:
                transaction.set_rollback(True)
                return Response({'error': f'The two amounts need to add up to the sale total (₱{sum(grosses) - discount}).'}, status=status.HTTP_400_BAD_REQUEST)

            sale_group = uuid.uuid4().hex
            logs = []
            for (g, size, pieces), gross, share in zip(sales, grosses, _split_discount(discount, grosses)):
                logs.append(SaleLog.objects.create(
                    garment_name=g.name,
                    size=size,
                    quantity_sold=pieces,
                    profit_earned=g.profit_per_piece * pieces - share,
                    amount_sold=gross - share,
                    discount=share,
                    promo_code=promo_code,
                    sale_group=sale_group,
                    payment_method=payment_method,
                    payment_split=payment_split,
                    popup=popup,
                    sold_at=timezone.localdate(),
                    batch_name=g.batch_name,
                    garment_id=g.id,
                ))

        return Response({'sale_group': sale_group, 'records': SaleLogSerializer(logs, many=True).data, 'total': str(sum(grosses) - discount)})

    @action(detail=False, methods=['post'], url_path='fifo-restore')
    def fifo_restore(self, request):
        """Atomically restore `quantity` of `size` to the newest batch of a
        name+color(+category) product (LIFO — mirrors how restocks land on the
        newest batch). No-ops if no matching batch exists any more."""
        name = request.data.get('name')
        color = request.data.get('color')
        category = request.data.get('category')
        size = request.data.get('size')
        try:
            quantity = int(request.data.get('quantity', 0))
        except (TypeError, ValueError):
            quantity = 0

        if not name or not size or quantity <= 0:
            return Response({'error': 'name, size and a positive quantity are required'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            matching = self._matching_garments(name, color, category)
            if not matching:
                return Response({'restored': 0, 'note': 'No matching batch found to restore stock to'})

            newest = matching[-1]
            stock, _ = SizeStock.objects.select_for_update().get_or_create(garment=newest, size=size)
            stock.quantity += quantity
            stock.save()

        return Response({'restored': quantity, 'garment_id': newest.id})


logger = logging.getLogger(__name__)


@api_view(['GET', 'HEAD'])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """Tiny public check for uptime monitors: the app is running and can reach the database."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception:
        logger.exception('Health check: the database could not be reached')
        return Response({'status': 'database unavailable'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return Response({'status': 'ok'})


@api_view(['GET'])
@permission_classes([IsAdminUser])
def backup(request):
    """Download every shop record (styles, stock, sales, pre-orders, expenses) as one JSON file.

    Restore into an empty database with: python manage.py loaddata <file>.json
    Login accounts are left out, so the file holds no passwords.
    """
    buffer = io.StringIO()
    call_command('dumpdata', 'inventory', indent=2, stdout=buffer)
    filename = f"fleurette-backup-{timezone.localdate().isoformat()}.json"
    response = HttpResponse(buffer.getvalue(), content_type='application/json')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@api_view(['GET'])
def daily_sales_summary(request):
    date_str = request.query_params.get('date', str(timezone.localdate()))
    logs = SaleLog.objects.filter(sold_at=date_str)
    total_pieces = logs.aggregate(Sum('quantity_sold'))['quantity_sold__sum'] or 0
    total_profit = logs.aggregate(Sum('profit_earned'))['profit_earned__sum'] or 0.00
    return Response({
        'date': date_str,
        'total_pieces_sold': total_pieces,
        'total_profit_earned': round(float(total_profit), 2)
    })

def _sale_return_garment(record):
    """The batch record a sale took its stock from: its garment_id, else the same name in the
    same batch (newest first). None when that batch no longer has the style."""
    if record.garment_id:
        g = Garment.objects.filter(id=record.garment_id).first()
        if g:
            return g
    qs = Garment.objects.filter(name__iexact=_norm(record.garment_name))
    if record.batch_name:
        qs = qs.filter(batch_name__iexact=_norm(record.batch_name))
    return qs.order_by('-id').first()


@api_view(['POST'])
def edit_sale(request):
    """Change a recorded sale, all or nothing.

    record_ids: the sale's records. keep: [{id, quantity}] new quantity per record (a record
    left out, or set to 0, is removed). add: new items, same shape as record-sale items.
    discount / promo_code: the sale's discount, re-shared across the final records.
    payment_method: GCash, Maya, GoTyme, Cash, Installment or Split Payment, set on every record; left as it is if not sent.
    payment_split: for a Split Payment, [{method, amount}] x 2, adding up to the sale's new total.
    popup: pop-up event id, or empty for the boutique; left as it is if not sent.

    Removed or reduced pieces go back to the batch record they were taken from; increases
    are taken from that same batch record; new items are taken oldest batch first. Existing
    records keep the price they sold at; new items use the current selling price.
    """
    record_ids = request.data.get('record_ids') or []
    try:
        keep = {int(k['id']): int(k['quantity']) for k in (request.data.get('keep') or [])}
        record_ids = [int(i) for i in record_ids]
    except (TypeError, ValueError, KeyError):
        return Response({'error': 'record_ids and keep quantities must be numbers'}, status=status.HTTP_400_BAD_REQUEST)
    add_items = request.data.get('add') or []
    if not record_ids:
        return Response({'error': 'record_ids is required'}, status=status.HTTP_400_BAD_REQUEST)
    if any(q < 0 for q in keep.values()):
        return Response({'error': 'Quantities cannot be negative'}, status=status.HTTP_400_BAD_REQUEST)
    discount, promo_code = _sale_discount(request)
    if discount is None:
        return Response({'error': 'Discount must be a number of pesos, 0 or more'}, status=status.HTTP_400_BAD_REQUEST)

    def fail(body):
        transaction.set_rollback(True)
        return Response(body, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        records = list(SaleLog.objects.select_for_update().filter(id__in=record_ids).order_by('id'))
        if len(records) != len(set(record_ids)):
            return fail({'error': 'Some of this sale\'s records no longer exist. Refresh and try again.'})
        payment_method = _payment_method(request, records[0].payment_method)
        if payment_method is None:
            return fail({'error': PAYMENT_METHOD_ERROR})
        payment_split = []
        if payment_method == SPLIT_PAYMENT:
            payment_split, error = clean_payment_split(request.data.get('payment_split', records[0].payment_split))
            if error:
                return fail({'error': error})
        popup, error = _sale_popup(request, records[0].popup)
        if error:
            return fail({'error': error})

        sale_date = min(r.sold_at for r in records)
        sale_time = min((r.created_at for r in records if r.created_at), default=None)
        sale_status = records[0].status
        sale_group = next((r.sale_group for r in records if r.sale_group), '') or uuid.uuid4().hex
        lines, shortages = [], []  # lines: [record or None, garment, size, qty, unit_price, unit_profit]

        for r in records:
            old_qty = r.quantity_sold or 0
            new_qty = keep.get(r.id, 0)
            garment = _sale_return_garment(r)
            # Price and profit per piece as sold (adding back this record's discount share).
            share = r.discount or Decimal('0')
            if r.amount_sold is not None and old_qty:
                unit_price = (r.amount_sold + share) / old_qty
            else:
                unit_price = garment.selling_price if garment else Decimal('0')
            unit_profit = (r.profit_earned + share) / old_qty if old_qty else Decimal('0')

            change = new_qty - old_qty
            if change:
                if garment is None:
                    return fail({'error': f'"{r.garment_name}" can no longer be changed: its batch "{r.batch_name or "Uncategorized"}" no longer has it.'})
                stock, _ = SizeStock.objects.select_for_update().get_or_create(garment=garment, size=r.size)
                if change < 0:
                    stock.quantity += -change
                elif stock.quantity < change:
                    shortages.append({'item': r.garment_name, 'color': garment.color or '', 'size': r.size, 'requested': change, 'available': stock.quantity})
                    continue
                else:
                    stock.quantity -= change
                stock.save()

            if new_qty == 0:
                r.delete()
            else:
                lines.append([r, garment, r.size, new_qty, unit_price, unit_profit])

        taken, more_shortages, error = _take_items(add_items)
        if error:
            return fail({'error': error})
        shortages += more_shortages
        if shortages:
            return fail({'error': 'Not enough stock', 'shortages': shortages})
        for g, size, pieces in taken:
            lines.append([None, g, size, pieces, g.selling_price, g.profit_per_piece])
        if not lines:
            return fail({'error': 'A sale needs at least one item. Delete the sale instead.'})

        grosses = [(price * qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) for _, _, _, qty, price, _ in lines]
        if discount > sum(grosses):
            return fail({'error': 'Discount cannot be more than the sale amount'})
        if payment_split and split_total(payment_split) != sum(grosses) - discount:
            return fail({'error': f'The two amounts need to add up to the sale total (₱{sum(grosses) - discount}).'})

        saved = []
        for (record, g, size, qty, price, unit_profit), gross, share in zip(lines, grosses, _split_discount(discount, grosses)):
            profit = (unit_profit * qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) - share
            if record is None:
                record = SaleLog(garment_name=g.name, size=size, batch_name=g.batch_name, garment_id=g.id,
                                 sold_at=sale_date, status=sale_status, created_at=sale_time)
            record.quantity_sold = qty
            record.amount_sold = gross - share
            record.profit_earned = profit
            record.discount = share
            record.promo_code = promo_code
            record.sale_group = sale_group
            record.payment_method = payment_method
            record.payment_split = payment_split
            record.popup = popup
            record.save()
            saved.append(record)

    return Response({'sale_group': sale_group, 'records': SaleLogSerializer(saved, many=True).data,
                     'total': str(sum(grosses) - discount)})


@api_view(['GET'])
def sales_history_list(request):
    logs = SaleLog.objects.all().order_by('-id')
    serializer = SaleLogSerializer(logs, many=True)
    return Response(serializer.data)

# NEW: API endpoint to manage Batch Expenses
class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all().order_by('-date', '-id')
    serializer_class = ExpenseSerializer

class PopUpEventViewSet(viewsets.ModelViewSet):
    queryset = PopUpEvent.objects.all().order_by('-date', '-id')
    serializer_class = PopUpEventSerializer

    def destroy(self, request, *args, **kwargs):
        event = self.get_object()
        if event.sales.exists():
            return Response({'error': 'Sales were recorded at this pop-up, so it is kept for its revenue. Change those sales to another place first.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)


class UpcomingPopUpViewSet(viewsets.ReadOnlyModelViewSet):
    """Public: pop-up events that have not ended yet, soonest first."""
    serializer_class = PopUpEventSerializer
    authentication_classes = []  # public: an old admin token in the browser must not cause a 401
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def get_queryset(self):
        today = timezone.localdate()
        return PopUpEvent.objects.filter(Q(end_date__gte=today) | Q(end_date__isnull=True, date__gte=today)).order_by('date', 'start_time', 'id')


from .models import PreOrder
from .serializers import PreOrderSerializer

class PreOrderViewSet(viewsets.ModelViewSet):
    queryset = PreOrder.objects.all().order_by('-order_date', '-id')
    serializer_class = PreOrderSerializer


from rest_framework import generics

class SaleLogDetail(generics.RetrieveUpdateDestroyAPIView): # Must be this!
    queryset = SaleLog.objects.all()
    serializer_class = SaleLogSerializer
