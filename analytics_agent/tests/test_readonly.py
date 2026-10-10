from __future__ import annotations

from pathlib import Path

import pytest

from analytics_agent.db import enforce_read_only


class _Cursor:
    def __init__(self) -> None:
        self.statements = []

    def execute(self, sql, params=None):
        self.statements.append((sql, params))

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _Connection:
    def __init__(self, vendor: str) -> None:
        self.vendor = vendor
        self.cursor_obj = _Cursor()

    def cursor(self):
        return self.cursor_obj


def test_postgres_session_is_read_only_with_timeout():
    connection = _Connection("postgresql")
    enforce_read_only(connection, 30)
    assert connection.cursor_obj.statements == [
        ("SET default_transaction_read_only = on", None),
        ("SET statement_timeout = %s", ["30s"]),
    ]


def test_sqlite_session_is_query_only():
    connection = _Connection("sqlite")
    enforce_read_only(connection, 30)
    assert connection.cursor_obj.statements == [
        ("PRAGMA busy_timeout = 30000", None),
        ("PRAGMA query_only = ON", None),
    ]


def test_unknown_vendor_is_rejected():
    with pytest.raises(RuntimeError):
        enforce_read_only(_Connection("mysql"), 30)


def test_sqlite_engine_is_refused_without_creating_a_file(tmp_path):
    from analytics_agent.config import REPO_ROOT
    from analytics_agent.db import assert_database_ready, setup_django
    from analytics_agent.errors import FetchError

    setup_django(REPO_ROOT / "backend", 5)
    from django.conf import settings

    database = settings.DATABASES["default"]
    original_name = database["NAME"]
    original_engine = database["ENGINE"]
    missing = tmp_path / "local.sqlite3"
    database["ENGINE"] = "django.db.backends.sqlite3"
    database["NAME"] = missing
    try:
        with pytest.raises(FetchError, match="DATABASE_URL"):
            assert_database_ready()
        assert not missing.exists()
    finally:
        database["ENGINE"] = original_engine
        database["NAME"] = original_name


def test_fetch_module_has_no_write_calls():
    root = Path(__file__).resolve().parents[1]
    forbidden = (".delete(", ".update(", ".save(", "bulk_create", "bulk_update", ".raw(")
    for name in ("fetch.py", "runner.py", "metrics.py", "db.py"):
        text = (root / name).read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in text, f"{name} contains {token}"
