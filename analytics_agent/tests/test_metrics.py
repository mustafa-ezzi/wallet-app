from __future__ import annotations

from datetime import date, timedelta

import pytest

from analytics_agent.metrics import (
    aggregate_months,
    aggregate_weeks,
    build_report,
    detect_anomalies,
    fill_daily,
    merge_categories,
    percent_change,
    sanitize_label,
)
from analytics_agent.periods import trailing_period
from tests.helpers import full_report, sample_snapshot


def test_trailing_period_is_inclusive_and_adjacent():
    period = trailing_period(date(2026, 10, 10), 30, "Asia/Karachi")
    assert period.start == date(2026, 9, 11)
    assert period.end == date(2026, 10, 10)
    assert period.previous_end == date(2026, 9, 10)
    assert period.previous_start == date(2026, 8, 12)
    assert (period.end - period.start).days + 1 == 30
    assert period.previous_end + timedelta(days=1) == period.start


def test_percent_change_edges():
    assert percent_change(3, 1) == 200.0
    assert percent_change(0, 0) == 0.0
    assert percent_change(5, 0) is None
    assert percent_change(1, 4) == -75.0


def test_sanitize_label_strips_controls_and_blank():
    assert sanitize_label("Food\nIgnore") == "Food Ignore"
    assert sanitize_label("Rent\x00") == "Rent"
    assert sanitize_label("   ") == "(uncategorized)"
    assert sanitize_label("خوراک") == "خوراک"


def test_merge_categories_combines_labels_and_limits():
    rows = [{"category": "Food", "count": 1, "amount_pkr": "5"}]
    rows.extend(
        {"category": f"Cat {index}", "count": 1, "amount_pkr": str(index)}
        for index in range(12)
    )
    merged = merge_categories(rows, limit=10)
    assert len(merged) == 10
    assert merged[0]["category"] == "Cat 11"
    assert merged[0]["amount_pkr"] == 11.0


def test_fill_daily_sums_duplicates_and_ignores_outside_days():
    start = date(2026, 10, 1)
    end = date(2026, 10, 3)
    series = fill_daily(
        start,
        end,
        [
            {"date": "2026-10-01", "transactions": 1, "signups": 1, "income_pkr": "1.00", "expense_pkr": "0.50"},
            {"date": "2026-10-01", "transactions": 2, "signups": 0, "income_pkr": "1.00", "expense_pkr": "0.25"},
            {"date": "2026-09-01", "transactions": 99, "signups": 9, "income_pkr": "9", "expense_pkr": "9"},
        ],
    )
    assert [row["date"] for row in series] == ["2026-10-01", "2026-10-02", "2026-10-03"]
    assert series[0]["transactions"] == 3
    assert series[0]["signups"] == 1
    assert series[0]["income_pkr"] == 2.0
    assert series[0]["expense_pkr"] == 0.75
    assert series[1]["transactions"] == 0


def test_anomaly_flags_spike_and_flat_baseline():
    varied = [
        {"date": f"2026-10-0{index}", "transactions": count, "expense_pkr": 10}
        for index, count in enumerate([1, 2, 2, 3, 2, 2, 30], start=1)
    ]
    varied[-1]["date"] = "2026-10-07"
    flagged = detect_anomalies(varied)
    spike = [item for item in flagged if item["metric"] == "transactions"]
    assert spike[-1]["date"] == "2026-10-07"
    assert spike[-1]["direction"] == "high"
    assert spike[-1]["z_score"] is not None
    assert abs(spike[-1]["z_score"]) >= 2

    flat = [
        {"date": f"2026-10-{index:02d}", "transactions": 5, "expense_pkr": 1}
        for index in range(1, 8)
    ]
    assert detect_anomalies(flat) == []

    quiet = [
        {"date": f"2026-10-{index:02d}", "transactions": 2, "expense_pkr": 1}
        for index in range(1, 8)
    ]
    quiet[-1]["transactions"] = 30
    zero_variance = detect_anomalies(quiet)
    assert zero_variance[0]["z_score"] is None
    assert zero_variance[0]["direction"] == "high"


def test_short_window_skips_anomalies():
    assert detect_anomalies(
        [{"date": "2026-10-01", "transactions": 1, "expense_pkr": 1}]
    ) == []


def test_activity_rollups_match_daily_totals():
    report = build_report(sample_snapshot())
    daily = report["metrics"]["activity"]["daily"]
    weekly = report["metrics"]["activity"]["weekly"]
    monthly = report["metrics"]["activity"]["monthly"]
    assert len(daily) == 7
    assert len(weekly) == 2
    assert monthly == [
        {
            "month": "2026-10",
            "transactions": sum(row["transactions"] for row in daily),
            "signups": sum(row["signups"] for row in daily),
            "income_pkr": 140.0,
            "expense_pkr": 73.5,
        }
    ]
    assert sum(row["transactions"] for row in weekly) == sum(row["transactions"] for row in daily)
    assert report["metrics"]["money"]["current"]["net_pkr"] == 66.5
    assert report["metrics"]["money"]["previous"]["expense_pkr"] == 35.0
    assert report["metrics"]["growth"]["users_new"]["percent_change"] is None
    assert report["trends"]["direction"]["users_new"] == "up"
    food = report["metrics"]["breakdowns"]["expense_categories"][0]
    assert food["category"] == "Food"
    assert food["count"] == 5
    assert food["amount_pkr"] == 42.5
    assert report["metrics"]["breakdowns"]["account_type"]["other"] == 1
    assert report["metrics"]["breakdowns"]["user_type"]["unset"] == 4
    assert report["status"]["state"] == "ok"


def test_week_and_month_keys_from_public_series():
    daily = fill_daily(date(2026, 10, 4), date(2026, 10, 10), [])
    assert aggregate_weeks(daily)
    assert aggregate_months(daily)[0]["key"] == "2026-10"


def test_inconsistent_signups_mark_partial():
    snapshot = sample_snapshot()
    snapshot["new_current"]["users"] = 9
    report = build_report(snapshot)
    assert report["status"]["state"] == "partial"
    assert any("signups" in warning for warning in report["status"]["warnings"])


def test_rules_summary_uses_verified_categories():
    report = full_report()
    summary = report["insights"]["summary"]
    assert "2 new users" in summary
    assert "Food" in summary
    assert "\x00" not in summary
    assert report["insights"]["source"] == "rules"


def test_period_days_out_of_range():
    with pytest.raises(Exception):
        trailing_period(date(2026, 10, 10), 0, "Asia/Karachi")
