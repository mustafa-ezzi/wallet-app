"""Shared builders for analytics agent tests. Not a pytest plugin."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from analytics_agent.catalog import RECORD_SERIES
from analytics_agent.config import Config
from analytics_agent.insights import rules_insights
from analytics_agent.metrics import build_report
from analytics_agent.periods import trailing_period


def make_config(tmp_path, **overrides) -> Config:
    params = dict(
        repo_root=tmp_path,
        backend_dir=tmp_path,
        output_path=tmp_path / "analytics.json",
        lock_path=tmp_path / "analytics.json.lock",
        period_days=7,
        timezone="Asia/Karachi",
        db_timeout_seconds=30,
        lock_stale_seconds=3600,
        log_level="ERROR",
        log_file=None,
        cron="15 2 * * *",
        category_limit=10,
        llm_api_key="",
        llm_base_url="https://api.openai.com/v1",
        llm_model="gpt-4o-mini",
        llm_timeout_seconds=20,
        dry_run=False,
    )
    params.update(overrides)
    return Config(**params)


def sample_snapshot() -> dict:
    zone = ZoneInfo("Asia/Karachi")
    now = datetime(2026, 10, 10, 14, 0, tzinfo=zone)
    period = trailing_period(now.date(), 7, "Asia/Karachi")
    counts = [1, 2, 2, 3, 2, 2, 30]
    current = []
    for offset, count in enumerate(counts):
        day = period.start + timedelta(days=offset)
        current.append(
            {
                "date": day.isoformat(),
                "transactions": count,
                "signups": 1 if offset in (0, 6) else 0,
                "income_pkr": "20.00",
                "expense_pkr": "10.50",
            }
        )
    previous = []
    for offset in range(7):
        day = period.previous_start + timedelta(days=offset)
        previous.append(
            {
                "date": day.isoformat(),
                "transactions": 1,
                "signups": 0,
                "income_pkr": "0",
                "expense_pkr": "5.00",
            }
        )
    totals = {name: 10 for name in RECORD_SERIES}
    new_current = {name: 0 for name in RECORD_SERIES}
    new_current["users"] = 2
    new_previous = {name: 0 for name in RECORD_SERIES}
    return {
        "generated_at": now,
        "cron": "15 2 * * *",
        "category_limit": 10,
        "period": period.as_dict(),
        "totals": totals,
        "new_current": new_current,
        "new_previous": new_previous,
        "daily_current": current,
        "daily_previous": previous,
        "excluded_rows": {"bank_transfer": 4, "people_action": 6},
        "breakdowns": {
            "account_type": {"bank": 3, "cash": 2, "not-a-type": 1},
            "user_type": {"": 4, "professional": 6},
            "expense_categories": [
                {"category": "Food", "count": 4, "amount_pkr": "40.00"},
                {"category": "Food ", "count": 1, "amount_pkr": "2.50"},
                {"category": "Rent\x00", "count": 1, "amount_pkr": "10.00"},
            ],
        },
        "audience": {
            "active_1d": 1,
            "active_7d": 4,
            "active_30d": 7,
            "suspended": 0,
            "onboarding_complete": 8,
            "onboarding_incomplete": 2,
            "new_24h": 1,
            "new_7d": 2,
            "inactivity": {"none": 6, "7d": 1},
            "premium_live": 1,
            "push_tokens": 3,
            "users_with_push": 2,
            "support_open": 1,
            "support_waiting_ops": 1,
            "support_waiting_user": 0,
            "households_total": 10,
            "budgets_current_month": 2,
            "budgets_overall_current_month": 1,
            "travel_mode_enabled": 1,
            "bank_sms_settings_enabled": 2,
        },
    }


def full_report(snapshot: dict | None = None) -> dict:
    report = build_report(snapshot or sample_snapshot())
    report["insights"] = rules_insights(report)
    return report
