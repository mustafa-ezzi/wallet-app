"""Read-only aggregates. This module never inserts, updates, or deletes."""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta

from analytics_agent.catalog import RECORD_SERIES
from analytics_agent.config import require_database_url
from analytics_agent.db import assert_database_ready, enforce_read_only, setup_django
from analytics_agent.errors import ConfigError, FetchError

logger = logging.getLogger("analytics_agent.fetch")


def connection_error_message(host: str, exc: BaseException) -> str:
    """Operator-facing text. Never include the database URL or password."""
    text = str(exc).lower()
    if host.endswith(".railway.internal") or host.endswith(".internal"):
        return (
            f"Cannot resolve database host {host!r} from this computer. "
            "That name only exists on Railway's private network. "
            "Open the Postgres service in Railway, turn on public networking, "
            "and put the public DATABASE_URL (a host like *.proxy.rlwy.net) in analytics_agent/.env."
        )
    if "getaddrinfo" in text or "name or service not known" in text or "nodename nor servname" in text:
        return (
            f"Cannot resolve database host {host!r}. "
            "Check DATABASE_URL in analytics_agent/.env."
        )
    return f"Database read failed ({type(exc).__name__})."


def fetch_snapshot(config, *, now: datetime, period) -> dict:
    from django.db import DatabaseError, connection

    try:
        require_database_url()
    except ConfigError as exc:
        raise FetchError(str(exc)) from exc
    setup_django(config.backend_dir, config.db_timeout_seconds)
    assert_database_ready()
    try:
        enforce_read_only(connection, config.db_timeout_seconds)
        snapshot = _collect(config, now=now, period=period)
        logger.info(
            "fetched read-only snapshot users=%s transactions=%s",
            snapshot["totals"]["users"],
            snapshot["totals"]["transactions"],
        )
        return snapshot
    except DatabaseError as exc:
        from django.conf import settings

        host = str(settings.DATABASES["default"].get("HOST") or "")
        raise FetchError(connection_error_message(host, exc)) from exc
    finally:
        connection.close()


def _bounds(period, tz):
    current_start = datetime.combine(period.start, time.min, tzinfo=tz)
    current_end = datetime.combine(period.end + timedelta(days=1), time.min, tzinfo=tz)
    previous_start = datetime.combine(period.previous_start, time.min, tzinfo=tz)
    previous_end = datetime.combine(period.previous_end + timedelta(days=1), time.min, tzinfo=tz)
    return current_start, current_end, previous_start, previous_end


def _count_between(model, field: str, start: datetime, end: datetime) -> int:
    return model.objects.filter(**{f"{field}__gte": start, f"{field}__lt": end}).count()


def _grouped(queryset, field: str) -> dict[str, int]:
    from django.db.models import Count

    rows = queryset.values(field).annotate(total=Count("id"))
    return {str(row[field] or ""): int(row["total"]) for row in rows}


def _date_key(value) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()[:10]
    return str(value)[:10]


def _collect(config, *, now: datetime, period) -> dict:
    from django.contrib.auth.models import User
    from django.db.models import Count, Q, Sum

    from api.models import (
        Account,
        BankSmsImport,
        BankSmsImportSettings,
        CategoryBudget,
        DeviceToken,
        Entitlement,
        Household,
        HouseholdExpense,
        HouseholdMembership,
        PayableInstallment,
        Project,
        ReceivableInstallment,
        RecurringExpense,
        SupportThread,
        Transaction,
        TravelMode,
        UserOpsMeta,
        UserProfile,
    )
    from analytics_agent.periods import require_zone

    zone = require_zone(config.timezone)
    current_start, current_end, previous_start, previous_end = _bounds(period, zone)
    personal = ~Q(category="Bank Transfer") & ~Q(people_action__gt="")

    created_models = {
        "users": (User, "date_joined"),
        "transactions": (Transaction, "created_at"),
        "accounts": (Account, "created_at"),
        "projects": (Project, "created_at"),
        "recurring_expenses": (RecurringExpense, "created_at"),
        "receivables": (ReceivableInstallment, "created_at"),
        "payables": (PayableInstallment, "created_at"),
        "households": (Household, "created_at"),
        "household_expenses": (HouseholdExpense, "created_at"),
        "bank_sms_imports": (BankSmsImport, "created_at"),
        "category_budgets": (CategoryBudget, "created_at"),
        "support_threads": (SupportThread, "created_at"),
        "entitlements": (Entitlement, "created_at"),
    }
    totals = {name: model.objects.count() for name, (model, _field) in created_models.items()}
    new_current = {
        name: _count_between(model, field, current_start, current_end)
        for name, (model, field) in created_models.items()
    }
    new_previous = {
        name: _count_between(model, field, previous_start, previous_end)
        for name, (model, field) in created_models.items()
    }
    missing = [name for name in RECORD_SERIES if name not in totals]
    if missing:
        raise FetchError(f"Snapshot is missing record series: {', '.join(missing)}")

    tx_rows = (
        Transaction.objects.filter(date__gte=period.previous_start, date__lte=period.end)
        .values("date")
        .annotate(
            transactions=Count("id"),
            income_pkr=Sum("amount", filter=Q(type="income") & personal),
            expense_pkr=Sum("amount", filter=Q(type="expense") & personal),
        )
    )
    by_day: dict[str, dict] = {}
    for row in tx_rows:
        key = _date_key(row["date"])
        by_day[key] = {
            "date": key,
            "transactions": int(row["transactions"] or 0),
            "signups": 0,
            "income_pkr": row["income_pkr"] or 0,
            "expense_pkr": row["expense_pkr"] or 0,
        }
    joined_at = User.objects.filter(
        date_joined__gte=previous_start,
        date_joined__lt=current_end,
    ).values_list("date_joined", flat=True)
    for joined in joined_at:
        if joined.tzinfo is None:
            joined = joined.replace(tzinfo=zone)
        key = joined.astimezone(zone).date().isoformat()
        slot = by_day.setdefault(
            key,
            {
                "date": key,
                "transactions": 0,
                "signups": 0,
                "income_pkr": 0,
                "expense_pkr": 0,
            },
        )
        slot["signups"] += 1

    def _window(start, end) -> list[dict]:
        start_key = start.isoformat()
        end_key = end.isoformat()
        return [row for key, row in by_day.items() if start_key <= key <= end_key]

    def _categories(tx_type: str) -> list[dict]:
        rows = (
            Transaction.objects.filter(
                type=tx_type,
                date__gte=period.start,
                date__lte=period.end,
            )
            .exclude(category="Bank Transfer")
            .exclude(people_action__gt="")
            .values("category")
            .annotate(count=Count("id"), amount_pkr=Sum("amount"))
        )
        return [
            {
                "category": row["category"] or "",
                "count": int(row["count"] or 0),
                "amount_pkr": row["amount_pkr"] or 0,
            }
            for row in rows
        ]

    period_tx = Transaction.objects.filter(date__gte=period.start, date__lte=period.end)
    user_types = _grouped(UserProfile.objects.all(), "user_type")
    missing_profiles = User.objects.filter(profile__isnull=True).count()
    user_types[""] = user_types.get("", 0) + missing_profiles

    def _active(since: datetime) -> int:
        return (
            User.objects.filter(
                Q(last_login__gte=since)
                | Q(ops_meta__last_seen_at__gte=since)
                | Q(transactions__created_at__gte=since)
                | Q(device_tokens__updated_at__gte=since)
            )
            .distinct()
            .count()
        )

    live_premium = Entitlement.objects.filter(status=Entitlement.STATUS_ACTIVE).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now)
    )
    onboarding_complete = UserProfile.objects.filter(onboarding_complete=True).count()

    return {
        "generated_at": now,
        "cron": config.cron,
        "category_limit": config.category_limit,
        "period": period.as_dict(),
        "totals": totals,
        "new_current": new_current,
        "new_previous": new_previous,
        "daily_current": _window(period.start, period.end),
        "daily_previous": _window(period.previous_start, period.previous_end),
        "excluded_rows": {
            "bank_transfer": period_tx.filter(category="Bank Transfer").count(),
            "people_action": period_tx.filter(people_action__gt="").count(),
        },
        "breakdowns": {
            "account_type": _grouped(Account.objects.all(), "type"),
            "project_status": _grouped(Project.objects.all(), "status"),
            "project_income_type": _grouped(Project.objects.all(), "income_type"),
            "payable_status": _grouped(PayableInstallment.objects.all(), "status"),
            "receivable_status": _grouped(ReceivableInstallment.objects.all(), "status"),
            "recurring_expenses": {
                "active": RecurringExpense.objects.filter(active=True).count(),
                "inactive": RecurringExpense.objects.filter(active=False).count(),
            },
            "household_membership_status": _grouped(HouseholdMembership.objects.all(), "status"),
            "bank_sms_status": _grouped(BankSmsImport.objects.all(), "status"),
            "bank_sms_source": _grouped(BankSmsImport.objects.all(), "source"),
            "support_status": _grouped(SupportThread.objects.all(), "status"),
            "entitlement_product_live": _grouped(live_premium, "product_id"),
            "device_platform": _grouped(DeviceToken.objects.all(), "platform"),
            "user_type": user_types,
            "expense_categories": _categories("expense"),
            "income_categories": _categories("income"),
        },
        "audience": {
            "active_1d": _active(now - timedelta(days=1)),
            "active_7d": _active(now - timedelta(days=7)),
            "active_30d": _active(now - timedelta(days=30)),
            "suspended": User.objects.filter(
                Q(is_active=False) | Q(ops_meta__suspended_at__isnull=False)
            ).distinct().count(),
            "onboarding_complete": onboarding_complete,
            "onboarding_incomplete": totals["users"] - onboarding_complete,
            "new_24h": User.objects.filter(date_joined__gte=now - timedelta(days=1)).count(),
            "new_7d": User.objects.filter(date_joined__gte=now - timedelta(days=7)).count(),
            "inactivity": _grouped(UserOpsMeta.objects.all(), "inactivity_tier"),
            "premium_live": live_premium.count(),
            "push_tokens": DeviceToken.objects.count(),
            "users_with_push": DeviceToken.objects.values("user_id").distinct().count(),
            "support_open": SupportThread.objects.exclude(status=SupportThread.STATUS_CLOSED).count(),
            "support_waiting_ops": SupportThread.objects.filter(
                status=SupportThread.STATUS_WAITING_OPS
            ).count(),
            "support_waiting_user": SupportThread.objects.filter(
                status=SupportThread.STATUS_WAITING_USER
            ).count(),
            "households_total": totals["households"],
            "budgets_current_month": CategoryBudget.objects.filter(
                year=period.end.year,
                month=period.end.month,
            ).count(),
            "budgets_overall_current_month": CategoryBudget.objects.filter(
                year=period.end.year,
                month=period.end.month,
                category=CategoryBudget.ALL_CATEGORY,
            ).count(),
            "travel_mode_enabled": TravelMode.objects.filter(enabled=True).count(),
            "bank_sms_settings_enabled": BankSmsImportSettings.objects.filter(
                sms_import_enabled=True
            ).count(),
        },
    }
