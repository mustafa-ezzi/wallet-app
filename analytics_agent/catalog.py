"""Metric names that map to real WalletTrails models.

Money totals follow DashboardView: category "Bank Transfer" and rows with a
people_action are bookkeeping legs, not personal income or expense.
Active-user signals follow OpsDashboardView.
"""

APP_NAME = "wallettrails"
SCHEMA_VERSION = 1

RECORD_SERIES = (
    "users",
    "transactions",
    "accounts",
    "projects",
    "recurring_expenses",
    "receivables",
    "payables",
    "households",
    "household_expenses",
    "bank_sms_imports",
    "category_budgets",
    "support_threads",
    "entitlements",
)

ACCOUNT_TYPES = ("bank", "cash", "credit_card", "person", "other")
PROJECT_STATUSES = ("active", "completed", "paused", "stuck", "other")
PROJECT_INCOME_TYPES = (
    "recurring_monthly",
    "contract_monthly",
    "one_time",
    "one_time_installments",
    "other",
)
INSTALLMENT_STATUSES = ("ongoing", "completed", "stuck", "other")
BANK_SMS_STATUSES = ("pending", "approved", "rejected", "expired", "other")
BANK_SMS_SOURCES = ("paste", "android_sms", "share", "notification", "other")
SUPPORT_STATUSES = ("open", "waiting_user", "waiting_ops", "closed", "other")
ENTITLEMENT_PRODUCTS = (
    "premium_monthly",
    "premium_yearly",
    "premium_lifetime",
    "other",
)
DEVICE_PLATFORMS = ("android", "ios", "web", "unknown", "other")
USER_TYPES = ("student", "professional", "self_employed", "retired", "unset", "other")
MEMBERSHIP_STATUSES = ("invited", "active", "left", "declined", "other")
INACTIVITY_TIERS = ("none", "7d", "30d", "90d", "other")

MONEY_DEFINITION = (
    "Platform sum of Transaction.amount in PKR. Excludes category 'Bank Transfer' "
    "and rows with a non-empty people_action, matching DashboardView income and expense. "
    "No per-user amounts are included."
)

ANOMALY_RULE = (
    "Leave-one-out z-score on each day in the current window. A day is flagged when "
    "the other days have non-zero standard deviation and |z| >= 2, or when those days "
    "have zero variance and this day differs. Windows shorter than 7 days are not scored."
)

MIN_ANOMALY_DAYS = 7
ANOMALY_Z = 2.0
CATEGORY_LABEL_LIMIT = 48

SENSITIVE_KEYS = frozenset(
    {
        "email",
        "username",
        "password",
        "token",
        "raw_snippet",
        "notes",
        "phone",
        "ip_address",
        "first_name",
        "last_name",
        "google_sub",
        "people_link_code",
        "account_mask",
        "fingerprint",
        "invited_email",
        "secret",
        "api_key",
        "authorization",
        "name",
        "subject",
        "counterparty",
        "purchase_token",
        "purchase_token_hash",
    }
)
