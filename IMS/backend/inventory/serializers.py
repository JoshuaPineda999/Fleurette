import json
from rest_framework import serializers
from .models import Garment, SizeStock, SaleLog, Expense, PreOrder

class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = ['id', 'title', 'amount', 'date', 'breakdown']

class SaleLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleLog
        fields = ['id', 'garment_name', 'size', 'quantity_sold', 'profit_earned', 'sold_at']

class SizeStockSerializer(serializers.ModelSerializer):
    class Meta:
        model = SizeStock
        fields = ['id', 'size', 'quantity']

class GarmentSerializer(serializers.ModelSerializer):
    sizes = SizeStockSerializer(many=True, read_only=True)
    profit_per_piece = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_pieces = serializers.IntegerField(read_only=True)
    total_potential_profit = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    initial_sizes = serializers.JSONField(write_only=True, required=False)

    class Meta:
        model = Garment
        fields = [
            'id', 'batch_name', 'name', 'cost_price', 'selling_price', 'image', 
            'profit_per_piece', 'total_pieces', 'total_potential_profit', 
            'sizes', 'initial_sizes'
        ]

    def create(self, validated_data):
        initial_sizes = validated_data.pop('initial_sizes', {})
        garment = Garment.objects.create(**validated_data)
        for size_label in ['S', 'M', 'L', 'XL']:
            qty = initial_sizes.get(size_label, 0)
            try: safe_qty = int(qty)
            except (ValueError, TypeError): safe_qty = 0
            SizeStock.objects.create(garment=garment, size=size_label, quantity=safe_qty)
        return garment

    def update(self, instance, validated_data):
        initial_sizes = validated_data.pop('initial_sizes', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if initial_sizes is not None:
            if isinstance(initial_sizes, str):
                try: initial_sizes = json.loads(initial_sizes)
                except: initial_sizes = {}
            for size_label in ['S', 'M', 'L', 'XL']:
                if size_label in initial_sizes:
                    try:
                        safe_qty = int(initial_sizes[size_label])
                        stock, _ = SizeStock.objects.get_or_create(garment=instance, size=size_label)
                        stock.quantity = safe_qty
                        stock.save()
                    except (ValueError, TypeError): pass
        return instance

class PreOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = PreOrder
        fields = '__all__'