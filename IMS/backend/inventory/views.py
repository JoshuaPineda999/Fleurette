from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum
from .models import Garment, SizeStock, SaleLog, Expense
from .serializers import GarmentSerializer, SaleLogSerializer, ExpenseSerializer

class GarmentViewSet(viewsets.ModelViewSet):
    queryset = Garment.objects.all().prefetch_related('sizes')
    serializer_class = GarmentSerializer

    @action(detail=True, methods=['patch'])
    def update_stock(self, request, pk=None):
        garment = self.get_object()
        size_label = request.data.get('size')
        change = int(request.data.get('change', 0))
        is_sale = request.data.get('is_sale', False)

        try:
            stock = garment.sizes.get(size=size_label)
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
                    sold_at=timezone.now().date()
                )
            return Response(GarmentSerializer(garment).data)
        except SizeStock.DoesNotExist:
            return Response({'error': 'Size not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET'])
def daily_sales_summary(request):
    date_str = request.query_params.get('date', str(timezone.now().date()))
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