"""Daily due-date push for payables / receivables (Asia/Karachi)."""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.db import IntegrityError
from django.utils import timezone

from .expo_push import send_expo_push
from .models import (
    DeviceToken,
    NotificationPreference,
    PayableInstallment,
    PushDeliveryLog,
    ReceivableInstallment,
)

KARACHI = ZoneInfo('Asia/Karachi')
DEFAULT_LEADS = (3, 1, 0)


def karachi_today() -> date:
    return timezone.now().astimezone(KARACHI).date()


def clamp_due_day(year: int, month: int, due_day: int) -> int:
    dim = calendar.monthrange(year, month)[1]
    return min(max(1, int(due_day or 1)), dim)


def due_date_for_month(year: int, month: int, due_day: int) -> date:
    return date(year, month, clamp_due_day(year, month, due_day))


def next_due_on_or_after(today: date, due_day: int) -> date:
    candidate = due_date_for_month(today.year, today.month, due_day)
    if candidate < today:
        if today.month == 12:
            candidate = due_date_for_month(today.year + 1, 1, due_day)
        else:
            candidate = due_date_for_month(today.year, today.month + 1, due_day)
    return candidate


def lead_label(lead: int) -> str:
    if lead == 0:
        return 'due today'
    if lead == 1:
        return 'due tomorrow'
    return f'due in {lead} days'


def prefs_for(user: User) -> NotificationPreference:
    pref, _ = NotificationPreference.objects.get_or_create(user=user)
    return pref


def _already_sent(user_id: int, kind: str, object_id: int, lead: int, notify_date: date) -> bool:
    return PushDeliveryLog.objects.filter(
        user_id=user_id,
        kind=kind,
        object_id=object_id,
        lead_days=lead,
        notify_date=notify_date,
    ).exists()


def _mark_sent(user_id: int, kind: str, object_id: int, lead: int, notify_date: date) -> bool:
    try:
        PushDeliveryLog.objects.create(
            user_id=user_id,
            kind=kind,
            object_id=object_id,
            lead_days=lead,
            notify_date=notify_date,
        )
        return True
    except IntegrityError:
        return False


def _tokens_for(user_id: int) -> list[str]:
    return list(
        DeviceToken.objects.filter(user_id=user_id).values_list('token', flat=True)
    )


def collect_due_events(today: date | None = None) -> list[dict]:
    """
    Build push candidates for today (Karachi).
    Bodies never include exact PKR amounts (privacy-safe).
    """
    today = today or karachi_today()
    events: list[dict] = []

    payables = PayableInstallment.objects.filter(status='ongoing').select_related('user')
    for p in payables:
        pref = prefs_for(p.user)
        if not pref.enabled or not pref.remind_payables:
            continue
        leads = pref.lead_days() or list(DEFAULT_LEADS)
        due = next_due_on_or_after(today, p.due_day)
        for lead in leads:
            fire = due - timedelta(days=lead)
            if fire != today:
                continue
            if _already_sent(p.user_id, 'payable', p.id, lead, today):
                continue
            events.append({
                'user_id': p.user_id,
                'kind': 'payable',
                'object_id': p.id,
                'lead_days': lead,
                'title': 'Loan reminder',
                'body': f'{p.name} is {lead_label(lead)}. Open CashTrail to review.',
                'data': {
                    'screen': 'bills',
                    'kind': 'payable',
                    'id': p.id,
                },
            })

    receivables = ReceivableInstallment.objects.filter(status='ongoing').select_related(
        'user', 'linked_project'
    )
    for r in receivables:
        pref = prefs_for(r.user)
        if not pref.enabled or not pref.remind_receivables:
            continue
        leads = pref.lead_days() or list(DEFAULT_LEADS)
        due_day = r.start_date.day if r.start_date else 1
        due = next_due_on_or_after(today, due_day)
        for lead in leads:
            fire = due - timedelta(days=lead)
            if fire != today:
                continue
            if _already_sent(r.user_id, 'receivable', r.id, lead, today):
                continue
            name = r.linked_project.name if r.linked_project_id else 'Money owed'
            events.append({
                'user_id': r.user_id,
                'kind': 'receivable',
                'object_id': r.id,
                'lead_days': lead,
                'title': 'Money owed reminder',
                'body': f'{name} is {lead_label(lead)}. Open CashTrail to review.',
                'data': {
                    'screen': 'bills',
                    'kind': 'receivable',
                    'id': r.id,
                },
            })

    return events


def send_due_reminders(*, dry_run: bool = False, today: date | None = None) -> dict:
    today = today or karachi_today()
    events = collect_due_events(today)
    sent = 0
    skipped = 0
    failed = 0
    details: list[dict] = []

    for ev in events:
        tokens = _tokens_for(ev['user_id'])
        if not tokens:
            skipped += 1
            details.append({**ev, 'status': 'no_token'})
            continue

        if dry_run:
            details.append({**ev, 'status': 'dry_run', 'tokens': len(tokens)})
            continue

        if not _mark_sent(ev['user_id'], ev['kind'], ev['object_id'], ev['lead_days'], today):
            skipped += 1
            details.append({**ev, 'status': 'already_sent'})
            continue

        result = send_expo_push(
            tokens,
            title=ev['title'],
            body=ev['body'],
            data=ev['data'],
        )
        if result.get('ok', 0) > 0:
            sent += 1
            details.append({**ev, 'status': 'sent', **result})
        else:
            failed += 1
            # Allow retry later by removing the log if nothing was delivered
            PushDeliveryLog.objects.filter(
                user_id=ev['user_id'],
                kind=ev['kind'],
                object_id=ev['object_id'],
                lead_days=ev['lead_days'],
                notify_date=today,
            ).delete()
            details.append({**ev, 'status': 'failed', **result})

    return {
        'date': today.isoformat(),
        'candidates': len(events),
        'sent': sent,
        'skipped': skipped,
        'failed': failed,
        'dry_run': dry_run,
        'details': details,
    }
