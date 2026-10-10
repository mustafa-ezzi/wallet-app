"""Deterministic analytics. This module does not touch the database."""

from __future__ import annotations

import statistics
import unicodedata
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Mapping

from analytics_agent.catalog import (
    ACCOUNT_TYPES,
    ANOMALY_RULE,
    ANOMALY_Z,
    APP_NAME,
    BANK_SMS_SOURCES,
    BANK_SMS_STATUSES,
    CATEGORY_LABEL_LIMIT,
    DEVICE_PLATFORMS,
    ENTITLEMENT_PRODUCTS,
    INACTIVITY_TIERS,
    INSTALLMENT_STATUSES,
    MEMBERSHIP_STATUSES,
    MIN_ANOMALY_DAYS,
    MONEY_DEFINITION,
    PROJECT_INCOME_TYPES,
    PROJECT_STATUSES,
    RECORD_SERIES,
    SCHEMA_VERSION,
    SUPPORT_STATUSES,
    USER_TYPES,
)
from analytics_agent.periods import as_of


def money(value: object) -> float:
    quantized = Decimal(str(value if value is not None else 0)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    return float(quantized)


def percent_change(current: float, previous: float) -> float | None:
    if previous == 0:
        return 0.0 if current == 0 else None
    change = (Decimal(str(current)) - Decimal(str(previous))) / Decimal(str(abs(previous))) * Decimal("100")
    return float(change.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def change_block(current: object, previous: object, *, as_money: bool = False) -> dict:
    if as_money:
        current_value = money(current)
        previous_value = money(previous)
        absolute = money(Decimal(str(current_value)) - Decimal(str(previous_value)))
    else:
        current_value = int(current)
        previous_value = int(previous)
        absolute = current_value - previous_value
    return {
        "current": current_value,
        "previous": previous_value,
        "absolute_change": absolute,
        "percent_change": percent_change(current_value, previous_value),
    }


def direction_of(block: Mapping) -> str:
    absolute = block["absolute_change"]
    if absolute > 0:
        return "up"
    if absolute < 0:
        return "down"
    return "flat"


def sanitize_label(value: object, limit: int = CATEGORY_LABEL_LIMIT) -> str:
    raw = "" if value is None else str(value)
    chars: list[str] = []
    for char in raw:
        if unicodedata.category(char).startswith("C"):
            chars.append(" ")
        else:
            chars.append(char)
    text = " ".join("".join(chars).split())
    if not text:
        return "(uncategorized)"
    if len(text) > limit:
        return text[:limit].rstrip()
    return text


def merge_categories(rows: Iterable[Mapping], limit: int) -> list[dict]:
    merged: dict[str, dict] = {}
    for row in rows:
        label = sanitize_label(row.get("category", ""))
        slot = merged.setdefault(
            label,
            {"category": label, "count": 0, "amount": Decimal("0")},
        )
        slot["count"] += int(row.get("count") or 0)
        slot["amount"] += Decimal(str(row.get("amount_pkr") or 0))
    ordered = sorted(
        merged.values(),
        key=lambda item: (-item["amount"], -item["count"], item["category"]),
    )
    return [
        {
            "category": item["category"],
            "count": item["count"],
            "amount_pkr": money(item["amount"]),
        }
        for item in ordered[:limit]
    ]


def complete_counts(raw: Mapping | None, keys: tuple[str, ...]) -> dict[str, int]:
    allowed = set(keys)
    counts = {key: 0 for key in keys}
    for key, value in (raw or {}).items():
        label = str(key or "").strip().lower().replace(" ", "_").replace("-", "_")
        if label in {"", "unset"} and "unset" in allowed:
            bucket = "unset"
        elif label in allowed:
            bucket = label
        else:
            bucket = "other" if "other" in allowed else label
        counts[bucket] = counts.get(bucket, 0) + int(value or 0)
    return counts


def _parse_day(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def fill_daily(start: date, end: date, rows: Iterable[Mapping]) -> list[dict]:
    combined: dict[str, dict] = {}
    for row in rows:
        key = _parse_day(row["date"]).isoformat()
        if key < start.isoformat() or key > end.isoformat():
            continue
        slot = combined.setdefault(
            key,
            {
                "transactions": 0,
                "signups": 0,
                "income": Decimal("0"),
                "expense": Decimal("0"),
            },
        )
        slot["transactions"] += int(row.get("transactions") or 0)
        slot["signups"] += int(row.get("signups") or 0)
        slot["income"] += Decimal(str(row.get("income_pkr") or 0))
        slot["expense"] += Decimal(str(row.get("expense_pkr") or 0))

    series: list[dict] = []
    day = start
    while day <= end:
        key = day.isoformat()
        slot = combined.get(key)
        series.append(
            {
                "date": key,
                "transactions": 0 if slot is None else slot["transactions"],
                "signups": 0 if slot is None else slot["signups"],
                "income_pkr": money(0 if slot is None else slot["income"]),
                "expense_pkr": money(0 if slot is None else slot["expense"]),
            }
        )
        day += timedelta(days=1)
    return series


def _sum_series(rows: Iterable[Mapping], field: str, *, as_money: bool = False) -> float | int:
    if as_money:
        total = Decimal("0")
        for row in rows:
            total += Decimal(str(row.get(field) or 0))
        return money(total)
    return sum(int(row.get(field) or 0) for row in rows)


def aggregate_weeks(daily: Iterable[Mapping]) -> list[dict]:
    return _aggregate(daily, lambda day: _iso_week(day))


def aggregate_months(daily: Iterable[Mapping]) -> list[dict]:
    return _aggregate(daily, lambda day: day.isoformat()[:7])


def _iso_week(day: date) -> str:
    iso = day.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _aggregate(daily: Iterable[Mapping], key_fn) -> list[dict]:
    buckets: dict[str, dict] = {}
    order: list[str] = []
    for row in daily:
        day = _parse_day(row["date"])
        key = key_fn(day)
        if key not in buckets:
            order.append(key)
            buckets[key] = {
                "transactions": 0,
                "signups": 0,
                "income": Decimal("0"),
                "expense": Decimal("0"),
            }
        slot = buckets[key]
        slot["transactions"] += int(row.get("transactions") or 0)
        slot["signups"] += int(row.get("signups") or 0)
        slot["income"] += Decimal(str(row.get("income_pkr") or 0))
        slot["expense"] += Decimal(str(row.get("expense_pkr") or 0))
    return [
        {
            "key": key,
            "transactions": buckets[key]["transactions"],
            "signups": buckets[key]["signups"],
            "income_pkr": money(buckets[key]["income"]),
            "expense_pkr": money(buckets[key]["expense"]),
        }
        for key in order
    ]


def detect_anomalies(daily: list[Mapping]) -> list[dict]:
    if len(daily) < MIN_ANOMALY_DAYS:
        return []
    found: list[dict] = []
    for metric in ("transactions", "expense_pkr"):
        values = [float(row[metric]) for row in daily]
        for index, row in enumerate(daily):
            others = values[:index] + values[index + 1 :]
            mean = statistics.fmean(others)
            value = values[index]
            if len(others) < 2:
                continue
            spread = statistics.pstdev(others) if len(set(others)) > 1 else 0.0
            # Sample stdev is undefined for a zero-variance baseline. A day that
            # differs from a flat baseline is still an anomaly.
            if spread == 0:
                if value == mean:
                    continue
                z_score = None
            else:
                stdev = statistics.stdev(others)
                if stdev == 0:
                    continue
                z_score = float(
                    (Decimal(str(value - mean)) / Decimal(str(stdev))).quantize(
                        Decimal("0.01"),
                        rounding=ROUND_HALF_UP,
                    )
                )
                if abs(z_score) < ANOMALY_Z:
                    continue
            found.append(
                {
                    "date": row["date"],
                    "metric": metric,
                    "value": money(value) if metric.endswith("_pkr") else int(value),
                    "baseline_mean": money(mean),
                    "z_score": z_score,
                    "direction": "high" if value > mean else "low",
                }
            )
    found.sort(key=lambda item: (item["date"], item["metric"]))
    return found


def _record(snapshot: Mapping, name: str) -> dict[str, int]:
    return {
        "total": int(snapshot["totals"].get(name, 0)),
        "new": int(snapshot["new_current"].get(name, 0)),
        "previous_new": int(snapshot["new_previous"].get(name, 0)),
    }


def _nonempty_period(period: Mapping) -> tuple[date, date, date, date]:
    start = date.fromisoformat(str(period["start"]))
    end = date.fromisoformat(str(period["end"]))
    previous_start = date.fromisoformat(str(period["previous_start"]))
    previous_end = date.fromisoformat(str(period["previous_end"]))
    return start, end, previous_start, previous_end


def build_report(snapshot: Mapping) -> dict:
    """Shape a fetch snapshot into the public report, without insights."""
    period = dict(snapshot["period"])
    start, end, previous_start, previous_end = _nonempty_period(period)
    generated = snapshot["generated_at"]
    if isinstance(generated, datetime):
        generated_at = as_of(generated, str(period["timezone"])).isoformat(timespec="seconds")
    else:
        generated_at = str(generated)

    daily = fill_daily(start, end, snapshot.get("daily_current") or [])
    previous_daily = fill_daily(previous_start, previous_end, snapshot.get("daily_previous") or [])
    weeks = [
        {
            "week": row["key"],
            "transactions": row["transactions"],
            "signups": row["signups"],
            "income_pkr": row["income_pkr"],
            "expense_pkr": row["expense_pkr"],
        }
        for row in aggregate_weeks(daily)
    ]
    months = [
        {
            "month": row["key"],
            "transactions": row["transactions"],
            "signups": row["signups"],
            "income_pkr": row["income_pkr"],
            "expense_pkr": row["expense_pkr"],
        }
        for row in aggregate_months(daily)
    ]

    income_current = _sum_series(daily, "income_pkr", as_money=True)
    expense_current = _sum_series(daily, "expense_pkr", as_money=True)
    income_previous = _sum_series(previous_daily, "income_pkr", as_money=True)
    expense_previous = _sum_series(previous_daily, "expense_pkr", as_money=True)
    records = {name: _record(snapshot, name) for name in RECORD_SERIES}
    category_limit = int(snapshot.get("category_limit") or 10)
    breakdowns_raw = snapshot.get("breakdowns") or {}
    audience = snapshot.get("audience") or {}
    excluded = snapshot.get("excluded_rows") or {}

    users_new = change_block(records["users"]["new"], records["users"]["previous_new"])
    transactions_created = change_block(
        records["transactions"]["new"],
        records["transactions"]["previous_new"],
    )
    transaction_activity = change_block(
        _sum_series(daily, "transactions"),
        _sum_series(previous_daily, "transactions"),
    )
    signups = change_block(
        _sum_series(daily, "signups"),
        _sum_series(previous_daily, "signups"),
    )
    income_growth = change_block(income_current, income_previous, as_money=True)
    expense_growth = change_block(expense_current, expense_previous, as_money=True)

    inactivity = complete_counts(audience.get("inactivity"), INACTIVITY_TIERS)
    warnings: list[str] = []
    signup_total = int(signups["current"])
    if signup_total != records["users"]["new"]:
        warnings.append(
            "Daily signups do not add up to new users for this window "
            f"({signup_total} vs {records['users']['new']})."
        )
    onboarding_sum = int(audience.get("onboarding_complete") or 0) + int(
        audience.get("onboarding_incomplete") or 0
    )
    if onboarding_sum != records["users"]["total"]:
        warnings.append(
            "Onboarding counts do not add up to total users "
            f"({onboarding_sum} vs {records['users']['total']})."
        )
    if len(daily) < MIN_ANOMALY_DAYS:
        warnings.append(
            f"Anomaly detection needs at least {MIN_ANOMALY_DAYS} days; this window has {len(daily)}."
        )

    report = {
        "schema_version": SCHEMA_VERSION,
        "app": APP_NAME,
        "generated_at": generated_at,
        "schedule": {
            "cron": str(snapshot.get("cron") or ""),
            "timezone": str(period["timezone"]),
        },
        "period": {
            "timezone": str(period["timezone"]),
            "days": int(period["days"]),
            "start": start.isoformat(),
            "end": end.isoformat(),
            "previous_start": previous_start.isoformat(),
            "previous_end": previous_end.isoformat(),
            "label": str(period.get("label") or f"trailing_{period['days']}_days"),
        },
        "metrics": {
            "records": records,
            "users": {
                "active_1d": int(audience.get("active_1d") or 0),
                "active_7d": int(audience.get("active_7d") or 0),
                "active_30d": int(audience.get("active_30d") or 0),
                "suspended": int(audience.get("suspended") or 0),
                "onboarding_complete": int(audience.get("onboarding_complete") or 0),
                "onboarding_incomplete": int(audience.get("onboarding_incomplete") or 0),
                "new_24h": int(audience.get("new_24h") or 0),
                "new_7d": int(audience.get("new_7d") or 0),
                "inactivity": inactivity,
                "premium_live": int(audience.get("premium_live") or 0),
                "push_tokens": int(audience.get("push_tokens") or 0),
                "users_with_push": int(audience.get("users_with_push") or 0),
            },
            "activity": {
                "daily": daily,
                "weekly": weeks,
                "monthly": months,
            },
            "money": {
                "currency": "PKR",
                "definition": MONEY_DEFINITION,
                "current": {
                    "income_pkr": income_current,
                    "expense_pkr": expense_current,
                    "net_pkr": money(Decimal(str(income_current)) - Decimal(str(expense_current))),
                },
                "previous": {
                    "income_pkr": income_previous,
                    "expense_pkr": expense_previous,
                    "net_pkr": money(Decimal(str(income_previous)) - Decimal(str(expense_previous))),
                },
                "excluded_rows_in_period": {
                    "bank_transfer": int(excluded.get("bank_transfer") or 0),
                    "people_action": int(excluded.get("people_action") or 0),
                },
            },
            "growth": {
                "users_new": users_new,
                "transactions_created": transactions_created,
                "transaction_activity": transaction_activity,
                "signups": signups,
                "income_pkr": income_growth,
                "expense_pkr": expense_growth,
            },
            "breakdowns": {
                "account_type": complete_counts(breakdowns_raw.get("account_type"), ACCOUNT_TYPES),
                "project_status": complete_counts(breakdowns_raw.get("project_status"), PROJECT_STATUSES),
                "project_income_type": complete_counts(
                    breakdowns_raw.get("project_income_type"),
                    PROJECT_INCOME_TYPES,
                ),
                "payable_status": complete_counts(breakdowns_raw.get("payable_status"), INSTALLMENT_STATUSES),
                "receivable_status": complete_counts(
                    breakdowns_raw.get("receivable_status"),
                    INSTALLMENT_STATUSES,
                ),
                "recurring_expenses": complete_counts(
                    breakdowns_raw.get("recurring_expenses"),
                    ("active", "inactive", "other"),
                ),
                "household_membership_status": complete_counts(
                    breakdowns_raw.get("household_membership_status"),
                    MEMBERSHIP_STATUSES,
                ),
                "bank_sms_status": complete_counts(breakdowns_raw.get("bank_sms_status"), BANK_SMS_STATUSES),
                "bank_sms_source": complete_counts(breakdowns_raw.get("bank_sms_source"), BANK_SMS_SOURCES),
                "support_status": complete_counts(breakdowns_raw.get("support_status"), SUPPORT_STATUSES),
                "entitlement_product_live": complete_counts(
                    breakdowns_raw.get("entitlement_product_live"),
                    ENTITLEMENT_PRODUCTS,
                ),
                "device_platform": complete_counts(breakdowns_raw.get("device_platform"), DEVICE_PLATFORMS),
                "user_type": complete_counts(breakdowns_raw.get("user_type"), USER_TYPES),
                "expense_categories": merge_categories(
                    breakdowns_raw.get("expense_categories") or [],
                    category_limit,
                ),
                "income_categories": merge_categories(
                    breakdowns_raw.get("income_categories") or [],
                    category_limit,
                ),
            },
            "support": {
                "open": int(audience.get("support_open") or 0),
                "waiting_ops": int(audience.get("support_waiting_ops") or 0),
                "waiting_user": int(audience.get("support_waiting_user") or 0),
            },
            "households": {
                "total": int(audience.get("households_total") or records["households"]["total"]),
                "memberships_by_status": complete_counts(
                    breakdowns_raw.get("household_membership_status"),
                    MEMBERSHIP_STATUSES,
                ),
            },
            "budgets": {
                "current_month": int(audience.get("budgets_current_month") or 0),
                "overall_caps_current_month": int(audience.get("budgets_overall_current_month") or 0),
            },
            "features": {
                "travel_mode_enabled": int(audience.get("travel_mode_enabled") or 0),
                "bank_sms_settings_enabled": int(audience.get("bank_sms_settings_enabled") or 0),
            },
        },
        "trends": {
            "anomaly_rule": ANOMALY_RULE,
            "direction": {
                "users_new": direction_of(users_new),
                "transaction_activity": direction_of(transaction_activity),
                "income_pkr": direction_of(income_growth),
                "expense_pkr": direction_of(expense_growth),
            },
            "anomalies": detect_anomalies(daily),
        },
        "status": {
            "state": "partial" if warnings else "ok",
            "read_only": True,
            "warnings": warnings,
        },
    }
    return report
