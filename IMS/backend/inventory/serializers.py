import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.conf import settings
from rest_framework import serializers
from .models import Garment, GarmentPhoto, SizeStock, SaleLog, Expense, PreOrder, OnlineOrder, PopUpEvent, SPLIT_PAYMENT, SPLIT_METHODS


def clean_payment_split(raw):
    """(rows, error): the two payments of a Split Payment, as [{method, amount}]."""
    if not isinstance(raw, list) or len(raw) != 2 or not all(isinstance(row, dict) for row in raw):
        return None, 'A split payment needs two modes of payment and an amount for each.'
    rows = []
    for row in raw:
        method = str(row.get('method') or '')
        if method not in SPLIT_METHODS:
            return None, 'Split a payment between GCash, Maya, GoTyme or Cash.'
        try:
            amount = Decimal(str(row.get('amount'))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        except (InvalidOperation, ValueError):
            return None, 'Enter the amount for both payments.'
        if not amount.is_finite() or amount <= 0:
            return None, 'Enter the amount for both payments.'
        rows.append({'method': method, 'amount': str(amount)})
    if rows[0]['method'] == rows[1]['method']:
        return None, 'Choose two different modes of payment.'
    return rows, None


# The tax added on an item's base price, when Add tax is ticked.
COST_TAX_PERCENT = Decimal('8')


def split_total(rows):
    return sum(Decimal(row['amount']) for row in rows)


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = ['id', 'title', 'amount', 'date', 'breakdown', 'batch_name']

class SaleLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleLog
        fields = ['id', 'garment_name', 'size', 'quantity_sold', 'profit_earned', 'sold_at', 'status', 'batch_name', 'garment_id', 'amount_sold', 'discount', 'promo_code', 'sale_group', 'payment_method', 'payment_split', 'popup', 'note', 'created_at']
        # Changed through Edit Sale, which checks a split against the sale's total.
        read_only_fields = ['payment_method', 'payment_split', 'popup', 'note']


class PopUpEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = PopUpEvent
        fields = ['id', 'name', 'venue', 'date', 'end_date', 'start_time', 'end_time', 'notes']

    def validate(self, attrs):
        date = attrs.get('date', getattr(self.instance, 'date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if date and end_date and end_date < date:
            raise serializers.ValidationError({'end_date': 'The last day cannot be before the first day.'})
        return attrs

class GarmentPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = GarmentPhoto
        fields = ['id', 'image']


class SizeStockSerializer(serializers.ModelSerializer):
    class Meta:
        model = SizeStock
        fields = ['id', 'size', 'quantity']

def _norm_name(value):
    return str(value or '').strip().lower()


def _norm_color(value):
    # Blank, null and the 'N/A' placeholder all mean "no colour" (same rule as the stock matching in views.py).
    v = str(value or '').strip().lower()
    return '' if v in ('', 'n/a') else v


class GarmentSerializer(serializers.ModelSerializer):
    sizes = SizeStockSerializer(many=True, read_only=True)
    photos = GarmentPhotoSerializer(many=True, read_only=True)
    profit_per_piece = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_pieces = serializers.IntegerField(read_only=True)
    total_potential_profit = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    initial_sizes = serializers.JSONField(write_only=True, required=False)
    description = serializers.CharField(required=False, allow_blank=True, max_length=1000, trim_whitespace=True)
    cost_base = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True)
    cost_tax_percent = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)

    class Meta:
        model = Garment
        fields = [
            'id', 'batch_name', 'batch_status', 'batch_hidden', 'name', 'category', 'color', 'description', 'cost_price', 'cost_base', 'cost_tax_percent', 'selling_price', 'image', 'photos', 
            'profit_per_piece', 'total_pieces', 'total_potential_profit', 
            'sizes', 'initial_sizes'
        ]

    def validate(self, attrs):
        # With a tax %, the cost price is worked out here: base price + tax, to the centavo.
        if 'cost_tax_percent' in attrs:
            percent = attrs['cost_tax_percent']
            if percent is None:
                attrs['cost_base'] = None
            elif percent != COST_TAX_PERCENT:
                raise serializers.ValidationError({'cost_tax_percent': f'The tax is fixed at {COST_TAX_PERCENT}%.'})
            else:
                base = attrs.get('cost_base')
                if base is None:
                    raise serializers.ValidationError({'cost_base': 'Enter the base price the tax is added to.'})
                attrs['cost_price'] = (base * (100 + percent) / 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        elif 'cost_price' in attrs:
            # A cost price typed straight in has no tax on it.
            attrs['cost_base'] = None
            attrs['cost_tax_percent'] = None
        return attrs

    def validate_image(self, image):
        if image and getattr(image, 'size', 0) > settings.MAX_IMAGE_UPLOAD_BYTES:
            raise serializers.ValidationError('Photo is too large (5 MB maximum).')
        return image

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

    @staticmethod
    def _share_description(name, description):
        # One description per style: every batch record with the style's name gets it.
        Garment.objects.filter(name__iexact=str(name or '').strip()).update(description=description)

    def create(self, validated_data):
        initial_sizes = validated_data.pop('initial_sizes', {})
        if validated_data.get('description'):
            self._share_description(validated_data.get('name'), validated_data['description'])
        else:
            # A new batch of a style already in stock keeps the style's description.
            same_style = Garment.objects.filter(name__iexact=str(validated_data.get('name') or '').strip()).exclude(description='').order_by('-id').first()
            validated_data['description'] = same_style.description if same_style else ''
        # A style added to a hidden batch stays hidden with the rest of the batch.
        if Garment.objects.filter(batch_name=validated_data.get('batch_name'), batch_hidden=True).exists():
            validated_data['batch_hidden'] = True
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
        # A style moved into an existing batch takes on that batch's visibility.
        new_batch = validated_data.get('batch_name')
        if new_batch is not None and new_batch != instance.batch_name:
            siblings = Garment.objects.filter(batch_name=new_batch)
            if siblings.exists():
                validated_data['batch_hidden'] = siblings.filter(batch_hidden=True).exists()
        if 'description' not in validated_data and 'name' in validated_data and _norm_name(validated_data['name']) != _norm_name(instance.name):
            # Renamed into another style: take that style's description, if it has one.
            other = Garment.objects.filter(name__iexact=str(validated_data['name']).strip()).exclude(pk=instance.pk).exclude(description='').order_by('-id').first()
            if other is not None:
                validated_data['description'] = other.description
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if 'description' in validated_data:
            self._share_description(instance.name, instance.description)
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

class CatalogGarmentSerializer(serializers.ModelSerializer):
    """What the public customer page may see: no cost price or profit."""
    sizes = SizeStockSerializer(many=True, read_only=True)
    photos = GarmentPhotoSerializer(many=True, read_only=True)
    total_pieces = serializers.IntegerField(read_only=True)

    class Meta:
        model = Garment
        fields = ['id', 'name', 'category', 'color', 'description', 'selling_price', 'image', 'photos', 'batch_status', 'sizes', 'total_pieces']


def online_order_summary(order):
    """The order written out for a Messenger chat."""
    lines = []
    for it in order.items:
        color = str(it.get('color') or '').strip()
        size = 'FS' if it.get('size') == 'XL' else it.get('size')
        color_text = f" ({color})" if color and color.upper() != 'N/A' else ''
        lines.append(f"- {it.get('item_name')}{color_text}, size {size} x{it.get('quantity')}: ₱{it.get('amount')}")
    totals = [f"Total: ₱{order.total}"]
    if order.discount > 0:
        code = f" ({order.promo_code})" if order.promo_code else ''
        totals = [f"Subtotal: ₱{order.total + order.discount}", f"Discount{code}: -₱{order.discount}", *totals]
    return '\n'.join([
        f"Hi Fleurette! I'd like to order. (Order {order.code})",
        f"Name: {order.customer_name}",
        f"Contact: {order.contact_number}",
        '',
        *lines,
        '',
        *totals,
    ])


class OnlineOrderSerializer(serializers.ModelSerializer):
    summary = serializers.SerializerMethodField()

    class Meta:
        model = OnlineOrder
        fields = ['id', 'code', 'customer_name', 'contact_number', 'items', 'total', 'discount', 'promo_code', 'status',
                  'created_at', 'expires_at', 'preorder_id', 'summary']

    def get_summary(self, order):
        return online_order_summary(order)


class PreOrderSerializer(serializers.ModelSerializer):
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0'), required=False)
    payment_split = serializers.JSONField(required=False, allow_null=True)

    class Meta:
        model = PreOrder
        fields = ['id', 'customer_name', 'address', 'item_name', 'size', 'color', 'price', 'discount', 'promo_code', 'payment_method', 'payment_split', 'down_payment', 'is_paid', 'balance', 'order_date', 'created_at', 'status', 'recipient_name', 'contact_number', 'items']

    def validate(self, data):
        if not {'payment_method', 'payment_split', 'down_payment', 'price'} & data.keys():
            return data
        current = lambda field, default: data.get(field, getattr(self.instance, field) if self.instance else default)
        if current('payment_method', '') != SPLIT_PAYMENT:
            data['payment_split'] = []
            return data
        rows, error = clean_payment_split(current('payment_split', None))
        if error:
            raise serializers.ValidationError({'payment_split': error})
        paid = Decimal(str(current('down_payment', 0)))
        if split_total(rows) != paid:
            raise serializers.ValidationError({'payment_split': f'The two amounts need to add up to the down payment (₱{paid}).'})
        if paid > Decimal(str(current('price', 0))):
            raise serializers.ValidationError({'down_payment': 'The down payment is more than the price.'})
        data['payment_split'] = rows
        return data