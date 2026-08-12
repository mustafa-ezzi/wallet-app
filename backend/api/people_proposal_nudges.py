"""Nudge push for unanswered people proposals (Phase J)."""
from __future__ import annotations

from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db import IntegrityError
from django.utils import timezone

from .models import PeopleProposal, PushDeliveryLog
from .people_linked_api import _display_name_for, _notify_people_user

KARACHI = ZoneInfo('Asia/Karachi')
DEFAULT_MIN_AGE_DAYS = 2


def karachi_today():
    return timezone.now().astimezone(KARACHI).date()


def send_people_proposal_nudges(*, dry_run: bool = False, min_age_days: int = DEFAULT_MIN_AGE_DAYS) -> dict:
    today = karachi_today()
    cutoff = timezone.now() - timedelta(days=max(1, int(min_age_days)))
    qs = (
        PeopleProposal.objects.filter(status='pending', created_at__lte=cutoff)
        .select_related('proposer', 'counterparty', 'link', 'link__person_a', 'link__person_b')
        .order_by('id')
    )

    candidates = 0
    sent = 0
    skipped = 0
    failed = 0

    for proposal in qs:
        candidates += 1
        user = proposal.counterparty
        already = PushDeliveryLog.objects.filter(
            user_id=user.id,
            kind='people_proposal',
            object_id=proposal.id,
            lead_days=min_age_days,
            notify_date=today,
        ).exists()
        if already:
            skipped += 1
            continue

        if dry_run:
            sent += 1
            continue

        try:
            PushDeliveryLog.objects.create(
                user_id=user.id,
                kind='people_proposal',
                object_id=proposal.id,
                lead_days=min_age_days,
                notify_date=today,
            )
        except IntegrityError:
            skipped += 1
            continue

        person = proposal.link.person_for(user) if proposal.link_id else None
        actor_name = _display_name_for(proposal.proposer)
        try:
            _notify_people_user(
                user=user,
                actor=proposal.proposer,
                kind='proposal',
                title=f'Reminder: {actor_name} is waiting on a {proposal.action}',
                body=f'PKR {proposal.amount} — open History to accept or decline.',
                proposal=proposal,
                data={
                    'route': 'people',
                    'person_id': person.id if person else None,
                    'nudge': True,
                },
            )
            sent += 1
        except Exception:
            failed += 1

    return {
        'date': str(today),
        'min_age_days': min_age_days,
        'candidates': candidates,
        'sent': sent,
        'skipped': skipped,
        'failed': failed,
        'dry_run': dry_run,
    }
