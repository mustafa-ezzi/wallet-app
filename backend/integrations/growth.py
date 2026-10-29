"""Website counts and campaign links. Counts only — no money, no tokens."""

from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.ops_audit import log_ops_action
from api.ops_permissions import ops

from .ga4 import SITE_EVENTS, configuration_error, realtime_snapshot
from .models import IntegrationAccount, MetricSnapshot, TrackedLink

MAX_RANGE_DAYS = 366
DEFAULT_RANGE_DAYS = 30


def _parse_day(raw):
    try:
        return date.fromisoformat(str(raw).strip())
    except (TypeError, ValueError):
        return None


def parse_range(params):
    today = timezone.localdate()
    end = _parse_day(params.get('to')) if params.get('to') else today
    start = _parse_day(params.get('from')) if params.get('from') else None
    if end is None or (params.get('from') and start is None):
        return None, None, 'Dates must be YYYY-MM-DD.'
    if start is None:
        start = end - timedelta(days=DEFAULT_RANGE_DAYS - 1)
    if start > end:
        return None, None, '"from" must be on or before "to".'
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        return None, None, f'Ranges are limited to {MAX_RANGE_DAYS} days.'
    return start, end, None


def _previous(start: date, end: date):
    days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    return prev_end - timedelta(days=days - 1), prev_end


def _snapshots(start: date, end: date):
    return MetricSnapshot.objects.filter(
        account__provider=IntegrationAccount.PROVIDER_GA4,
        date__gte=start,
        date__lte=end,
    )


def _sum(qs, metric, dimension_key='', dimension_value=None) -> float:
    filtered = qs.filter(metric=metric, dimension_key=dimension_key)
    if dimension_value is not None:
        filtered = filtered.filter(dimension_value=dimension_value)
    total = filtered.aggregate(total=Sum('value'))['total']
    return float(total or 0)


def _weighted(qs, metric, weight='sessions') -> float:
    days: dict = {}
    for row in qs.filter(metric__in=(metric, weight), dimension_key=''):
        days.setdefault(row.date, {})[row.metric] = row.value
    num = den = 0.0
    for values in days.values():
        if metric not in values:
            continue
        w = float(values.get(weight) or 0)
        if w:
            num += float(values[metric]) * w
            den += w
        else:
            num += float(values[metric])
            den += 1
    return (num / den) if den else 0.0


def _totals(qs) -> dict:
    return {
        'users': int(round(_sum(qs, 'users'))),
        'new_users': int(round(_sum(qs, 'new_users'))),
        'sessions': int(round(_sum(qs, 'sessions'))),
        'engaged_sessions': int(round(_sum(qs, 'engaged_sessions'))),
        'engagement_rate': round(_weighted(qs, 'engagement_rate'), 4),
        'avg_engagement_seconds': round(_weighted(qs, 'avg_engagement_seconds'), 1),
        'get_app_clicks': int(round(_sum(qs, 'event_count', 'event', 'get_app_click'))),
    }


def _series(qs, start: date, end: date) -> list[dict]:
    days = {}
    cursor = start
    while cursor <= end:
        days[cursor.isoformat()] = {
            'date': cursor.isoformat(),
            'users': 0,
            'new_users': 0,
            'sessions': 0,
            'get_app_clicks': 0,
        }
        cursor += timedelta(days=1)
    for row in qs.filter(dimension_key='', metric__in=('users', 'new_users', 'sessions')):
        item = days.get(row.date.isoformat())
        if item is not None:
            item[row.metric] = int(round(row.value))
    for row in qs.filter(metric='event_count', dimension_key='event', dimension_value='get_app_click'):
        item = days.get(row.date.isoformat())
        if item is not None:
            item['get_app_clicks'] = int(round(row.value))
    return [days[key] for key in sorted(days)]


def _top(qs, metric, dimension_key, limit=8) -> list[dict]:
    rows = (
        qs.filter(metric=metric, dimension_key=dimension_key)
        .exclude(dimension_value='')
        .values('dimension_value')
        .annotate(total=Sum('value'))
        .order_by('-total')[:limit]
    )
    return [{'label': row['dimension_value'], 'value': int(round(float(row['total'] or 0)))} for row in rows]


def _events(qs) -> list[dict]:
    return [{'label': name, 'value': int(round(_sum(qs, 'event_count', 'event', name)))} for name in SITE_EVENTS]


def website_payload(start: date, end: date, compare: bool) -> dict:
    current = _snapshots(start, end)
    account = (
        IntegrationAccount.objects.filter(provider=IntegrationAccount.PROVIDER_GA4)
        .order_by('-connected_at', '-id')
        .first()
    )
    payload = {
        'configured': configuration_error() == '',
        'status': account.status if account else IntegrationAccount.STATUS_NOT_SETUP,
        'last_sync_at': account.last_sync_at.isoformat() if account and account.last_sync_at else None,
        'last_error': account.last_error if account else '',
        'from': start.isoformat(),
        'to': end.isoformat(),
        'totals': _totals(current),
        'previous': None,
        'series': _series(current, start, end),
        'pages': _top(current, 'page_views', 'page'),
        'sources': _top(current, 'sessions', 'source'),
        'countries': _top(current, 'users', 'country'),
        'devices': _top(current, 'users', 'device'),
        'events': _events(current),
    }
    if compare:
        prev_start, prev_end = _previous(start, end)
        payload['previous'] = _totals(_snapshots(prev_start, prev_end))
    return payload


def tracked_url(destination: str, source: str, medium: str, campaign: str, content: str) -> str:
    parts = urlsplit(destination.strip())
    if parts.scheme not in ('http', 'https') or not parts.netloc:
        raise ValueError('Destination must be an http(s) URL.')
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    for key, value in (
        ('utm_source', source),
        ('utm_medium', medium),
        ('utm_campaign', campaign),
        ('utm_content', content),
    ):
        if value:
            query[key] = value
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _utm(value, field: str) -> str:
    text = str(value or '').strip()
    if len(text) > 80:
        raise ValueError(f'{field} is too long.')
    if any(ord(ch) < 32 for ch in text):
        raise ValueError(f'{field} has invalid characters.')
    return text


def _link_payload(link: TrackedLink) -> dict:
    return {
        'id': link.id,
        'label': link.label,
        'destination': link.destination,
        'utm_source': link.utm_source,
        'utm_medium': link.utm_medium,
        'utm_campaign': link.utm_campaign,
        'utm_content': link.utm_content,
        'url': tracked_url(link.destination, link.utm_source, link.utm_medium, link.utm_campaign, link.utm_content),
        'created_at': link.created_at.isoformat(),
    }


class OpsWebsiteView(APIView):
    permission_classes = [ops('growth.read')]

    def get(self, request):
        start, end, error = parse_range(request.query_params)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        compare = str(request.query_params.get('compare') or '') in ('1', 'true', 'yes')
        return Response(website_payload(start, end, compare))


class OpsWebsiteRealtimeView(APIView):
    permission_classes = [ops('growth.read')]

    def get(self, request):
        return Response(realtime_snapshot())


class OpsTrackedLinksView(APIView):
    def get_permissions(self):
        capability = 'growth.write' if self.request.method == 'POST' else 'growth.read'
        return [ops(capability)()]

    def get(self, request):
        links = TrackedLink.objects.order_by('-created_at', '-id')[:100]
        return Response({'results': [_link_payload(link) for link in links]})

    def post(self, request):
        label = str(request.data.get('label') or '').strip()
        destination = str(request.data.get('destination') or '').strip()
        if not label or len(label) > 120:
            return Response({'detail': 'A label is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fields = {
                'utm_source': _utm(request.data.get('utm_source'), 'utm_source'),
                'utm_medium': _utm(request.data.get('utm_medium'), 'utm_medium'),
                'utm_campaign': _utm(request.data.get('utm_campaign'), 'utm_campaign'),
                'utm_content': _utm(request.data.get('utm_content'), 'utm_content'),
            }
            url = tracked_url(destination, fields['utm_source'], fields['utm_medium'], fields['utm_campaign'], fields['utm_content'])
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        link = TrackedLink.objects.create(
            label=label,
            destination=destination,
            created_by=request.user,
            **fields,
        )
        log_ops_action(
            actor=request.user,
            action='link.create',
            target_type='tracked_link',
            target_id=link.id,
            meta={'label': label},
            request=request,
        )
        payload = _link_payload(link)
        payload['url'] = url
        return Response(payload, status=status.HTTP_201_CREATED)
