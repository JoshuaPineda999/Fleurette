from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GarmentViewSet, daily_sales_summary, sales_history_list, ExpenseViewSet

router = DefaultRouter()
router.register(r'garments', GarmentViewSet, basename='garment')
router.register(r'expenses', ExpenseViewSet, basename='expense') # NEW ROUTE

urlpatterns = [
    path('', include(router.urls)),
    path('sales/daily_summary/', daily_sales_summary, name='daily_sales_summary'),
    path('sales/history/', sales_history_list, name='sales_history_list'),
]