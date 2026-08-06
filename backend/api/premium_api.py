"""
Play Billing verification + user/ops Premium APIs (Phase 4).

Privacy: never expose wallets, transactions, or balances.
Purchase tokens are hashed before storage; raw tokens are not logged.
"""

from __future__ import annotations

import os
from typing import Any

from django.contrib.auth.models import User
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .entitlements import (
    default_expiry_for_product,
    hash_purchase_token,
    premium_summary,
    serialize_entitlement,
)
from .models import Entitlement, PurchaseEvent
from .ops_audit import log_ops_action
from .ops_api import OpsPagination
from .ops_permissions import IsOpsStaff


VALID_PRODUCTS = {
    Entitlement.PRODUCT_MONTHLY,
    Entitlement.PRODUCT_YEARLY,
    Entitlement.PRODUCT_LIFETIME,
}


def _play_package_name() -> str:
    return (
        getattr(settings, 'GOOGLE_PLAY_PACKAGE_NAME', None)
        or os.environ.get('GOOGLE_PLAY_PACKAGE_NAME', '')
        or 'com.cashtrail.app'
    ).strip()


def _play_credentials_path() -> str:
    return (
        getattr(settings, 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', None)
        or os.environ.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', '')
        or ''
    ).strip()


def _skip_play_verify() -> bool:
    """Dev escape hatch — never enable in production."""
    flag = os.environ.get('PLAY_BILLING_SKIP_VERIFY', '').strip().lower()
    return flag in ('1', 'true', 'yes') and bool(getattr(settings, 'DEBUG', False))


def verify_google_play_purchase(*, product_id: str, purchase_token: str, package_name: str) -> dict[str, Any]:
    """
    Verify a subscription/product with Google Play Developer API when credentials exist.
    Returns {ok, status, order_id, expiry_time_ms, summary, error}.
    """
    creds_path = _play_credentials_path()
    if not creds_path:
        if _skip_play_verify():
            return {
                'ok': True,
                'status': 'skipped_verify',
                'order_id': '',
                'expiry_time_ms': None,
                'summary': {'mode': 'debug_skip'},
                'error': '',
            }
        return {
            'ok': False,
            'status': 'not_configured',
            'order_id': '',
            'expiry_time_ms': None,
            'summary': {},
            'error': 'Play Billing verification is not configured on the server.',
        }

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        return {
            'ok': False,
            'status': 'missing_library',
            'order_id': '',
            'expiry_time_ms': None,
            'summary': {},
            'error': 'google-api-python-client is not installed on the server.',
        }

    try:
        credentials = service_account.Credentials.from_service_account_file(
            creds_path,
            scopes=['https://www.googleapis.com/auth/androidpublisher'],
        )
        service = build('androidpublisher', 'v3', credentials=credentials, cache_discovery=False)

        # Prefer subscriptions; fall back to one-time products (lifetime).
        order_id = ''
        expiry_ms = None
        summary: dict[str, Any] = {}
        try:
            result = (
                service.purchases()
                .subscriptions()
                .get(packageName=package_name, subscriptionId=product_id, token=purchase_token)
                .execute()
            )
            order_id = str(result.get('orderId') or '')
            expiry_ms = result.get('expiryTimeMillis')
            if expiry_ms is not None:
                expiry_ms = int(expiry_ms)
            summary = {
                'paymentState': result.get('paymentState'),
                'cancelReason': result.get('cancelReason'),
                'acknowledgementState': result.get('acknowledgementState'),
            }
            # paymentState 1 = received, 2 = free trial, 3 = pending deferred
            payment_ok = result.get('paymentState') in (1, 2, None)
            if not payment_ok and result.get('paymentState') == 0:
                return {
                    'ok': False,
                    'status': 'payment_pending',
                    'order_id': order_id,
                    'expiry_time_ms': expiry_ms,
                    'summary': summary,
                    'error': 'Purchase payment is still pending.',
                }
        except Exception:
            result = (
                service.purchases()
                .products()
                .get(packageName=package_name, productId=product_id, token=purchase_token)
                .execute()
            )
            order_id = str(result.get('orderId') or '')
            summary = {
                'purchaseState': result.get('purchaseState'),
                'acknowledgementState': result.get('acknowledgementState'),
                'consumptionState': result.get('consumptionState'),
            }
            # purchaseState 0 = purchased
            if result.get('purchaseState') not in (0, None):
                return {
                    'ok': False,
                    'status': 'not_purchased',
                    'order_id': order_id,
                    'expiry_time_ms': None,
                    'summary': summary,
                    'error': 'Play reports this product was not purchased.',
                }

        return {
            'ok': True,
            'status': 'verified',
            'order_id': order_id,
            'expiry_time_ms': expiry_ms,
            'summary': summary,
            'error': '',
        }
    except Exception as exc:
        return {
            'ok': False,
            'status': 'verify_error',
            'order_id': '',
            'expiry_time_ms': None,
            'summary': {},
            'error': str(exc)[:240],
        }


class PremiumMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(premium_summary(request.user))


class PremiumVerifyView(APIView):
    """Client posts Play purchase; server verifies (when configured) and activates entitlement."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        product_id = (request.data.get('product_id') or '').strip()
        purchase_token = (request.data.get('purchase_token') or '').strip()
        order_id = (request.data.get('order_id') or '').strip()
        package_name = (request.data.get('package_name') or _play_package_name()).strip()

        if product_id not in VALID_PRODUCTS:
            return Response(
                {'detail': f'Invalid product_id. Expected one of: {sorted(VALID_PRODUCTS)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not purchase_token:
            return Response({'detail': 'purchase_token is required.'}, status=status.HTTP_400_BAD_REQUEST)

        token_hash = hash_purchase_token(purchase_token)
        existing = (
            Entitlement.objects.filter(purchase_token_hash=token_hash, status=Entitlement.STATUS_ACTIVE)
            .order_by('-started_at')
            .first()
        )
        if existing and existing.user_id == request.user.id and existing.is_live:
            return Response({
                'ok': True,
                'detail': 'Already entitled.',
                'premium': premium_summary(request.user),
                'entitlement': serialize_entitlement(existing),
            })

        event = PurchaseEvent.objects.create(
            user=request.user,
            product_id=product_id,
            purchase_token_hash=token_hash,
            order_id=order_id,
            package_name=package_name,
            status=PurchaseEvent.STATUS_RECEIVED,
            raw_summary={'client_order_id': order_id[:64]} if order_id else {},
        )

        verified = verify_google_play_purchase(
            product_id=product_id,
            purchase_token=purchase_token,
            package_name=package_name,
        )
        if not verified['ok']:
            event.status = PurchaseEvent.STATUS_FAILED
            event.error = verified.get('error') or verified.get('status') or 'verify_failed'
            event.raw_summary = {**(event.raw_summary or {}), **(verified.get('summary') or {}), 'verify_status': verified.get('status')}
            event.save(update_fields=['status', 'error', 'raw_summary', 'updated_at'])
            http = status.HTTP_503_SERVICE_UNAVAILABLE if verified.get('status') == 'not_configured' else status.HTTP_400_BAD_REQUEST
            return Response(
                {
                    'ok': False,
                    'detail': event.error,
                    'verify_status': verified.get('status'),
                    'premium': premium_summary(request.user),
                },
                status=http,
            )

        now = timezone.now()
        expires_at = default_expiry_for_product(product_id, started_at=now)
        if verified.get('expiry_time_ms'):
            try:
                from datetime import datetime, timezone as dt_timezone
                expires_at = datetime.fromtimestamp(
                    int(verified['expiry_time_ms']) / 1000.0,
                    tz=dt_timezone.utc,
                )
            except (TypeError, ValueError, OSError):
                pass

        # Revoke overlapping active entitlements for this user (replace with latest purchase).
        Entitlement.objects.filter(user=request.user, status=Entitlement.STATUS_ACTIVE).update(
            status=Entitlement.STATUS_REVOKED,
            updated_at=now,
        )

        ent = Entitlement.objects.create(
            user=request.user,
            product_id=product_id,
            source=Entitlement.SOURCE_PLAY,
            status=Entitlement.STATUS_ACTIVE,
            started_at=now,
            expires_at=expires_at,
            purchase_token_hash=token_hash,
            order_id=verified.get('order_id') or order_id,
            note='Play Billing purchase',
        )
        event.status = PurchaseEvent.STATUS_VERIFIED
        event.order_id = ent.order_id
        event.entitlement = ent
        event.raw_summary = {**(event.raw_summary or {}), **(verified.get('summary') or {}), 'verify_status': verified.get('status')}
        event.error = ''
        event.save(update_fields=['status', 'order_id', 'entitlement', 'raw_summary', 'error', 'updated_at'])

        return Response({
            'ok': True,
            'detail': 'Premium activated.',
            'premium': premium_summary(request.user),
            'entitlement': serialize_entitlement(ent),
        })


class OpsPremiumListView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        qs = (
            Entitlement.objects.select_related('user', 'granted_by')
            .all()
            .order_by('-started_at')
        )
        status_filter = (request.query_params.get('status') or '').strip().lower()
        if status_filter == 'live':
            now = timezone.now()
            qs = qs.filter(status=Entitlement.STATUS_ACTIVE).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gt=now)
            )
        elif status_filter in {
            Entitlement.STATUS_ACTIVE,
            Entitlement.STATUS_EXPIRED,
            Entitlement.STATUS_REVOKED,
            Entitlement.STATUS_PENDING,
        }:
            qs = qs.filter(status=status_filter)

        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(user__username__icontains=q)
                | Q(user__email__icontains=q)
                | Q(order_id__icontains=q)
            )

        product = (request.query_params.get('product_id') or '').strip()
        if product:
            qs = qs.filter(product_id=product)

        paginator = OpsPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response([serialize_entitlement(e) for e in page])


class OpsPremiumStatsView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        now = timezone.now()
        live = Entitlement.objects.filter(status=Entitlement.STATUS_ACTIVE).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now)
        )
        pending_failed = PurchaseEvent.objects.filter(
            status__in=[PurchaseEvent.STATUS_RECEIVED, PurchaseEvent.STATUS_FAILED]
        ).count()
        return Response({
            'live_premium': live.count(),
            'live_monthly': live.filter(product_id=Entitlement.PRODUCT_MONTHLY).count(),
            'live_yearly': live.filter(product_id=Entitlement.PRODUCT_YEARLY).count(),
            'live_lifetime': live.filter(product_id=Entitlement.PRODUCT_LIFETIME).count(),
            'manual_grants_live': live.filter(source=Entitlement.SOURCE_MANUAL).count(),
            'play_live': live.filter(source=Entitlement.SOURCE_PLAY).count(),
            'pending_or_failed_purchases': pending_failed,
            'play_verify_configured': bool(_play_credentials_path()) or _skip_play_verify(),
        })


class OpsPremiumGrantView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request):
        user_id = request.data.get('user_id')
        username = (request.data.get('username') or '').strip()
        product_id = (request.data.get('product_id') or Entitlement.PRODUCT_MONTHLY).strip()
        days = request.data.get('days')
        note = (request.data.get('note') or '').strip()[:255]
        source = (request.data.get('source') or Entitlement.SOURCE_MANUAL).strip()

        if product_id not in VALID_PRODUCTS:
            return Response({'detail': 'Invalid product_id.'}, status=status.HTTP_400_BAD_REQUEST)
        if source not in {Entitlement.SOURCE_MANUAL, Entitlement.SOURCE_PROMO}:
            return Response({'detail': 'source must be manual_grant or promo.'}, status=status.HTTP_400_BAD_REQUEST)

        user = None
        if user_id:
            user = User.objects.filter(pk=user_id).first()
        elif username:
            user = User.objects.filter(username__iexact=username).first()
        if not user:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        if product_id == Entitlement.PRODUCT_LIFETIME:
            expires_at = None
        elif days is not None:
            try:
                expires_at = now + __import__('datetime').timedelta(days=max(1, int(days)))
            except (TypeError, ValueError):
                return Response({'detail': 'days must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            expires_at = default_expiry_for_product(product_id, started_at=now)

        Entitlement.objects.filter(user=user, status=Entitlement.STATUS_ACTIVE).update(
            status=Entitlement.STATUS_REVOKED,
            updated_at=now,
        )
        ent = Entitlement.objects.create(
            user=user,
            product_id=product_id,
            source=source,
            status=Entitlement.STATUS_ACTIVE,
            started_at=now,
            expires_at=expires_at,
            granted_by=request.user,
            note=note or f'{source} by ops',
        )
        log_ops_action(
            actor=request.user,
            action='premium.grant',
            target_type='user',
            target_id=user.id,
            meta={
                'entitlement_id': ent.id,
                'product_id': product_id,
                'source': source,
                'expires_at': expires_at.isoformat() if expires_at else None,
            },
            request=request,
        )
        return Response(serialize_entitlement(ent), status=status.HTTP_201_CREATED)


class OpsPremiumRevokeView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request, entitlement_id: int):
        try:
            ent = Entitlement.objects.select_related('user').get(pk=entitlement_id)
        except Entitlement.DoesNotExist:
            return Response({'detail': 'Entitlement not found.'}, status=status.HTTP_404_NOT_FOUND)

        ent.status = Entitlement.STATUS_REVOKED
        ent.save(update_fields=['status', 'updated_at'])
        log_ops_action(
            actor=request.user,
            action='premium.revoke',
            target_type='entitlement',
            target_id=ent.id,
            meta={'user_id': ent.user_id, 'product_id': ent.product_id},
            request=request,
        )
        return Response(serialize_entitlement(ent))


class OpsPurchaseQueueView(APIView):
    """Failed / unprocessed Play verifies for support."""

    permission_classes = [IsOpsStaff]

    def get(self, request):
        qs = (
            PurchaseEvent.objects.select_related('user', 'entitlement')
            .filter(status__in=[PurchaseEvent.STATUS_RECEIVED, PurchaseEvent.STATUS_FAILED])
            .order_by('-created_at')
        )
        paginator = OpsPagination()
        page = paginator.paginate_queryset(qs, request)
        results = []
        for ev in page:
            results.append({
                'id': ev.id,
                'user_id': ev.user_id,
                'username': ev.user.username,
                'email': ev.user.email or '',
                'product_id': ev.product_id,
                'order_id': ev.order_id,
                'status': ev.status,
                'error': ev.error,
                'created_at': ev.created_at.isoformat() if ev.created_at else None,
            })
        return paginator.get_paginated_response(results)
