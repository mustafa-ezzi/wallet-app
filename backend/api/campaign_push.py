"""
Broadcast push campaigns (Ops Phase 2).

Respects:
- user.is_active
- DeviceToken present
- NotificationPreference.marketing_enabled (default True if no row)
- UserOpsMeta.marketing_opt_out (admin hard opt-out)
Never includes finance payloads.
"""

from __future__ import annotations

from django.db.models import Q, QuerySet
from django.utils import timezone

from .expo_push import send_expo_push
from .models import (
    DeviceToken,
    PushCampaign,
    PushCampaignDelivery,
    UserOpsMeta,
)

# Soft rate limit for accidental spam
MAX_CAMPAIGNS_PER_DAY = 20
EXPO_BATCH = 80
CHANNEL_ID = 'cashtrail-updates'


def audience_device_queryset(audience: str) -> QuerySet[DeviceToken]:
    qs = (
        DeviceToken.objects
        .select_related('user', 'user__ops_meta', 'user__notification_pref')
        .filter(user__is_active=True)
        .exclude(user__ops_meta__marketing_opt_out=True)
        .filter(
            Q(user__notification_pref__isnull=True)
            | Q(user__notification_pref__marketing_enabled=True)
        )
    )

    if audience == PushCampaign.AUDIENCE_ANDROID:
        qs = qs.filter(platform='android')
    elif audience == PushCampaign.AUDIENCE_INACTIVE_7D:
        qs = qs.filter(
            user__ops_meta__inactivity_tier__in=[
                UserOpsMeta.INACTIVITY_7D,
                UserOpsMeta.INACTIVITY_30D,
                UserOpsMeta.INACTIVITY_90D,
            ]
        )
    elif audience == PushCampaign.AUDIENCE_INACTIVE_30D:
        qs = qs.filter(
            user__ops_meta__inactivity_tier__in=[
                UserOpsMeta.INACTIVITY_30D,
                UserOpsMeta.INACTIVITY_90D,
            ]
        )
    elif audience == PushCampaign.AUDIENCE_INACTIVE_90D:
        qs = qs.filter(user__ops_meta__inactivity_tier=UserOpsMeta.INACTIVITY_90D)
    # AUDIENCE_ALL → no extra filter

    return qs.order_by('user_id', '-updated_at')


def estimate_recipients(audience: str) -> dict:
    """Unique users + device token count for an audience."""
    qs = audience_device_queryset(audience)
    tokens = qs.count()
    users = qs.values('user_id').distinct().count()
    return {'users': users, 'tokens': tokens}


def campaigns_sent_today() -> int:
    start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return PushCampaign.objects.filter(
        status=PushCampaign.STATUS_SENT,
        sent_at__gte=start,
    ).count()


def _campaign_data(campaign: PushCampaign) -> dict:
    data = dict(campaign.data or {})
    data.setdefault('type', 'campaign')
    data['campaign_id'] = campaign.id
    return data


def send_campaign(campaign: PushCampaign, *, dry_run: bool = False) -> dict:
    """
    Resolve audience, create delivery rows, push via Expo.
    One delivery per device token (user may have multiple devices).
    """
    if campaign.status in {
        PushCampaign.STATUS_SENT,
        PushCampaign.STATUS_SENDING,
        PushCampaign.STATUS_CANCELLED,
    }:
        return {
            'ok': False,
            'detail': f'Campaign is {campaign.status} and cannot be sent.',
            'sent_ok': campaign.sent_ok,
            'sent_failed': campaign.sent_failed,
        }
    # STATUS_FAILED and STATUS_DRAFT / STATUS_SCHEDULED can be (re)sent.

    if not dry_run and campaigns_sent_today() >= MAX_CAMPAIGNS_PER_DAY:
        return {
            'ok': False,
            'detail': f'Daily campaign limit reached ({MAX_CAMPAIGNS_PER_DAY}).',
            'sent_ok': 0,
            'sent_failed': 0,
        }

    devices = list(audience_device_queryset(campaign.audience))
    # Prefer latest token per user when multiple — still notify all devices
    estimate = estimate_recipients(campaign.audience)
    campaign.recipient_estimate = estimate['users']
    campaign.save(update_fields=['recipient_estimate', 'updated_at'])

    if dry_run:
        return {
            'ok': True,
            'dry_run': True,
            'users': estimate['users'],
            'tokens': estimate['tokens'],
            'sent_ok': 0,
            'sent_failed': 0,
            'detail': (
                None if estimate['tokens']
                else 'No devices registered. Users must open the native APK → Settings → Link this device for push (FCM required).'
            ),
        }

    if not devices:
        campaign.status = PushCampaign.STATUS_FAILED
        campaign.last_error = (
            'No push tokens for this audience. Users need a native EAS APK with FCM, '
            'then Settings → Link this device for push.'
        )
        campaign.sent_ok = 0
        campaign.sent_failed = 0
        campaign.sent_at = timezone.now()
        campaign.save(update_fields=[
            'status', 'last_error', 'sent_ok', 'sent_failed', 'sent_at', 'updated_at',
        ])
        return {
            'ok': False,
            'dry_run': False,
            'users': 0,
            'tokens': 0,
            'sent_ok': 0,
            'sent_failed': 0,
            'detail': campaign.last_error,
        }

    campaign.status = PushCampaign.STATUS_SENDING
    campaign.last_error = ''
    campaign.save(update_fields=['status', 'last_error', 'updated_at'])

    # Clear prior pending deliveries if re-sending a failed draft path
    PushCampaignDelivery.objects.filter(campaign=campaign).delete()

    delivery_rows: list[PushCampaignDelivery] = []
    for device in devices:
        delivery_rows.append(
            PushCampaignDelivery(
                campaign=campaign,
                user_id=device.user_id,
                device_token=device,
                token_snapshot=device.token[:255],
                status=PushCampaignDelivery.STATUS_PENDING,
            )
        )
    if delivery_rows:
        PushCampaignDelivery.objects.bulk_create(delivery_rows, batch_size=500)

    deliveries = list(
        PushCampaignDelivery.objects.filter(campaign=campaign).select_related('device_token')
    )
    ok_total = 0
    fail_total = 0
    errors: list[str] = []

    for i in range(0, len(deliveries), EXPO_BATCH):
        batch = deliveries[i:i + EXPO_BATCH]
        tokens = [d.token_snapshot for d in batch]
        result = send_expo_push(
            tokens,
            title=campaign.title,
            body=campaign.body,
            data=_campaign_data(campaign),
            channel_id=CHANNEL_ID,
        )
        tickets = result.get('tickets') or []
        # Map by index into valid messages; invalid tokens are skipped in helper
        ticket_by_token = {t.get('token'): t for t in tickets if isinstance(t, dict)}

        for delivery in batch:
            ticket = ticket_by_token.get(delivery.token_snapshot)
            if ticket and ticket.get('status') == 'ok':
                delivery.status = PushCampaignDelivery.STATUS_OK
                delivery.expo_ticket_id = str(ticket.get('id') or '')[:128]
                delivery.error = ''
                ok_total += 1
            elif ticket:
                delivery.status = PushCampaignDelivery.STATUS_FAILED
                delivery.error = str(ticket.get('message') or 'expo error')[:255]
                fail_total += 1
            else:
                # Token skipped as non-Expo or missing from response
                delivery.status = PushCampaignDelivery.STATUS_SKIPPED
                delivery.error = 'invalid or unmatched token'
                fail_total += 1
            delivery.save(update_fields=['status', 'expo_ticket_id', 'error'])

        for err in result.get('errors') or []:
            if err and err not in errors:
                errors.append(str(err)[:200])
            if len(errors) >= 5:
                break

    campaign.sent_ok = ok_total
    campaign.sent_failed = fail_total
    campaign.sent_at = timezone.now()
    campaign.status = PushCampaign.STATUS_SENT if ok_total > 0 else PushCampaign.STATUS_FAILED
    campaign.last_error = '; '.join(errors)[:1000]
    campaign.save(update_fields=[
        'sent_ok', 'sent_failed', 'sent_at', 'status', 'last_error', 'updated_at',
    ])

    # Touch re-engagement timestamp for inactive audiences
    if campaign.audience in {
        PushCampaign.AUDIENCE_INACTIVE_7D,
        PushCampaign.AUDIENCE_INACTIVE_30D,
        PushCampaign.AUDIENCE_INACTIVE_90D,
    }:
        user_ids = {d.user_id for d in deliveries}
        now = timezone.now()
        UserOpsMeta.objects.filter(user_id__in=user_ids).update(
            last_reengagement_push_at=now,
            updated_at=now,
        )

    return {
        'ok': ok_total > 0,
        'dry_run': False,
        'users': estimate['users'],
        'tokens': len(deliveries),
        'sent_ok': ok_total,
        'sent_failed': fail_total,
        'detail': campaign.last_error or None,
    }


def process_due_scheduled_campaigns(*, dry_run: bool = False) -> dict:
    """Send campaigns whose scheduled_at is due (for cron)."""
    now = timezone.now()
    due = list(
        PushCampaign.objects.filter(
            status=PushCampaign.STATUS_SCHEDULED,
            scheduled_at__lte=now,
        ).order_by('scheduled_at')[:10]
    )
    results = []
    for campaign in due:
        if dry_run:
            results.append({'id': campaign.id, 'dry_run': True})
            continue
        results.append({'id': campaign.id, **send_campaign(campaign)})
    return {'processed': len(results), 'results': results}


def can_create_campaign_today() -> bool:
    start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    created = PushCampaign.objects.filter(created_at__gte=start).exclude(
        status=PushCampaign.STATUS_CANCELLED,
    ).count()
    return created < MAX_CAMPAIGNS_PER_DAY + 5  # drafts allowed a bit more; send still capped
