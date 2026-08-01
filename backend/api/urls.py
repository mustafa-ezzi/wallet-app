from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import household_api
from . import devices_api
from . import password_reset_api
from . import ops_api
from . import ops_campaigns_api

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
    path('jobs/push-campaigns/', devices_api.PushCampaignsJobView.as_view(), name='jobs-push-campaigns'),
    # Ops panel (staff only)
    path('ops/me/', ops_api.OpsMeView.as_view(), name='ops-me'),
    path('ops/dashboard/', ops_api.OpsDashboardView.as_view(), name='ops-dashboard'),
    path('ops/users/', ops_api.OpsUserListView.as_view(), name='ops-users'),
    path('ops/users/refresh-inactivity/', ops_api.OpsRefreshInactivityView.as_view(), name='ops-refresh-inactivity'),
    path('ops/users/<int:user_id>/', ops_api.OpsUserDetailView.as_view(), name='ops-user-detail'),
    path('ops/users/<int:user_id>/suspend/', ops_api.OpsUserSuspendView.as_view(), name='ops-user-suspend'),
    path('ops/users/<int:user_id>/unsuspend/', ops_api.OpsUserUnsuspendView.as_view(), name='ops-user-unsuspend'),
    path('ops/campaigns/', ops_campaigns_api.OpsCampaignListCreateView.as_view(), name='ops-campaigns'),
    path('ops/campaigns/estimate/', ops_campaigns_api.OpsCampaignEstimateView.as_view(), name='ops-campaigns-estimate'),
    path('ops/campaigns/<int:campaign_id>/', ops_campaigns_api.OpsCampaignDetailView.as_view(), name='ops-campaign-detail'),
    path('ops/campaigns/<int:campaign_id>/send/', ops_campaigns_api.OpsCampaignSendView.as_view(), name='ops-campaign-send'),
    path('ops/campaigns/<int:campaign_id>/cancel/', ops_campaigns_api.OpsCampaignCancelView.as_view(), name='ops-campaign-cancel'),
    path('', include(router.urls)),
]
