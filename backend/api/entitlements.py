"""Premium entitlement helpers — no finance / ledger data."""

from __future__ import annotations

import hashlib
from datetime import timedelta

from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone

from .models import Entitlement


def hash_purchase_token(token: str) -> str:
    return hashlib.sha256((token or '').encode('utf-8')).hexdigest()


def expire_stale_entitlements(user: User | None = None) -> int:
    now = timezone.now()
    qs = Entitlement.objects.filter(
        status=Entitlement.STATUS_ACTIVE,
        expires_at__isnull=False,
        expires_at__lte=now,
    )
    if user is not None:
        qs = qs.filter(user=user)
    return qs.update(status=Entitlement.STATUS_EXPIRED, updated_at=now)


def active_entitlement_for(user: User) -> Entitlement | None:
    expire_stale_entitlements(user)
    now = timezone.now()
    return (
        Entitlement.objects.filter(user=user, status=Entitlement.STATUS_ACTIVE)
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        .order_by('-started_at')
        .first()
    )


def user_is_premium(user: User) -> bool:
    return active_entitlement_for(user) is not None


def premium_summary(user: User) -> dict:
    ent = active_entitlement_for(user)
    if not ent:
        return {
            'is_premium': False,
            'product_id': None,
            'source': None,
            'status': 'free',
            'started_at': None,
            'expires_at': None,
        }
    return {
        'is_premium': True,
        'product_id': ent.product_id,
        'source': ent.source,
        'status': ent.status,
        'started_at': ent.started_at.isoformat() if ent.started_at else None,
        'expires_at': ent.expires_at.isoformat() if ent.expires_at else None,
    }


def default_expiry_for_product(product_id: str, *, started_at=None):
    started = started_at or timezone.now()
    if product_id == Entitlement.PRODUCT_LIFETIME:
        return None
    if product_id == Entitlement.PRODUCT_YEARLY:
        return started + timedelta(days=365)
    return started + timedelta(days=30)


def serialize_entitlement(ent: Entitlement) -> dict:
    live = ent.is_live
    return {
        'id': ent.id,
        'user_id': ent.user_id,
        'username': getattr(ent.user, 'username', None),
        'email': getattr(ent.user, 'email', '') or '',
        'product_id': ent.product_id,
        'source': ent.source,
        'status': Entitlement.STATUS_EXPIRED if (ent.status == Entitlement.STATUS_ACTIVE and not live) else ent.status,
        'is_live': live,
        'started_at': ent.started_at.isoformat() if ent.started_at else None,
        'expires_at': ent.expires_at.isoformat() if ent.expires_at else None,
        'order_id': ent.order_id or '',
        'note': ent.note or '',
        'granted_by_id': ent.granted_by_id,
        'granted_by_username': getattr(ent.granted_by, 'username', None) if ent.granted_by_id else None,
        'created_at': ent.created_at.isoformat() if ent.created_at else None,
        'updated_at': ent.updated_at.isoformat() if ent.updated_at else None,
    }
