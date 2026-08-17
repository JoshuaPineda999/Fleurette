from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GarmentViewSet, daily_sales_summary, sales_history_list, ExpenseViewSet
from .views import PreOrderViewSet
from . import views

router = DefaultRouter()
router.register(r'garments', GarmentViewSet, basename='garment')
router.register(r'expenses', ExpenseViewSet, basename='expense') # NEW ROUTE
router.register(r'preorders', PreOrderViewSet, basename='preorder')

urlpatterns = [
    path('', include(router.urls)),
    path('sales/daily_summary/', daily_sales_summary, name='daily_sales_summary'),
    path('sales/history/', sales_history_list, name='sales_history_list'),
    path('sales/history/<int:pk>/', views.SaleLogDetail.as_view(), name='salelog-detail'),
]