from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import household_api
from . import devices_api
from . import password_reset_api

router = DefaultRouter()
router.register('accounts', views.AccountViewSet, basename='account')
router.register('projects', views.ProjectViewSet, basename='project')
router.register('transactions', views.TransactionViewSet, basename='transaction')
router.register('expenses', views.RecurringExpenseViewSet, basename='expense')
router.register('receivables', views.ReceivableViewSet, basename='receivable')
router.register('payables', views.PayableViewSet, basename='payable')
router.register('households', household_api.HouseholdViewSet, basename='household')
router.register('household-ledgers', household_api.HouseholdLedgerViewSet, basename='household-ledger')
router.register('household-expenses', household_api.HouseholdExpenseViewSet, basename='household-expense')
router.register('household-contributions', household_api.HouseholdContributionViewSet, basename='household-contribution')
router.register('household-notifications', household_api.HouseholdNotificationViewSet, basename='household-notification')
router.register('devices', devices_api.DeviceTokenViewSet, basename='device')

urlpatterns = [
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/forgot-password/', password_reset_api.ForgotPasswordView.as_view(), name='forgot-password'),
    path('auth/verify-reset-otp/', password_reset_api.VerifyResetOTPView.as_view(), name='verify-reset-otp'),
    path('auth/reset-password/', password_reset_api.ResetPasswordView.as_view(), name='reset-password'),
    path('me/', views.MeView.as_view(), name='me'),
    path('dashboard/', views.DashboardView.as_view(), name='dashboard'),
    path('forecast/<int:year>/<int:month>/', views.ForecastView.as_view(), name='forecast'),
    path('households/join/preview/', household_api.JoinPreviewView.as_view(), name='household-join-preview'),
    path('households/join/', household_api.JoinAcceptView.as_view(), name='household-join'),
    path('households/invitations/pending/', household_api.PendingInvitationsView.as_view(), name='household-pending'),
    path(
        'households/invitations/<int:pk>/<str:action_name>/',
        household_api.PendingInvitationActionView.as_view(),
        name='household-pending-action',
    ),
    path('notification-preferences/', devices_api.NotificationPreferenceView.as_view(), name='notification-preferences'),
    path('jobs/due-reminders/', devices_api.DueRemindersJobView.as_view(), name='jobs-due-reminders'),
    path('', include(router.urls)),
]
