"""Trailing calendar windows in the application timezone."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from analytics_agent.errors import ConfigError


def require_zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise ConfigError(
            f"Unknown timezone {name!r}. Install tzdata or set ANALYTICS_TIMEZONE."
        ) from exc


@dataclass(frozen=True)
class Period:
    timezone: str
    days: int
    start: date
    end: date
    previous_start: date
    previous_end: date

    @property
    def label(self) -> str:
        return f"trailing_{self.days}_days"

    def as_dict(self) -> dict[str, object]:
        return {
            "timezone": self.timezone,
            "days": self.days,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "previous_start": self.previous_start.isoformat(),
            "previous_end": self.previous_end.isoformat(),
            "label": self.label,
        }


def trailing_period(today: date, days: int, timezone: str) -> Period:
    if days < 1 or days > 366:
        raise ConfigError("ANALYTICS_PERIOD_DAYS must be between 1 and 366.")
    current_end = today
    current_start = today - timedelta(days=days - 1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)
    return Period(
        timezone=timezone,
        days=days,
        start=current_start,
        end=current_end,
        previous_start=previous_start,
        previous_end=previous_end,
    )


def as_of(now: datetime, timezone: str) -> datetime:
    zone = require_zone(timezone)
    if now.tzinfo is None:
        raise ConfigError("generated_at must be timezone-aware.")
    return now.astimezone(zone)
