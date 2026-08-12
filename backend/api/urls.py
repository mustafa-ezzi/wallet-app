from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import household_api
from . import devices_api
from . import password_reset_api
from . import ops_api
from . import ops_campaigns_api
from . import support_api
from . import premium_api
from . import remote_config_api
from . import phase5_api
from . import health

from . import travel_people_api
from . import people_linked_api

router = DefaultRouter()
router.register('accounts', views.AccountViewSet, basename='account')
router.register('projects', views.ProjectViewSet, basename='project')
router.register('transactions', views.TransactionViewSet, basename='transaction')
router.register('expenses', views.RecurringExpenseViewSet, basename='expense')
router.register('receivables', views.ReceivableViewSet, basename='receivable')
router.register('payables', views.PayableViewSet, basename='payable')
router.register('people', travel_people_api.PeopleViewSet, basename='people')
router.register('households', household_api.HouseholdViewSet, basename='household')
router.register('household-ledgers', household_api.HouseholdLedgerViewSet, basename='household-ledger')
router.register('household-expenses', household_api.HouseholdExpenseViewSet, basename='household-expense')
router.register('household-contributions', household_api.HouseholdContributionViewSet, basename='household-contribution')
router.register('household-notifications', household_api.HouseholdNotificationViewSet, basename='household-notification')
router.register('devices', devices_api.DeviceTokenViewSet, basename='device')

urlpatterns = [
    path('health/', health.ApiHealthView.as_view(), name='api-health'),
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/forgot-password/', password_reset_api.ForgotPasswordView.as_view(), name='forgot-password'),
    path('auth/verify-reset-otp/', password_reset_api.VerifyResetOTPView.as_view(), name='verify-reset-otp'),
    path('auth/reset-password/', password_reset_api.ResetPasswordView.as_view(), name='reset-password'),
    path('me/', views.MeView.as_view(), name='me'),
    path('dashboard/', views.DashboardView.as_view(), name='dashboard'),
    path('forecast/<int:year>/<int:month>/', views.ForecastView.as_view(), name='forecast'),
    path('fx/', travel_people_api.FxQuoteView.as_view(), name='fx-quote'),
    path('travel-mode/', travel_people_api.TravelModeView.as_view(), name='travel-mode'),
    # Linked People (Phase G)
    path('people/link-code/', people_linked_api.PeopleLinkCodeView.as_view(), name='people-link-code'),
    path('people/invitations/', people_linked_api.PeopleInvitationCreateView.as_view(), name='people-invitations-create'),
    path('people/invitations/pending/', people_linked_api.PeopleInvitationPendingView.as_view(), name='people-invitations-pending'),
    path('people/invitations/join/', people_linked_api.PeopleJoinByCodeView.as_view(), name='people-invitations-join'),
    path(
        'people/invitations/<int:pk>/<str:action_name>/',
        people_linked_api.PeopleInvitationActionView.as_view(),
        name='people-invitations-action',
    ),
    path('people/links/', people_linked_api.PeopleLinkListView.as_view(), name='people-links'),
    path('people/links/<int:pk>/unlink/', people_linked_api.PeopleLinkUnlinkView.as_view(), name='people-links-unlink'),
    path('people/proposals/', people_linked_api.PeopleProposalCreateView.as_view(), name='people-proposals-create'),
    path('people/proposals/pending/', people_linked_api.PeopleProposalPendingView.as_view(), name='people-proposals-pending'),
    path(
        'people/proposals/<int:pk>/<str:action_name>/',
        people_linked_api.PeopleProposalActionView.as_view(),
        name='people-proposals-action',
    ),
    path('people/notifications/', people_linked_api.PeopleNotificationListView.as_view(), name='people-notifications'),
    path(
        'people/notifications/mark_all_read/',
        people_linked_api.PeopleNotificationMarkReadView.as_view(),
        name='people-notifications-mark-all',
    ),
    path(
        'people/notifications/<int:pk>/mark_read/',
        people_linked_api.PeopleNotificationMarkReadView.as_view(),
        name='people-notifications-mark-one',
    ),
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
    path('jobs/refresh-inactivity/', devices_api.RefreshInactivityJobView.as_view(), name='jobs-refresh-inactivity'),
    # Ops panel (staff only)
    path('ops/me/', ops_api.OpsMeView.as_view(), name='ops-me'),
    path('ops/dashboard/', ops_api.OpsDashboardView.as_view(), name='ops-dashboard'),
    path('ops/users/', ops_api.OpsUserListView.as_view(), name='ops-users'),
    path('ops/users/refresh-inactivity/', ops_api.OpsRefreshInactivityView.as_view(), name='ops-refresh-inactivity'),
    path('ops/users/export/', phase5_api.OpsUsersExportView.as_view(), name='ops-users-export'),
    path('ops/users/<int:user_id>/', ops_api.OpsUserDetailView.as_view(), name='ops-user-detail'),
    path('ops/users/<int:user_id>/suspend/', ops_api.OpsUserSuspendView.as_view(), name='ops-user-suspend'),
    path('ops/users/<int:user_id>/unsuspend/', ops_api.OpsUserUnsuspendView.as_view(), name='ops-user-unsuspend'),
    path('ops/campaigns/', ops_campaigns_api.OpsCampaignListCreateView.as_view(), name='ops-campaigns'),
    path('ops/campaigns/estimate/', ops_campaigns_api.OpsCampaignEstimateView.as_view(), name='ops-campaigns-estimate'),
    path('ops/campaigns/<int:campaign_id>/', ops_campaigns_api.OpsCampaignDetailView.as_view(), name='ops-campaign-detail'),
    path('ops/campaigns/<int:campaign_id>/send/', ops_campaigns_api.OpsCampaignSendView.as_view(), name='ops-campaign-send'),
    path('ops/campaigns/<int:campaign_id>/cancel/', ops_campaigns_api.OpsCampaignCancelView.as_view(), name='ops-campaign-cancel'),
    # Support (user)
    path('support/threads/', support_api.SupportThreadListCreateView.as_view(), name='support-threads'),
    path('support/threads/<int:thread_id>/', support_api.SupportThreadDetailView.as_view(), name='support-thread-detail'),
    path('support/threads/<int:thread_id>/reply/', support_api.SupportThreadReplyView.as_view(), name='support-thread-reply'),
    # Support (ops)
    path('ops/support/', support_api.OpsSupportListView.as_view(), name='ops-support'),
    path('ops/support/<int:thread_id>/', support_api.OpsSupportDetailView.as_view(), name='ops-support-detail'),
    path('ops/support/<int:thread_id>/reply/', support_api.OpsSupportReplyView.as_view(), name='ops-support-reply'),
    path('ops/support/<int:thread_id>/status/', support_api.OpsSupportStatusView.as_view(), name='ops-support-status'),
    # Premium (user + ops) — Phase 4
    path('premium/', premium_api.PremiumMeView.as_view(), name='premium-me'),
    path('premium/verify/', premium_api.PremiumVerifyView.as_view(), name='premium-verify'),
    path('premium/redeem/', phase5_api.PremiumRedeemView.as_view(), name='premium-redeem'),
    path('ops/premium/', premium_api.OpsPremiumListView.as_view(), name='ops-premium'),
    path('ops/premium/stats/', premium_api.OpsPremiumStatsView.as_view(), name='ops-premium-stats'),
    path('ops/premium/grant/', premium_api.OpsPremiumGrantView.as_view(), name='ops-premium-grant'),
    path('ops/premium/<int:entitlement_id>/revoke/', premium_api.OpsPremiumRevokeView.as_view(), name='ops-premium-revoke'),
    path('ops/premium/purchases/', premium_api.OpsPurchaseQueueView.as_view(), name='ops-premium-purchases'),
    path('ops/promos/', phase5_api.OpsPromoListCreateView.as_view(), name='ops-promos'),
    path('ops/promos/<int:promo_id>/', phase5_api.OpsPromoDetailView.as_view(), name='ops-promo-detail'),
    path('ops/audit/', phase5_api.OpsAuditListView.as_view(), name='ops-audit'),
    # Remote ads / feature config
    path('config/', remote_config_api.AppConfigView.as_view(), name='app-config'),
    path('ops/config/', remote_config_api.OpsConfigView.as_view(), name='ops-config'),
    path('', include(router.urls)),
]
