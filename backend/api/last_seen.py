"""Track when a user last hit the API (PWA / mobile JWT) — used for Ops inactivity."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from .models import UserOpsMeta

# Avoid a DB write on every request
TOUCH_MIN_INTERVAL = timedelta(minutes=10)


def touch_user_last_seen(user) -> None:
    if not user or not getattr(user, 'is_authenticated', False):
        return
    if not getattr(user, 'is_active', True):
        return
    if getattr(user, 'is_anonymous', False):
        return

    now = timezone.now()
    meta, _ = UserOpsMeta.objects.get_or_create(user_id=user.id)
    if meta.last_seen_at and (now - meta.last_seen_at) < TOUCH_MIN_INTERVAL:
        return

    meta.last_seen_at = now
    meta.inactivity_tier = UserOpsMeta.INACTIVITY_NONE
    meta.save(update_fields=['last_seen_at', 'inactivity_tier', 'updated_at'])
