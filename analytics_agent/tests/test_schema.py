from __future__ import annotations

import json

import pytest

from analytics_agent.schema import (
    SCHEMA_PATH,
    build_schema,
    find_sensitive_keys,
    load_schema,
    validate_report,
)
from analytics_agent.errors import ReportValidationError
from tests.helpers import full_report


def test_checked_in_schema_matches_builder():
    assert json.loads(SCHEMA_PATH.read_text(encoding="utf-8")) == build_schema()


def test_sample_report_validates():
    load_schema.cache_clear()
    validate_report(full_report())


def test_missing_insights_fails():
    report = full_report()
    del report["insights"]
    with pytest.raises(ReportValidationError):
        validate_report(report)


def test_sensitive_key_is_rejected():
    report = full_report()
    report["metrics"]["breakdowns"]["expense_categories"].append(
        {"category": "Food", "count": 1, "amount_pkr": 1, "email": "person@example.com"}
    )
    found = find_sensitive_keys(report)
    assert any(path.endswith(".email") for path in found)
    with pytest.raises(ReportValidationError, match="sensitive"):
        validate_report(report)


def test_status_must_stay_read_only():
    report = full_report()
    report["status"]["read_only"] = False
    with pytest.raises(ReportValidationError):
        validate_report(report)
