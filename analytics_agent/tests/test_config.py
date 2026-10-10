from __future__ import annotations

import os

import pytest

from analytics_agent.config import load_env_file, parse_config
from analytics_agent.errors import ConfigError


def test_env_file_does_not_override_existing_variables(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text('ANALYTICS_PERIOD_DAYS=7\nANALYTICS_LLM_API_KEY="from-file"\n', encoding="utf-8")
    monkeypatch.setenv("ANALYTICS_PERIOD_DAYS", "11")
    monkeypatch.delenv("ANALYTICS_LLM_API_KEY", raising=False)
    load_env_file(env_file)
    assert os.environ["ANALYTICS_PERIOD_DAYS"] == "11"
    assert os.environ["ANALYTICS_LLM_API_KEY"] == "from-file"


def test_invalid_cron_is_rejected(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/wallet")
    monkeypatch.setenv("ANALYTICS_CRON", "hourly")
    with pytest.raises(ConfigError, match="ANALYTICS_CRON"):
        parse_config([])


def test_cli_period_overrides_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/wallet")
    monkeypatch.setenv("ANALYTICS_PERIOD_DAYS", "30")
    monkeypatch.setenv("ANALYTICS_CRON", "15 2 * * *")
    config = parse_config(["--period-days", "14"])
    assert config.period_days == 14
    assert config.output_path.name == "analytics.json"


def test_private_railway_host_explains_the_failure():
    from analytics_agent.fetch import connection_error_message

    message = connection_error_message(
        "postgres.railway.internal",
        OSError("[Errno 11001] getaddrinfo failed"),
    )
    assert "public networking" in message
    assert "postgres.railway.internal" in message
    assert "PASSWORD" not in message


def test_database_url_is_required(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ConfigError, match="DATABASE_URL"):
        parse_config([])


def test_sqlite_database_url_is_rejected(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///backend/db.sqlite3")
    with pytest.raises(ConfigError, match="full PostgreSQL URL"):
        parse_config([])


def test_host_and_port_alone_are_rejected(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sakura.proxy.rlwy.net:40811")
    with pytest.raises(ConfigError, match="not only a host"):
        parse_config([])
