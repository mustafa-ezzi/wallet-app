"""Provider adapters. Real network calls arrive in later phases; this is the seam."""

from __future__ import annotations

import os
from dataclasses import dataclass

from django.utils import timezone
from django.utils.dateparse import parse_date

from .models import IntegrationAccount, MetricSnapshot


@dataclass
class SyncResult:
    rows_written: int = 0
    error: str = ''


class ProviderAdapter:
    provider = ''

    def configured(self) -> bool:
        return False

    def sync(self, account: IntegrationAccount) -> SyncResult:
        return SyncResult(error='Not set up')


class PlaceholderAdapter(ProviderAdapter):
    def __init__(self, provider: str, env_names: tuple[str, ...]):
        self.provider = provider
        self.env_names = env_names

    def configured(self) -> bool:
        return all(os.environ.get(name, '').strip() for name in self.env_names)


class FakeAdapter(ProviderAdapter):
    """Test double. Writes one count snapshot and never reads a token aloud."""

    provider = 'fake'

    def configured(self) -> bool:
        return True

    def sync(self, account: IntegrationAccount) -> SyncResult:
        MetricSnapshot.objects.update_or_create(
            account=account,
            metric='fake_count',
            date=timezone.localdate(),
            dimension_key='',
            dimension_value='',
            defaults={'value': 1},
        )
        return SyncResult(rows_written=1)


_REGISTRY: dict[str, ProviderAdapter] = {}


def register_adapter(adapter: ProviderAdapter) -> None:
    _REGISTRY[adapter.provider] = adapter


def get_adapter(provider: str) -> ProviderAdapter | None:
    return _REGISTRY.get(provider)


def write_metric_rows(account: IntegrationAccount, rows: list[dict]) -> int:
    written = 0
    for row in rows:
        metric = str(row.get('metric') or '').strip()[:80]
        day = parse_date(str(row.get('date') or ''))
        if not metric or day is None:
            continue
        try:
            value = float(row.get('value') or 0)
        except (TypeError, ValueError):
            continue
        MetricSnapshot.objects.update_or_create(
            account=account,
            metric=metric,
            date=day,
            dimension_key=str(row.get('dimension_key') or '')[:80],
            dimension_value=str(row.get('dimension_value') or '')[:200],
            defaults={'value': value},
        )
        written += 1
    return written


def _install_placeholders() -> None:
    specs = (
        ('instagram', ('META_APP_ID', 'META_APP_SECRET')),
        ('facebook', ('META_APP_ID', 'META_APP_SECRET')),
        ('linkedin', ('LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET')),
    )
    for provider, env_names in specs:
        if provider not in _REGISTRY:
            register_adapter(PlaceholderAdapter(provider, env_names))


_install_placeholders()


def _install_ga4() -> None:
    from .ga4 import Ga4Adapter

    register_adapter(Ga4Adapter())


_install_ga4()
