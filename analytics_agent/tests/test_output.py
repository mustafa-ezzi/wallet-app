from __future__ import annotations

import json
import os

import pytest

from analytics_agent.errors import ReportValidationError
from analytics_agent.output import publish
from tests.helpers import full_report


def test_publish_replaces_destination_and_removes_temp(tmp_path):
    path = tmp_path / "analytics.json"
    path.write_text('{"old": true}\n', encoding="utf-8")
    publish(full_report(), path)
    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["app"] == "wallettrails"
    assert loaded["status"]["read_only"] is True
    assert not (tmp_path / "analytics.json.tmp").exists()


def test_invalid_report_preserves_previous_file(tmp_path):
    path = tmp_path / "analytics.json"
    path.write_text("previous\n", encoding="utf-8")
    report = full_report()
    report["status"]["state"] = "failed"
    with pytest.raises(ReportValidationError):
        publish(report, path)
    assert path.read_text(encoding="utf-8") == "previous\n"
    assert not (tmp_path / "analytics.json.tmp").exists()


def test_replace_failure_preserves_previous_file(tmp_path, monkeypatch):
    path = tmp_path / "analytics.json"
    path.write_text("previous\n", encoding="utf-8")

    def boom(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", boom)
    with pytest.raises(OSError, match="disk full"):
        publish(full_report(), path)
    assert path.read_text(encoding="utf-8") == "previous\n"
    assert not (tmp_path / "analytics.json.tmp").exists()
