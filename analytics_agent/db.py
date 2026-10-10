"""Django bootstrap and a read-only database session."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from analytics_agent.errors import FetchError


def setup_django(backend_dir: Path, timeout_seconds: int) -> None:
    backend = str(Path(backend_dir).resolve())
    if backend not in sys.path:
        sys.path.insert(0, backend)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wallet_manager.settings")
    import django
    from django.conf import settings

    if not settings.configured:
        django.setup()
    else:
        django.setup()
    _configure_timeouts(timeout_seconds)


def _configure_timeouts(timeout_seconds: int) -> None:
    from django.conf import settings

    database = settings.DATABASES["default"]
    options = database.setdefault("OPTIONS", {})
    engine = database["ENGINE"]
    seconds = int(timeout_seconds)
    if "postgresql" in engine:
        options["connect_timeout"] = seconds
        extra = f"-c statement_timeout={seconds * 1000} -c default_transaction_read_only=on"
        current = options.get("options", "")
        if "statement_timeout" not in current:
            options["options"] = (f"{current} {extra}").strip()
    elif "sqlite" in engine:
        options["timeout"] = seconds


def assert_database_ready() -> None:
    """Open only the PostgreSQL database selected by DATABASE_URL."""
    from django.conf import settings

    engine = settings.DATABASES["default"]["ENGINE"]
    if "postgresql" not in engine:
        raise FetchError(
            "Analytics requires DATABASE_URL pointing at PostgreSQL. "
            "Refusing to open a local SQLite database."
        )


def enforce_read_only(connection, timeout_seconds: int) -> None:
    """Apply a session timeout and reject writes for this connection."""
    seconds = int(timeout_seconds)
    if seconds < 1:
        raise ValueError("Database timeout must be positive.")
    with connection.cursor() as cursor:
        if connection.vendor == "postgresql":
            cursor.execute("SET default_transaction_read_only = on")
            cursor.execute("SET statement_timeout = %s", [f"{seconds}s"])
        elif connection.vendor == "sqlite":
            cursor.execute(f"PRAGMA busy_timeout = {seconds * 1000}")
            cursor.execute("PRAGMA query_only = ON")
        else:
            raise RuntimeError(f"Unsupported database vendor: {connection.vendor}")
