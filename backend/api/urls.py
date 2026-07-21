from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('accounts', views.AccountViewSet, basename='account')
router.register('projects', views.ProjectViewSet, basename='project')
router.register('transactions', views.TransactionViewSet, basename='transaction')
router.register('expenses', views.RecurringExpenseViewSet, basename='expense')
router.register('receivables', views.ReceivableViewSet, basename='receivable')
router.register('payables', views.PayableViewSet, basename='payable')

urlpatterns = [
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('me/', views.MeView.as_view(), name='me'),
    path('dashboard/', views.DashboardView.as_view(), name='dashboard'),
    path('forecast/<int:year>/<int:month>/', views.ForecastView.as_view(), name='forecast'),
    path('', include(router.urls)),
]
