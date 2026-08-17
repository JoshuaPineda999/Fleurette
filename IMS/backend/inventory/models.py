from django.db import models
from django.utils import timezone

class Garment(models.Model):
    batch_name = models.CharField(max_length=255, blank=True, null=True, default="Uncategorized")
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True, null=True, default="Uncategorized")  # NEW
    color = models.CharField(max_length=100, blank=True, null=True)                              # NEW
    cost_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)
    image = models.ImageField(upload_to='garments/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # ... rest of the code remains exactly the same

    @property
    def profit_per_piece(self):
        return self.selling_price - self.cost_price

    @property
    def total_pieces(self):
        return sum(item.quantity for item in self.sizes.all())

    @property
    def total_potential_profit(self):
        return self.total_pieces * self.profit_per_piece

    def __str__(self):
        return self.name

class SizeStock(models.Model):
    SIZE_CHOICES = [
        ('S', 'Small'),
        ('M', 'Medium'),
        ('L', 'Large'),
        ('XL', 'Extra Large'),
    ]
    garment = models.ForeignKey(Garment, related_name='sizes', on_delete=models.CASCADE)
    size = models.CharField(max_length=5, choices=SIZE_CHOICES)
    quantity = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('garment', 'size')

class SaleLog(models.Model):
    garment_name = models.CharField(max_length=255)
    size = models.CharField(max_length=5)
    quantity_sold = models.PositiveIntegerField(default=1)
    profit_earned = models.DecimalField(max_digits=10, decimal_places=2)
    sold_at = models.DateField(default=timezone.now)
    status = models.CharField(max_length=50, default='Pending') # <--- ADD THIS

# Update the Expense model at the bottom of models.py:
class Expense(models.Model):
    title = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.DateField(default=timezone.now)
    # NEW: Saves line-by-line itemized breakdown as JSON array
    breakdown = models.JSONField(default=list, blank=True, null=True)

    def __str__(self):
        return f"{self.title} - ₱{self.amount}"

class PreOrder(models.Model):
    customer_name = models.CharField(max_length=255)
    item_name = models.CharField(max_length=255)
    size = models.CharField(max_length=50)
    color = models.CharField(max_length=50)
    
    # NEW FIELDS:
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    down_payment = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    
    is_paid = models.BooleanField(default=False)
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    order_date = models.DateField(auto_now_add=True)
    status = models.CharField(max_length=50, default='Pending') # <--- ADD THIS

    def __str__(self):
        return f"{self.customer_name} - {self.item_name}"