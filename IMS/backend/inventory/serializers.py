import json
from rest_framework import serializers
from .models import Garment, SizeStock, SaleLog, Expense, PreOrder

class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = ['id', 'title', 'amount', 'date', 'breakdown', 'batch_name']

class SaleLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleLog
        fields = ['id', 'garment_name', 'size', 'quantity_sold', 'profit_earned', 'sold_at', 'status', 'batch_name', 'garment_id', 'amount_sold']

class SizeStockSerializer(serializers.ModelSerializer):
    class Meta:
        model = SizeStock
        fields = ['id', 'size', 'quantity']

def _norm_color(value):
    # Blank, null and the 'N/A' placeholder all mean "no colour" (same rule as the stock matching in views.py).
    v = str(value or '').strip().lower()
    return '' if v in ('', 'n/a') else v


class GarmentSerializer(serializers.ModelSerializer):
    sizes = SizeStockSerializer(many=True, read_only=True)
    profit_per_piece = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_pieces = serializers.IntegerField(read_only=True)
    total_potential_profit = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    initial_sizes = serializers.JSONField(write_only=True, required=False)

    class Meta:
        model = Garment
        fields = [
            'id', 'batch_name', 'name', 'category', 'color', 'cost_price', 'selling_price', 'image', 
            'profit_per_piece', 'total_pieces', 'total_potential_profit', 
            'sizes', 'initial_sizes'
        ]

    @staticmethod
    def _existing_photo_garment(name, color, category):
        """Newest garment with the same style name AND colour that has a photo (same category preferred).
        A photo of a different colour is never reused."""
        key = str(name or '').strip().lower()
        if not key:
            return None
        wanted_color = _norm_color(color)
        wanted_category = str(category or '').strip().lower()
        photos = [
            g for g in Garment.objects.filter(name__iexact=key).exclude(image__isnull=True).exclude(image='').order_by('-id')
            if _norm_color(g.color) == wanted_color
        ]
        same_category = [g for g in photos if str(g.category or '').strip().lower() == wanted_category]
        candidates = same_category or photos
        return candidates[0] if candidates else None

    def create(self, validated_data):
        initial_sizes = validated_data.pop('initial_sizes', {})
        if not validated_data.get('image'):
            # No new photo for this batch: reuse the photo of the same style and colour already in stock.
            existing = self._existing_photo_garment(
                validated_data.get('name'), validated_data.get('color'), validated_data.get('category'))
            if existing is not None:
                validated_data['image'] = existing.image.name
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
        fields = ['id', 'customer_name', 'address', 'item_name', 'size', 'color', 'price', 'down_payment', 'is_paid', 'balance', 'order_date', 'status', 'recipient_name', 'contact_number', 'items']