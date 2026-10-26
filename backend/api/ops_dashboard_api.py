"""
WalletTrails Ops — Command Center summary and the analytics report view.

Privacy: everything here is a count. No amounts, balances, categories or
transaction rows leave this module, including from the analytics report.
"""

import copy
import json
import os
import re
from datetime import date, datetime, time, timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Case, Count, IntegerField, Q, When
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    DeviceToken,
    Entitlement,
    PurchaseEvent,
    PushCampaign,
    SupportThread,
    Transaction,
    UserOpsMeta,
)
from .ops_permissions import IsOpsStaff

MAX_RANGE_DAYS = 366
DEFAULT_RANGE_DAYS = 30
ATTENTION_LIMIT = 6


def _parse_day(raw):
    try:
        return date.fromisoformat(str(raw).strip())
    except (TypeError, ValueError):
        return None


def parse_range(params):
    """Inclusive local-date range from ?from=&to= (YYYY-MM-DD). Returns (start, end, error)."""
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


def _bounds(start: date, end: date):
    tz = timezone.get_current_timezone()
    return (
        timezone.make_aware(datetime.combine(start, time.min), tz),
        timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), tz),
    )


def _window_counts(start: date, end: date) -> dict:
    lo, hi = _bounds(start, end)
    return {
        'signups': User.objects.filter(date_joined__gte=lo, date_joined__lt=hi).count(),
        'active_users': (
            Transaction.objects.filter(created_at__gte=lo, created_at__lt=hi)
            .values('user_id').distinct().count()
        ),
        'records_created': Transaction.objects.filter(created_at__gte=lo, created_at__lt=hi).count(),
        'support_opened': SupportThread.objects.filter(created_at__gte=lo, created_at__lt=hi).count(),
        'premium_started': Entitlement.objects.filter(started_at__gte=lo, started_at__lt=hi).count(),
        'campaigns_sent': PushCampaign.objects.filter(
            status=PushCampaign.STATUS_SENT, sent_at__gte=lo, sent_at__lt=hi,
        ).count(),
    }


def _daily(qs, field: str, start: date, end: date, *, distinct_users=False) -> dict:
    lo, hi = _bounds(start, end)
    tz = timezone.get_current_timezone()
    rows = (
        qs.filter(**{f'{field}__gte': lo, f'{field}__lt': hi})
        .annotate(day=TruncDate(field, tzinfo=tz))
        .values('day')
        .annotate(c=Count('user_id', distinct=True) if distinct_users else Count('id'))
    )
    return {row['day']: row['c'] for row in rows}


def _series(start: date, end: date) -> list:
    signups = _daily(User.objects.all(), 'date_joined', start, end)
    active = _daily(Transaction.objects.all(), 'created_at', start, end, distinct_users=True)
    records = _daily(Transaction.objects.all(), 'created_at', start, end)
    out = []
    day = start
    while day <= end:
        out.append({
            'date': day.isoformat(),
            'signups': signups.get(day, 0),
            'active_users': active.get(day, 0),
            'records_created': records.get(day, 0),
        })
        day += timedelta(days=1)
    return out


def _snapshot(now) -> dict:
    week_ago = now - timedelta(days=7)
    total = User.objects.count()
    tiers = dict(
        UserOpsMeta.objects.values('inactivity_tier').annotate(c=Count('id')).values_list('inactivity_tier', 'c')
    )
    flagged = sum(tiers.values())
    platforms = dict(
        DeviceToken.objects.values('platform')
        .annotate(c=Count('user_id', distinct=True))
        .values_list('platform', 'c')
    )
    return {
        'total_users': total,
        'active_7d': User.objects.filter(
            Q(last_login__gte=week_ago)
            | Q(ops_meta__last_seen_at__gte=week_ago)
            | Q(transactions__created_at__gte=week_ago)
            | Q(device_tokens__updated_at__gte=week_ago)
        ).distinct().count(),
        'suspended': User.objects.filter(
            Q(is_active=False) | Q(ops_meta__suspended_at__isnull=False)
        ).distinct().count(),
        'users_with_push': DeviceToken.objects.values('user_id').distinct().count(),
        'premium_live': Entitlement.objects.filter(status=Entitlement.STATUS_ACTIVE)
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        .values('user_id').distinct().count(),
        'support_open': SupportThread.objects.exclude(status=SupportThread.STATUS_CLOSED).count(),
        'support_waiting_ops': SupportThread.objects.filter(status=SupportThread.STATUS_WAITING_OPS).count(),
        'inactivity': {
            'none': tiers.get(UserOpsMeta.INACTIVITY_NONE, 0),
            '7d': tiers.get(UserOpsMeta.INACTIVITY_7D, 0),
            '30d': tiers.get(UserOpsMeta.INACTIVITY_30D, 0),
            '90d': tiers.get(UserOpsMeta.INACTIVITY_90D, 0),
            'unflagged': max(0, total - flagged),
        },
        'platforms': {
            'android': platforms.get('android', 0),
            'ios': platforms.get('ios', 0),
            'web': platforms.get('web', 0),
            'other': sum(v for k, v in platforms.items() if k not in ('android', 'ios', 'web')),
        },
    }


def _iso(value):
    return value.isoformat() if value else None


def _needs_attention(now) -> dict:
    waiting = SupportThread.objects.filter(status=SupportThread.STATUS_WAITING_OPS)
    support_items = [
        {
            'kind': 'support',
            'id': t.id,
            'title': t.subject,
            'detail': f'@{t.user.username}' + (' · high priority' if t.priority == SupportThread.PRIORITY_HIGH else ''),
            'tone': 'danger' if t.priority == SupportThread.PRIORITY_HIGH else 'warn',
            'at': _iso(t.updated_at),
            'to': f'/support/{t.id}',
        }
        for t in waiting.select_related('user')
        .annotate(urgent=Case(When(priority=SupportThread.PRIORITY_HIGH, then=0), default=1, output_field=IntegerField()))
        .order_by('urgent', 'updated_at')[:ATTENTION_LIMIT]
    ]

    failed_purchases = PurchaseEvent.objects.filter(
        status__in=[PurchaseEvent.STATUS_FAILED, PurchaseEvent.STATUS_RECEIVED],
        created_at__gte=now - timedelta(days=14),
    )
    purchase_items = [
        {
            'kind': 'purchase',
            'id': ev.id,
            'title': f'{ev.product_id} verify {ev.status}',
            'detail': f'@{ev.user.username}' + (f' · {ev.error[:80]}' if ev.error else ''),
            'tone': 'danger' if ev.status == PurchaseEvent.STATUS_FAILED else 'warn',
            'at': _iso(ev.created_at),
            'to': '/premium',
        }
        for ev in failed_purchases.select_related('user').order_by('-created_at')[:ATTENTION_LIMIT]
    ]

    upcoming = PushCampaign.objects.filter(
        status=PushCampaign.STATUS_SCHEDULED,
        scheduled_at__isnull=False,
        scheduled_at__lte=now + timedelta(hours=48),
    )
    failed_campaigns = PushCampaign.objects.filter(
        status=PushCampaign.STATUS_FAILED, updated_at__gte=now - timedelta(days=7),
    )
    campaign_items = [
        {
            'kind': 'campaign',
            'id': c.id,
            'title': c.title,
            'detail': 'Scheduled to send' if c.status == PushCampaign.STATUS_SCHEDULED else 'Send failed',
            'tone': 'info' if c.status == PushCampaign.STATUS_SCHEDULED else 'danger',
            'at': _iso(c.scheduled_at if c.status == PushCampaign.STATUS_SCHEDULED else c.updated_at),
            'to': f'/campaigns/{c.id}',
        }
        for c in list(upcoming.order_by('scheduled_at')[:ATTENTION_LIMIT])
        + list(failed_campaigns.order_by('-updated_at')[:ATTENTION_LIMIT])
    ][:ATTENTION_LIMIT]

    return {
        'counts': {
            'support': waiting.count(),
            'purchases': failed_purchases.count(),
            'campaigns': upcoming.count() + failed_campaigns.count(),
        },
        'items': support_items + purchase_items + campaign_items,
    }


class OpsDashboardSummaryView(APIView):
    """GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&compare=1 — Command Center KPIs, series and to-dos."""

    permission_classes = [IsOpsStaff]

    def get(self, request):
        start, end, error = parse_range(request.query_params)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        compare = str(request.query_params.get('compare', '')).lower() in ('1', 'true', 'yes')
        days = (end - start).days + 1
        prev_end = start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=days - 1)
        now = timezone.now()

        return Response({
            'range': {
                'from': start.isoformat(),
                'to': end.isoformat(),
                'days': days,
                'previous_from': prev_start.isoformat() if compare else None,
                'previous_to': prev_end.isoformat() if compare else None,
            },
            'current': _window_counts(start, end),
            'previous': _window_counts(prev_start, prev_end) if compare else None,
            'series': _series(start, end),
            'snapshot': _snapshot(now),
            'needs_attention': _needs_attention(now),
            'generated_at': now.isoformat(),
        })


# ── Analytics report (analytics_agent output) ────────────────────────────────

_MONEY_TEXT = re.compile(
    r'PKR|\bRs\.?\s|₨|income|expense|cash ?flow|spend|spent|\bnet\b|balance|categor|anomal',
    re.IGNORECASE,
)


def _report_candidates() -> list[Path]:
    configured = os.environ.get('OPS_ANALYTICS_REPORT_PATH', '').strip()
    if configured:
        return [Path(configured)]
    repo_root = Path(settings.BASE_DIR).parent
    return [repo_root / 'analytics.json', repo_root / 'docs' / 'analytics.json']


def _strip_money_text(text: str) -> str:
    sentences = re.split(r'(?<=[.!?])\s+', text or '')
    return ' '.join(s for s in sentences if s and not _MONEY_TEXT.search(s)).strip()


def counts_only_report(report: dict) -> dict:
    """Copy of an analytics.json report with every money figure and category removed."""
    out = copy.deepcopy(report)
    metrics = out.get('metrics') or {}
    metrics.pop('money', None)
    for key in ('income_pkr', 'expense_pkr'):
        (metrics.get('growth') or {}).pop(key, None)
    for bucket in ('daily', 'weekly', 'monthly'):
        for row in (metrics.get('activity') or {}).get(bucket) or []:
            row.pop('income_pkr', None)
            row.pop('expense_pkr', None)
    breakdowns = metrics.get('breakdowns') or {}
    breakdowns.pop('expense_categories', None)
    breakdowns.pop('income_categories', None)

    trends = out.get('trends') or {}
    for key in ('income_pkr', 'expense_pkr'):
        (trends.get('direction') or {}).pop(key, None)
    trends['anomalies'] = [a for a in trends.get('anomalies') or [] if not str(a.get('metric', '')).endswith('_pkr')]

    insights = out.get('insights') or {}
    insights['highlights'] = [h for h in insights.get('highlights') or [] if not _MONEY_TEXT.search(h)]
    insights['summary'] = _strip_money_text(insights.get('summary', ''))
    return out


class OpsAnalyticsReportView(APIView):
    """GET — latest analytics_agent report, counts only."""

    permission_classes = [IsOpsStaff]

    def get(self, request):
        for path in _report_candidates():
            if path.is_file():
                try:
                    report = json.loads(path.read_text(encoding='utf-8'))
                except (OSError, ValueError):
                    return Response(
                        {'detail': 'The analytics report could not be read.'},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE,
                    )
                if not isinstance(report, dict):
                    break
                return Response(counts_only_report(report))
        return Response(
            {'detail': 'No analytics report has been published yet. Run analytics_agent to create one.'},
            status=status.HTTP_404_NOT_FOUND,
        )
