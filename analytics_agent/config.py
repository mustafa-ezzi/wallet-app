"""Environment and CLI configuration. Secrets stay in the environment."""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from pathlib import Path

from analytics_agent.errors import ConfigError
from analytics_agent.periods import require_zone

PACKAGE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PACKAGE_DIR.parent


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE lines. Existing process environment wins."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def _env_int(name: str, default: int, *, low: int, high: int) -> int:
    raw = os.environ.get(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer.") from exc
    if value < low or value > high:
        raise ConfigError(f"{name} must be between {low} and {high}.")
    return value


def _resolve(raw: str, base: Path) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        path = base / path
    return path.resolve()


def require_database_url() -> str:
    """PostgreSQL via DATABASE_URL. Local SQLite is never used."""
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise ConfigError(
            "DATABASE_URL is required. The analytics agent reads PostgreSQL only, not local SQLite."
        )
    scheme = url.split(":", 1)[0].lower()
    if not scheme.startswith("postgres"):
        raise ConfigError(
            "DATABASE_URL must be a full PostgreSQL URL, not only a host. "
            "Use postgresql://USER:PASSWORD@HOST:PORT/DATABASE."
        )
    return url


def _cron(raw: str) -> str:
    parts = raw.split()
    if len(parts) != 5 or any(not part for part in parts):
        raise ConfigError("ANALYTICS_CRON must be a 5-field cron expression.")
    if len(raw) > 64:
        raise ConfigError("ANALYTICS_CRON is too long.")
    return raw


@dataclass(frozen=True)
class Config:
    repo_root: Path
    backend_dir: Path
    output_path: Path
    lock_path: Path
    period_days: int
    timezone: str
    db_timeout_seconds: int
    lock_stale_seconds: int
    log_level: str
    log_file: Path | None
    cron: str
    category_limit: int
    llm_api_key: str
    llm_base_url: str
    llm_model: str
    llm_timeout_seconds: int
    dry_run: bool


def parse_config(argv: list[str] | None = None) -> Config:
    parser = argparse.ArgumentParser(
        description="Build a read-only WalletTrails analytics report and publish analytics.json.",
    )
    parser.add_argument("--period-days", type=int, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate the report and print it. Do not replace analytics.json.",
    )
    args = parser.parse_args(argv)
    require_database_url()

    timezone = os.environ.get("ANALYTICS_TIMEZONE", "Asia/Karachi").strip() or "Asia/Karachi"
    require_zone(timezone)
    period_days = args.period_days if args.period_days is not None else _env_int(
        "ANALYTICS_PERIOD_DAYS", 30, low=1, high=366
    )
    if period_days < 1 or period_days > 366:
        raise ConfigError("ANALYTICS_PERIOD_DAYS must be between 1 and 366.")

    output_raw = str(args.output) if args.output is not None else os.environ.get(
        "ANALYTICS_OUTPUT_PATH", "analytics.json"
    )
    output_path = _resolve(output_raw, REPO_ROOT)
    if output_path.exists() and output_path.is_dir():
        raise ConfigError(f"Output path is a directory: {output_path}")

    lock_raw = os.environ.get("ANALYTICS_LOCK_PATH", str(output_path) + ".lock")
    lock_path = _resolve(lock_raw, REPO_ROOT)
    backend_dir = _resolve(os.environ.get("ANALYTICS_BACKEND_DIR", "backend"), REPO_ROOT)
    if not (backend_dir / "manage.py").is_file():
        raise ConfigError(f"Django backend not found at {backend_dir}.")

    log_level = os.environ.get("ANALYTICS_LOG_LEVEL", "INFO").strip().upper() or "INFO"
    if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR"}:
        raise ConfigError("ANALYTICS_LOG_LEVEL must be DEBUG, INFO, WARNING, or ERROR.")
    log_raw = os.environ.get("ANALYTICS_LOG_FILE", "analytics_agent/logs/analytics-agent.log").strip()
    log_file = _resolve(log_raw, REPO_ROOT) if log_raw else None

    llm_base = os.environ.get("ANALYTICS_LLM_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
    if llm_base and not llm_base.startswith(("https://", "http://")):
        raise ConfigError("ANALYTICS_LLM_BASE_URL must start with http:// or https://.")

    return Config(
        repo_root=REPO_ROOT,
        backend_dir=backend_dir,
        output_path=output_path,
        lock_path=lock_path,
        period_days=period_days,
        timezone=timezone,
        db_timeout_seconds=_env_int("ANALYTICS_DB_TIMEOUT_SECONDS", 30, low=1, high=300),
        lock_stale_seconds=_env_int("ANALYTICS_LOCK_STALE_SECONDS", 3600, low=30, high=86400),
        log_level=log_level,
        log_file=log_file,
        cron=_cron(os.environ.get("ANALYTICS_CRON", "15 2 * * *").strip() or "15 2 * * *"),
        category_limit=_env_int("ANALYTICS_CATEGORY_LIMIT", 10, low=1, high=50),
        llm_api_key=os.environ.get("ANALYTICS_LLM_API_KEY", "").strip(),
        llm_base_url=llm_base,
        llm_model=os.environ.get("ANALYTICS_LLM_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini",
        llm_timeout_seconds=_env_int("ANALYTICS_LLM_TIMEOUT_SECONDS", 20, low=1, high=120),
        dry_run=bool(args.dry_run),
    )
