"""GA4 Data API. The service-account JSON stays in the environment and is never stored or returned."""

from __future__ import annotations

import json
import logging
import os
from datetime import date, timedelta
from pathlib import Path

from django.core.cache import cache
from django.utils import timezone

from .models import IntegrationAccount

logger = logging.getLogger(__name__)

READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
REALTIME_TTL = 15 * 60
SYNC_DAYS = 14
SITE_EVENTS = ('get_app_click', 'use_case_tab', 'faq_open', 'support_click')

DAILY_METRICS = {
    'totalUsers': 'users',
    'newUsers': 'new_users',
    'sessions': 'sessions',
    'engagedSessions': 'engaged_sessions',
    'engagementRate': 'engagement_rate',
    'averageSessionDuration': 'avg_engagement_seconds',
}


class Ga4Error(Exception):
    pass


def property_id() -> str:
    raw = os.environ.get('GA4_PROPERTY_ID', '').strip()
    if raw.startswith('properties/'):
        raw = raw.split('/', 1)[1].strip()
    return raw if raw.isdigit() else ''


def service_account_info() -> dict | None:
    raw = os.environ.get('GA4_SERVICE_ACCOUNT_JSON', '').strip()
    if not raw:
        return None
    try:
        if raw.startswith('{'):
            info = json.loads(raw)
        else:
            info = json.loads(Path(raw).read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError, UnicodeError):
        return None
    if not isinstance(info, dict) or not info.get('client_email') or not info.get('private_key'):
        return None
    return info


def configuration_error() -> str:
    if not os.environ.get('GA4_PROPERTY_ID', '').strip() or not os.environ.get('GA4_SERVICE_ACCOUNT_JSON', '').strip():
        return 'Not set up'
    if not property_id():
        return 'GA4_PROPERTY_ID must be the numeric property id, not the G- measurement id.'
    if service_account_info() is None:
        return 'GA4_SERVICE_ACCOUNT_JSON could not be read.'
    return ''


def ensure_ga4_account():
    """Create the property row once credentials exist. A disconnected row is left alone."""
    if configuration_error():
        return None
    pid = property_id()
    existing = IntegrationAccount.objects.filter(provider=IntegrationAccount.PROVIDER_GA4, external_id=pid).first()
    if existing is not None:
        return existing
    return IntegrationAccount.objects.create(
        provider=IntegrationAccount.PROVIDER_GA4,
        external_id=pid,
        display_name=f'GA4 {pid}',
        status=IntegrationAccount.STATUS_CONNECTED,
        connected_at=timezone.now(),
    )


def connect_ga4(user):
    account = ensure_ga4_account()
    if account is None:
        return None
    account.connected_by = user
    account.connected_at = account.connected_at or timezone.now()
    account.status = IntegrationAccount.STATUS_CONNECTED
    account.display_name = f'GA4 {property_id()}'
    account.encrypted_token = ''
    account.save(update_fields=['connected_by', 'connected_at', 'status', 'display_name', 'encrypted_token'])
    return account


def _iso_day(raw: str) -> str:
    if len(raw) == 8 and raw.isdigit():
        return f'{raw[0:4]}-{raw[4:6]}-{raw[6:8]}'
    return raw


def _client(info: dict):
    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.oauth2 import service_account
    except ImportError as exc:
        raise Ga4Error('google-analytics-data is not installed') from exc
    credentials = service_account.Credentials.from_service_account_info(info, scopes=[READONLY_SCOPE])
    return BetaAnalyticsDataClient(credentials=credentials)


def _append_metric_rows(out: list[dict], response, metric_names: list[str], dimension_key: str) -> None:
    for row in response.rows:
        dims = [item.value for item in row.dimension_values]
        values = [item.value for item in row.metric_values]
        day = _iso_day(dims[0]) if dims else ''
        extra = dims[1] if len(dims) > 1 else ''
        if dimension_key and not extra:
            continue
        for name, raw in zip(metric_names, values):
            try:
                value = float(raw or 0)
            except (TypeError, ValueError):
                continue
            out.append({
                'metric': name,
                'date': day,
                'dimension_key': dimension_key,
                'dimension_value': extra if dimension_key else '',
                'value': value,
            })


def fetch_ga4_rows(pid: str, info: dict, start: date, end: date) -> list[dict]:
    from google.analytics.data_v1beta.types import (
        DateRange,
        Dimension,
        Filter,
        FilterExpression,
        Metric,
        OrderBy,
        RunReportRequest,
    )

    client = _client(info)
    window = DateRange(start_date=start.isoformat(), end_date=end.isoformat())
    prop = f'properties/{pid}'
    rows: list[dict] = []

    daily = client.run_report(RunReportRequest(
        property=prop,
        date_ranges=[window],
        dimensions=[Dimension(name='date')],
        metrics=[Metric(name=name) for name in DAILY_METRICS],
    ))
    _append_metric_rows(rows, daily, list(DAILY_METRICS.values()), '')

    events = client.run_report(RunReportRequest(
        property=prop,
        date_ranges=[window],
        dimensions=[Dimension(name='date'), Dimension(name='eventName')],
        metrics=[Metric(name='eventCount')],
        dimension_filter=FilterExpression(filter=Filter(
            field_name='eventName',
            in_list_filter=Filter.InListFilter(values=list(SITE_EVENTS)),
        )),
    ))
    _append_metric_rows(rows, events, ['event_count'], 'event')

    breakdowns = (
        ('pagePath', 'screenPageViews', 'page_views', 'page'),
        ('sessionSourceMedium', 'sessions', 'sessions', 'source'),
        ('country', 'totalUsers', 'users', 'country'),
        ('deviceCategory', 'totalUsers', 'users', 'device'),
    )
    for dimension, metric, stored, key in breakdowns:
        report = client.run_report(RunReportRequest(
            property=prop,
            date_ranges=[window],
            dimensions=[Dimension(name='date'), Dimension(name=dimension)],
            metrics=[Metric(name=metric)],
            order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name=metric), desc=True)],
            limit=250,
        ))
        _append_metric_rows(rows, report, [stored], key)
    return rows


def fetch_realtime_active_users(pid: str, info: dict) -> int:
    from google.analytics.data_v1beta.types import Metric, RunRealtimeReportRequest

    client = _client(info)
    report = client.run_realtime_report(RunRealtimeReportRequest(
        property=f'properties/{pid}',
        metrics=[Metric(name='activeUsers')],
    ))
    if not report.rows:
        return 0
    try:
        return int(float(report.rows[0].metric_values[0].value or 0))
    except (TypeError, ValueError, IndexError):
        return 0


def realtime_snapshot() -> dict:
    error = configuration_error()
    if error:
        return {'configured': False, 'active_users': None, 'cached': False, 'detail': error}
    pid = property_id()
    key = f'ops-ga4-realtime-{pid}'
    cached = cache.get(key)
    if cached is not None:
        return {'configured': True, 'active_users': cached, 'cached': True}
    try:
        active = fetch_realtime_active_users(pid, service_account_info())
    except Exception as exc:
        logger.warning('GA4 realtime failed (%s)', type(exc).__name__)
        return {
            'configured': True,
            'active_users': None,
            'cached': False,
            'detail': 'Could not read Google Analytics right now.',
        }
    cache.set(key, active, REALTIME_TTL)
    return {'configured': True, 'active_users': active, 'cached': False}


class Ga4Adapter:
    provider = 'ga4'

    def configured(self) -> bool:
        return configuration_error() == ''

    def sync(self, account: IntegrationAccount):
        from .adapters import SyncResult, write_metric_rows

        error = configuration_error()
        if error:
            return SyncResult(error='Not set up' if error == 'Not set up' else error)
        end = timezone.localdate()
        start = end - timedelta(days=SYNC_DAYS - 1)
        try:
            rows = fetch_ga4_rows(property_id(), service_account_info(), start, end)
        except Exception:
            logger.warning('GA4 sync failed for property %s', property_id())
            return SyncResult(error='Could not read Google Analytics. Check the service account is a Viewer on this property.')
        return SyncResult(rows_written=write_metric_rows(account, rows))
