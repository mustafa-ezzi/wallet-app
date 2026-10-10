"""JSON Schema for analytics.json. The checked-in file is the runtime source."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from analytics_agent.catalog import (
    ACCOUNT_TYPES,
    ANOMALY_RULE,
    APP_NAME,
    BANK_SMS_SOURCES,
    BANK_SMS_STATUSES,
    DEVICE_PLATFORMS,
    ENTITLEMENT_PRODUCTS,
    INACTIVITY_TIERS,
    INSTALLMENT_STATUSES,
    MEMBERSHIP_STATUSES,
    MONEY_DEFINITION,
    PROJECT_INCOME_TYPES,
    PROJECT_STATUSES,
    RECORD_SERIES,
    SCHEMA_VERSION,
    SENSITIVE_KEYS,
    SUPPORT_STATUSES,
    USER_TYPES,
)
from analytics_agent.errors import ReportValidationError

SCHEMA_PATH = Path(__file__).resolve().parent / "schema" / "analytics.schema.json"

NONNEG_INT: dict[str, Any] = {"type": "integer", "minimum": 0}
NUMBER: dict[str, Any] = {"type": "number"}
DATE: dict[str, Any] = {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"}
DIRECTION: dict[str, Any] = {"type": "string", "enum": ["up", "down", "flat"]}


def _object(properties: dict, required: list[str] | None = None) -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": required if required is not None else list(properties),
        "properties": properties,
    }


def _count_map(keys: tuple[str, ...]) -> dict:
    return _object({key: NONNEG_INT for key in keys})


def _record() -> dict:
    return _object(
        {
            "total": NONNEG_INT,
            "new": NONNEG_INT,
            "previous_new": NONNEG_INT,
        }
    )


def _change() -> dict:
    return _object(
        {
            "current": NUMBER,
            "previous": NUMBER,
            "absolute_change": NUMBER,
            "percent_change": {"type": ["number", "null"]},
        }
    )


def _flow(extra: dict) -> dict:
    return _object(
        {
            **extra,
            "transactions": NONNEG_INT,
            "signups": NONNEG_INT,
            "income_pkr": NUMBER,
            "expense_pkr": NUMBER,
        }
    )


def _category() -> dict:
    return _object(
        {
            "category": {"type": "string", "minLength": 1, "maxLength": 48},
            "count": NONNEG_INT,
            "amount_pkr": NUMBER,
        }
    )


def build_schema() -> dict:
    money_side = _object(
        {
            "income_pkr": NUMBER,
            "expense_pkr": NUMBER,
            "net_pkr": NUMBER,
        }
    )
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://wallettrails.local/schemas/analytics.json",
        "title": "WalletTrails analytics report",
        "type": "object",
        "additionalProperties": False,
        "required": [
            "schema_version",
            "app",
            "generated_at",
            "schedule",
            "period",
            "metrics",
            "trends",
            "insights",
            "status",
        ],
        "properties": {
            "schema_version": {"type": "integer", "const": SCHEMA_VERSION},
            "app": {"type": "string", "const": APP_NAME},
            "generated_at": {
                "type": "string",
                "pattern": r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$",
            },
            "schedule": _object(
                {
                    "cron": {"type": "string", "minLength": 1, "maxLength": 64},
                    "timezone": {"type": "string", "minLength": 1, "maxLength": 64},
                }
            ),
            "period": _object(
                {
                    "timezone": {"type": "string", "minLength": 1},
                    "days": {"type": "integer", "minimum": 1, "maximum": 366},
                    "start": DATE,
                    "end": DATE,
                    "previous_start": DATE,
                    "previous_end": DATE,
                    "label": {"type": "string", "minLength": 1},
                }
            ),
            "metrics": _object(
                {
                    "records": _object({name: _record() for name in RECORD_SERIES}),
                    "users": _object(
                        {
                            "active_1d": NONNEG_INT,
                            "active_7d": NONNEG_INT,
                            "active_30d": NONNEG_INT,
                            "suspended": NONNEG_INT,
                            "onboarding_complete": NONNEG_INT,
                            "onboarding_incomplete": NONNEG_INT,
                            "new_24h": NONNEG_INT,
                            "new_7d": NONNEG_INT,
                            "inactivity": _count_map(INACTIVITY_TIERS),
                            "premium_live": NONNEG_INT,
                            "push_tokens": NONNEG_INT,
                            "users_with_push": NONNEG_INT,
                        }
                    ),
                    "activity": _object(
                        {
                            "daily": {
                                "type": "array",
                                "maxItems": 366,
                                "items": _flow({"date": DATE}),
                            },
                            "weekly": {
                                "type": "array",
                                "items": _flow(
                                    {"week": {"type": "string", "pattern": r"^\d{4}-W\d{2}$"}}
                                ),
                            },
                            "monthly": {
                                "type": "array",
                                "items": _flow(
                                    {"month": {"type": "string", "pattern": r"^\d{4}-\d{2}$"}}
                                ),
                            },
                        }
                    ),
                    "money": _object(
                        {
                            "currency": {"type": "string", "const": "PKR"},
                            "definition": {"type": "string", "const": MONEY_DEFINITION},
                            "current": money_side,
                            "previous": money_side,
                            "excluded_rows_in_period": _object(
                                {
                                    "bank_transfer": NONNEG_INT,
                                    "people_action": NONNEG_INT,
                                }
                            ),
                        }
                    ),
                    "growth": _object(
                        {
                            "users_new": _change(),
                            "transactions_created": _change(),
                            "transaction_activity": _change(),
                            "signups": _change(),
                            "income_pkr": _change(),
                            "expense_pkr": _change(),
                        }
                    ),
                    "breakdowns": _object(
                        {
                            "account_type": _count_map(ACCOUNT_TYPES),
                            "project_status": _count_map(PROJECT_STATUSES),
                            "project_income_type": _count_map(PROJECT_INCOME_TYPES),
                            "payable_status": _count_map(INSTALLMENT_STATUSES),
                            "receivable_status": _count_map(INSTALLMENT_STATUSES),
                            "recurring_expenses": _count_map(("active", "inactive", "other")),
                            "household_membership_status": _count_map(MEMBERSHIP_STATUSES),
                            "bank_sms_status": _count_map(BANK_SMS_STATUSES),
                            "bank_sms_source": _count_map(BANK_SMS_SOURCES),
                            "support_status": _count_map(SUPPORT_STATUSES),
                            "entitlement_product_live": _count_map(ENTITLEMENT_PRODUCTS),
                            "device_platform": _count_map(DEVICE_PLATFORMS),
                            "user_type": _count_map(USER_TYPES),
                            "expense_categories": {"type": "array", "maxItems": 50, "items": _category()},
                            "income_categories": {"type": "array", "maxItems": 50, "items": _category()},
                        }
                    ),
                    "support": _object(
                        {
                            "open": NONNEG_INT,
                            "waiting_ops": NONNEG_INT,
                            "waiting_user": NONNEG_INT,
                        }
                    ),
                    "households": _object(
                        {
                            "total": NONNEG_INT,
                            "memberships_by_status": _count_map(MEMBERSHIP_STATUSES),
                        }
                    ),
                    "budgets": _object(
                        {
                            "current_month": NONNEG_INT,
                            "overall_caps_current_month": NONNEG_INT,
                        }
                    ),
                    "features": _object(
                        {
                            "travel_mode_enabled": NONNEG_INT,
                            "bank_sms_settings_enabled": NONNEG_INT,
                        }
                    ),
                }
            ),
            "trends": _object(
                {
                    "anomaly_rule": {"type": "string", "const": ANOMALY_RULE},
                    "direction": _object(
                        {
                            "users_new": DIRECTION,
                            "transaction_activity": DIRECTION,
                            "income_pkr": DIRECTION,
                            "expense_pkr": DIRECTION,
                        }
                    ),
                    "anomalies": {
                        "type": "array",
                        "items": _object(
                            {
                                "date": DATE,
                                "metric": {"type": "string", "enum": ["transactions", "expense_pkr"]},
                                "value": NUMBER,
                                "baseline_mean": NUMBER,
                                "z_score": {"type": ["number", "null"]},
                                "direction": {"type": "string", "enum": ["high", "low"]},
                            }
                        ),
                    },
                }
            ),
            "insights": _object(
                {
                    "source": {"type": "string", "enum": ["llm", "rules"]},
                    "summary": {"type": "string", "minLength": 1, "maxLength": 2000},
                    "highlights": {
                        "type": "array",
                        "maxItems": 8,
                        "items": {"type": "string", "minLength": 1, "maxLength": 300},
                    },
                }
            ),
            "status": _object(
                {
                    "state": {"type": "string", "enum": ["ok", "partial"]},
                    "read_only": {"type": "boolean", "const": True},
                    "warnings": {
                        "type": "array",
                        "maxItems": 20,
                        "items": {"type": "string", "maxLength": 300},
                    },
                }
            ),
        },
    }


@lru_cache(maxsize=1)
def load_schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def find_sensitive_keys(value: object, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if str(key).strip().lower() in SENSITIVE_KEYS:
                found.append(path)
            found.extend(find_sensitive_keys(item, path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(find_sensitive_keys(item, f"{prefix}[{index}]"))
    return found


def validate_report(report: dict) -> None:
    sensitive = find_sensitive_keys(report)
    if sensitive:
        raise ReportValidationError(
            "Report contains sensitive keys and was not published: " + ", ".join(sensitive)
        )
    from jsonschema import Draft202012Validator

    validator = Draft202012Validator(load_schema())
    errors = sorted(validator.iter_errors(report), key=lambda err: list(err.absolute_path))
    if errors:
        first = errors[0]
        location = "/".join(str(part) for part in first.absolute_path) or "(root)"
        raise ReportValidationError(f"{location}: {first.message}")
