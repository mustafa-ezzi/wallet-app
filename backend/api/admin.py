"""
Django Admin for CashTrail.

Phase 0: finance models are superuser-only (emergency).
Staff day-to-day work should use the Ops panel (/api/ops/*), not transaction browsing.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import User

from .models import (
    Account,
    AdminAuditLog,
    AppRemoteConfig,
    CategoryBudget,
    DeviceToken,
    Entitlement,
    FxRateCache,
    Household,
    HouseholdExpense,
    HouseholdInvite,
    HouseholdLedger,
    HouseholdMembership,
    NotificationPreference,
    PayableInstallment,
    PeopleInvitation,
    PeopleLink,
    PeopleNotification,
    PeopleProposal,
    Project,
    PromoCode,
    PromoRedemption,
    PurchaseEvent,
    PushCampaign,
    PushCampaignDelivery,
    ReceivableInstallment,
    RecurringExpense,
    SupportMessage,
    SupportThread,
    Transaction,
    TravelMode,
    UserOpsMeta,
    UserProfile,
)


admin.site.site_header = 'CashTrail Admin'
admin.site.site_title = 'CashTrail'
admin.site.index_title = 'Emergency admin (prefer Ops panel for day-to-day)'


class SuperuserOnlyMixin:
    """Hide finance / sensitive models from non-superuser staff."""

    def has_module_permission(self, request):
        return bool(request.user.is_superuser)

    def has_view_permission(self, request, obj=None):
        return bool(request.user.is_superuser)

    def has_add_permission(self, request):
        return bool(request.user.is_superuser)

    def has_change_permission(self, request, obj=None):
        return bool(request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        return bool(request.user.is_superuser)


@admin.register(UserProfile)
class UserProfileAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('user', 'currency')
    search_fields = ('user__username', 'user__email')


@admin.register(Account)
class AccountAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'name', 'type', 'user', 'created_at')
    search_fields = ('name', 'user__username')


@admin.register(Project)
class ProjectAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'name', 'income_type', 'status', 'user')
    search_fields = ('name', 'user__username')


@admin.register(Transaction)
class TransactionAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'date', 'type', 'category', 'user', 'people_action')
    list_filter = ('type', 'people_action')
    search_fields = ('notes', 'user__username', 'category')


@admin.register(TravelMode)
class TravelModeAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('user', 'enabled', 'travel_currency', 'rate', 'updated_at')
    list_filter = ('enabled', 'travel_currency')
    search_fields = ('user__username', 'user__email')


@admin.register(FxRateCache)
class FxRateCacheAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('base', 'quote', 'rate', 'source', 'fetched_at')
    list_filter = ('base', 'quote')


@admin.register(PeopleInvitation)
class PeopleInvitationAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'from_user', 'to_user', 'status', 'invited_via', 'created_at')
    list_filter = ('status', 'invited_via')
    search_fields = ('from_user__email', 'to_user__email', 'query_snapshot')


@admin.register(PeopleLink)
class PeopleLinkAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'user_a', 'user_b', 'status', 'created_at')
    list_filter = ('status',)


@admin.register(PeopleProposal)
class PeopleProposalAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'action', 'amount', 'proposer', 'counterparty', 'status', 'created_at')
    list_filter = ('status', 'action')


@admin.register(PeopleNotification)
class PeopleNotificationAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'user', 'kind', 'title', 'read', 'created_at')
    list_filter = ('kind', 'read')


@admin.register(RecurringExpense)
class RecurringExpenseAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'name', 'user')
    search_fields = ('name', 'user__username')


@admin.register(ReceivableInstallment)
class ReceivableInstallmentAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'user', 'status')


@admin.register(PayableInstallment)
class PayableInstallmentAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'name', 'user', 'status')


@admin.register(CategoryBudget)
class CategoryBudgetAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'user', 'year', 'month', 'category', 'limit_amount', 'updated_at')
    list_filter = ('year', 'month', 'category')
    search_fields = ('user__username', 'user__email', 'category')


@admin.register(Household)
class HouseholdAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'name', 'created_at')


@admin.register(HouseholdMembership)
class HouseholdMembershipAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'household', 'user', 'role', 'status')


@admin.register(HouseholdInvite)
class HouseholdInviteAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'household', 'created_at')


@admin.register(HouseholdLedger)
class HouseholdLedgerAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'household', 'name')


@admin.register(HouseholdExpense)
class HouseholdExpenseAdmin(SuperuserOnlyMixin, admin.ModelAdmin):
    list_display = ('id', 'ledger', 'created_at')


# ── Ops-safe models (staff may view) ─────────────────────────────────────────

@admin.register(UserOpsMeta)
class UserOpsMetaAdmin(admin.ModelAdmin):
    list_display = (
        'user', 'inactivity_tier', 'suspended_at', 'marketing_opt_out',
        'last_seen_at', 'updated_at',
    )
    list_filter = ('inactivity_tier', 'marketing_opt_out')
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('updated_at',)


@admin.register(AdminAuditLog)
class AdminAuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'action', 'actor', 'target_type', 'target_id', 'ip_address')
    list_filter = ('action',)
    search_fields = ('action', 'target_id', 'actor__username')
    readonly_fields = (
        'actor', 'action', 'target_type', 'target_id', 'meta', 'ip_address', 'created_at',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    """Token string visible only to superusers; staff see platform + timestamps."""

    list_display = ('id', 'user', 'platform', 'updated_at', 'created_at')
    list_filter = ('platform',)
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('created_at', 'updated_at')

    def get_exclude(self, request, obj=None):
        if request.user.is_superuser:
            return ()
        return ('token',)


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = (
        'user', 'enabled', 'marketing_enabled', 'remind_payables',
        'remind_receivables', 'updated_at',
    )
    search_fields = ('user__username',)


@admin.register(PushCampaign)
class PushCampaignAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'title', 'audience', 'status', 'recipient_estimate',
        'sent_ok', 'sent_failed', 'scheduled_at', 'sent_at', 'created_by',
    )
    list_filter = ('status', 'audience')
    search_fields = ('title', 'body')
    readonly_fields = (
        'sent_ok', 'sent_failed', 'sent_at', 'recipient_estimate',
        'last_error', 'created_at', 'updated_at',
    )


@admin.register(PushCampaignDelivery)
class PushCampaignDeliveryAdmin(admin.ModelAdmin):
    list_display = ('id', 'campaign', 'user', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('user__username', 'expo_ticket_id')
    readonly_fields = (
        'campaign', 'user', 'device_token', 'token_snapshot',
        'status', 'expo_ticket_id', 'error', 'created_at',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(SupportThread)
class SupportThreadAdmin(admin.ModelAdmin):
    list_display = ('id', 'subject', 'user', 'category', 'status', 'priority', 'updated_at')
    list_filter = ('status', 'category', 'priority')
    search_fields = ('subject', 'user__username', 'user__email')


@admin.register(SupportMessage)
class SupportMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'thread', 'sender', 'author', 'created_at')
    list_filter = ('sender',)
    search_fields = ('body', 'thread__subject', 'author__username')
    readonly_fields = ('thread', 'sender', 'author', 'body', 'created_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Entitlement)
class EntitlementAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'user', 'product_id', 'source', 'status',
        'started_at', 'expires_at', 'granted_by',
    )
    list_filter = ('status', 'source', 'product_id')
    search_fields = ('user__username', 'user__email', 'order_id', 'note')
    readonly_fields = ('purchase_token_hash', 'created_at', 'updated_at')


@admin.register(PurchaseEvent)
class PurchaseEventAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'product_id', 'status', 'order_id', 'created_at')
    list_filter = ('status', 'product_id')
    search_fields = ('user__username', 'order_id', 'error')
    readonly_fields = (
        'user', 'product_id', 'purchase_token_hash', 'order_id', 'package_name',
        'status', 'raw_summary', 'error', 'entitlement', 'created_at', 'updated_at',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(AppRemoteConfig)
class AppRemoteConfigAdmin(admin.ModelAdmin):
    list_display = (
        'key', 'ads_enabled', 'banner_enabled', 'interstitial_enabled',
        'premium_hides_ads', 'updated_at', 'updated_by',
    )
    readonly_fields = ('updated_at',)


@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = (
        'code', 'product_id', 'trial_days', 'redemption_count',
        'max_redemptions', 'active', 'created_at',
    )
    list_filter = ('active', 'product_id')
    search_fields = ('code', 'note')


@admin.register(PromoRedemption)
class PromoRedemptionAdmin(admin.ModelAdmin):
    list_display = ('id', 'promo', 'user', 'created_at')
    search_fields = ('promo__code', 'user__username')
    readonly_fields = ('promo', 'user', 'entitlement', 'created_at')

    def has_add_permission(self, request):
        return False


# Safer User list for staff: no password hash editing beyond Django defaults,
# but hide nothing critical — staff need is_staff / is_active for ops setup.
try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass


@admin.register(User)
class OpsAwareUserAdmin(DjangoUserAdmin):
    list_display = ('username', 'email', 'is_staff', 'is_active', 'date_joined', 'last_login')
    list_filter = ('is_staff', 'is_active', 'is_superuser')
