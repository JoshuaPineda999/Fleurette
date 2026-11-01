from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GarmentViewSet, daily_sales_summary, sales_history_list, ExpenseViewSet
from .views import PreOrderViewSet
from . import views

router = DefaultRouter()
router.register(r'garments', GarmentViewSet, basename='garment')
router.register(r'catalog', views.CatalogViewSet, basename='catalog')
router.register(r'expenses', ExpenseViewSet, basename='expense') # NEW ROUTE
router.register(r'preorders', PreOrderViewSet, basename='preorder')

urlpatterns = [
    path('', include(router.urls)),
    path('health/', views.health, name='health'),
    path('backup/', views.backup, name='backup'),
    path('auth/token/', views.LoginView.as_view(), name='token_obtain'),
    path('auth/token/refresh/', views.RefreshLoginView.as_view(), name='token_refresh'),
    path('sales/daily_summary/', daily_sales_summary, name='daily_sales_summary'),
    path('sales/history/', sales_history_list, name='sales_history_list'),
    path('sales/edit/', views.edit_sale, name='edit_sale'),
    path('sales/history/<int:pk>/', views.SaleLogDetail.as_view(), name='salelog-detail'),
]