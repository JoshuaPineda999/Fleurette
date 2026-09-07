from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum
from .models import Garment, SizeStock, SaleLog, Expense

from .serializers import GarmentSerializer, SaleLogSerializer, ExpenseSerializer


def _norm(value):
    return str(value or '').strip().lower()


class GarmentViewSet(viewsets.ModelViewSet):
    queryset = Garment.objects.all().order_by('id').prefetch_related('sizes')
    serializer_class = GarmentSerializer

    @action(detail=True, methods=['patch'])
    def update_stock(self, request, pk=None):
        garment = self.get_object()
        size_label = request.data.get('size')
        change = int(request.data.get('change', 0))
        is_sale = request.data.get('is_sale', False)

        try:
            with transaction.atomic():
                stock = garment.sizes.select_for_update().get(size=size_label)
                if stock.quantity + change < 0:
                    return Response({'error': 'Stock cannot be negative'}, status=status.HTTP_400_BAD_REQUEST)
                stock.quantity += change
                stock.save()

                if change < 0 and is_sale:
                    qty_sold = abs(change)
                    profit = garment.profit_per_piece * qty_sold
                    SaleLog.objects.create(
                        garment_name=garment.name,
                        size=size_label,
                        quantity_sold=qty_sold,
                        profit_earned=profit,
                        sold_at=timezone.localdate(),
                        batch_name=garment.batch_name
                    )
            return Response(GarmentSerializer(garment).data)
        except SizeStock.DoesNotExist:
            return Response({'error': 'Size not found'}, status=status.HTTP_404_NOT_FOUND)

    def _matching_garments(self, name, color, category):
        """Garments considered the same visual product (mirrors the frontend's
        mergeGarments grouping key), oldest id first."""
        qs = Garment.objects.filter(name__iexact=_norm(name))
        matches = []
        for g in qs:
            if _norm(g.color) != _norm(color):
                continue
            if category and _norm(g.category) != _norm(category):
                continue
            matches.append(g)
        matches.sort(key=lambda g: g.id)
        return matches

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

                if is_sale and deduct > 0:
                    profit = g.profit_per_piece * deduct
                    SaleLog.objects.create(
                        garment_name=g.name,
                        size=size,
                        quantity_sold=deduct,
                        profit_earned=profit,
                        sold_at=timezone.localdate(),
                        batch_name=g.batch_name
                    )

        return Response({'deducted': deducted_total, 'requested': quantity})

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
