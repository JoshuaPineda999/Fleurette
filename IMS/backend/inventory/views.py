from rest_framework import viewsets, status
import logging
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.utils import timezone
from django.db import connection, transaction
from django.db.models import Sum
from .models import Garment, SizeStock, SaleLog, Expense

from .serializers import GarmentSerializer, SaleLogSerializer, ExpenseSerializer


def _norm(value):
    return str(value or '').strip().lower()


def _sale_discount(request):
    """Discount (pesos, whole sale) and promo code sent with a sale; None if the discount is invalid."""
    try:
        discount = Decimal(str(request.data.get('discount') or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None, ''
    if discount < 0:
        return None, ''
    return discount, str(request.data.get('promo_code') or '').strip()[:100]


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


def _take_items(items):
    """Take stock for sale items inside the caller's transaction.

    Each item is {size, quantity, garment_id} (that exact batch record) or
    {size, quantity, name, color, category} (oldest batch first across the product).
    Returns (taken, shortages, error): taken is [(garment, size, pieces)]. When
    shortages or error is set the caller must roll back.
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


class GarmentViewSet(viewsets.ModelViewSet):
    queryset = Garment.objects.all().order_by('id').prefetch_related('sizes')
    serializer_class = GarmentSerializer

    @action(detail=True, methods=['patch'])
    def update_stock(self, request, pk=None):
        garment = self.get_object()
        size_label = request.data.get('size')
        change = int(request.data.get('change', 0))
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
        Every record written gets the same sale_group. If any item is short on stock,
        nothing is sold and a 400 lists what is short.
        """
        items = request.data.get('items')
        if not isinstance(items, list) or not items:
            return Response({'error': 'items must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)
        discount, promo_code = _sale_discount(request)
        if discount is None:
            return Response({'error': 'Discount must be a number of pesos, 0 or more'}, status=status.HTTP_400_BAD_REQUEST)

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

        sale_date = min(r.sold_at for r in records)
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

        saved = []
        for (record, g, size, qty, price, unit_profit), gross, share in zip(lines, grosses, _split_discount(discount, grosses)):
            profit = (unit_profit * qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) - share
            if record is None:
                record = SaleLog(garment_name=g.name, size=size, batch_name=g.batch_name, garment_id=g.id,
                                 sold_at=sale_date, status=sale_status)
            record.quantity_sold = qty
            record.amount_sold = gross - share
            record.profit_earned = profit
            record.discount = share
            record.promo_code = promo_code
            record.sale_group = sale_group
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

from .models import PreOrder
from .serializers import PreOrderSerializer

class PreOrderViewSet(viewsets.ModelViewSet):
    queryset = PreOrder.objects.all().order_by('-order_date', '-id')
    serializer_class = PreOrderSerializer


from rest_framework import generics

class SaleLogDetail(generics.RetrieveUpdateDestroyAPIView): # Must be this!
    queryset = SaleLog.objects.all()
    serializer_class = SaleLogSerializer
