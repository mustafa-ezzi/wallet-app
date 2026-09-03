"""Promo codes + Phase 5 ops helpers (audit list, user CSV)."""

from __future__ import annotations

import csv
import io
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .entitlements import premium_summary, serialize_entitlement
from .models import AdminAuditLog, Entitlement, PromoCode, PromoRedemption
from .ops_api import OpsPagination, _serialize_user
from .ops_audit import log_ops_action
from .ops_permissions import IsOpsStaff
from django.contrib.auth.models import User


def serialize_promo(p: PromoCode) -> dict:
    return {
        'id': p.id,
        'code': p.code,
        'product_id': p.product_id,
        'trial_days': p.trial_days,
        'max_redemptions': p.max_redemptions,
        'redemption_count': p.redemption_count,
        'active': p.active,
        'starts_at': p.starts_at.isoformat() if p.starts_at else None,
        'ends_at': p.ends_at.isoformat() if p.ends_at else None,
        'note': p.note or '',
        'is_valid_now': p.is_currently_valid(),
        'created_by_username': getattr(p.created_by, 'username', None) if p.created_by_id else None,
        'created_at': p.created_at.isoformat() if p.created_at else None,
    }


def _apply_promo_entitlement(user: User, promo: PromoCode) -> Entitlement:
    now = timezone.now()
    expires_at = None
    if promo.product_id != Entitlement.PRODUCT_LIFETIME:
        expires_at = now + timedelta(days=max(1, int(promo.trial_days or 30)))

    Entitlement.objects.filter(user=user, status=Entitlement.STATUS_ACTIVE).update(
        status=Entitlement.STATUS_REVOKED,
        updated_at=now,
    )
    return Entitlement.objects.create(
        user=user,
        product_id=promo.product_id,
        source=Entitlement.SOURCE_PROMO,
        status=Entitlement.STATUS_ACTIVE,
        started_at=now,
        expires_at=expires_at,
        note=f'Promo {promo.code}',
    )


class PremiumRedeemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw = (request.data.get('code') or '').strip().upper()
        if not raw:
            return Response({'detail': 'code is required.'}, status=status.HTTP_400_BAD_REQUEST)

        promo = PromoCode.objects.filter(code__iexact=raw).first()
        if not promo:
            return Response({'detail': 'Invalid promo code.'}, status=status.HTTP_404_NOT_FOUND)
        if not promo.is_currently_valid():
            return Response({'detail': 'This promo code is no longer available.'}, status=status.HTTP_400_BAD_REQUEST)
        if PromoRedemption.objects.filter(promo=promo, user=request.user).exists():
            return Response({'detail': 'You already redeemed this code.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            promo = PromoCode.objects.select_for_update().get(pk=promo.pk)
            if not promo.is_currently_valid():
                return Response({'detail': 'This promo code is no longer available.'}, status=status.HTTP_400_BAD_REQUEST)
            ent = _apply_promo_entitlement(request.user, promo)
            PromoRedemption.objects.create(promo=promo, user=request.user, entitlement=ent)
            promo.redemption_count = (promo.redemption_count or 0) + 1
            promo.save(update_fields=['redemption_count', 'updated_at'])

        return Response({
            'ok': True,
            'detail': 'Promo applied.',
            'premium': premium_summary(request.user),
            'entitlement': serialize_entitlement(ent),
        })


class OpsPromoListCreateView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        qs = PromoCode.objects.select_related('created_by').all()
        active = (request.query_params.get('active') or '').strip().lower()
        if active in ('1', 'true', 'yes'):
            qs = qs.filter(active=True)
        elif active in ('0', 'false', 'no'):
            qs = qs.filter(active=False)
        paginator = OpsPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response([serialize_promo(p) for p in page])

    def post(self, request):
        code = (request.data.get('code') or '').strip().upper()
        if not code or len(code) < 3:
            return Response({'detail': 'code must be at least 3 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if PromoCode.objects.filter(code__iexact=code).exists():
            return Response({'detail': 'Code already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        product_id = (request.data.get('product_id') or Entitlement.PRODUCT_MONTHLY).strip()
        valid_products = {c[0] for c in Entitlement.PRODUCT_CHOICES}
        if product_id not in valid_products:
            return Response({'detail': 'Invalid product_id.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            trial_days = max(1, int(request.data.get('trial_days') or 30))
        except (TypeError, ValueError):
            return Response({'detail': 'trial_days must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

        max_redemptions = request.data.get('max_redemptions')
        if max_redemptions in ('', None):
            max_redemptions = None
        else:
            try:
                max_redemptions = max(1, int(max_redemptions))
            except (TypeError, ValueError):
                return Response({'detail': 'max_redemptions must be an integer or null.'}, status=status.HTTP_400_BAD_REQUEST)

        promo = PromoCode.objects.create(
            code=code,
            product_id=product_id,
            trial_days=trial_days,
            max_redemptions=max_redemptions,
            active=bool(request.data.get('active', True)),
            note=(request.data.get('note') or '').strip()[:255],
            created_by=request.user,
        )
        log_ops_action(
            actor=request.user,
            action='promo.create',
            target_type='promo_code',
            target_id=promo.id,
            meta={'code': promo.code, 'trial_days': promo.trial_days},
            request=request,
        )
        return Response(serialize_promo(promo), status=status.HTTP_201_CREATED)


class OpsPromoDetailView(APIView):
    permission_classes = [IsOpsStaff]

    def patch(self, request, promo_id: int):
        try:
            promo = PromoCode.objects.get(pk=promo_id)
        except PromoCode.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data if isinstance(request.data, dict) else {}
        changed = []
        if 'active' in data:
            promo.active = bool(data['active'])
            changed.append('active')
        if 'note' in data:
            promo.note = str(data['note'] or '')[:255]
            changed.append('note')
        if 'trial_days' in data:
            try:
                promo.trial_days = max(1, int(data['trial_days']))
                changed.append('trial_days')
            except (TypeError, ValueError):
                return Response({'detail': 'trial_days must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if 'max_redemptions' in data:
            val = data['max_redemptions']
            if val in ('', None):
                promo.max_redemptions = None
            else:
                try:
                    promo.max_redemptions = max(1, int(val))
                except (TypeError, ValueError):
                    return Response({'detail': 'max_redemptions invalid.'}, status=status.HTTP_400_BAD_REQUEST)
            changed.append('max_redemptions')
        if not changed:
            return Response({'detail': 'No fields to update.'}, status=status.HTTP_400_BAD_REQUEST)
        promo.save()
        log_ops_action(
            actor=request.user,
            action='promo.update',
            target_type='promo_code',
            target_id=promo.id,
            meta={'changed': changed},
            request=request,
        )
        return Response(serialize_promo(promo))


class OpsAuditListView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        qs = AdminAuditLog.objects.select_related('actor').all()
        action = (request.query_params.get('action') or '').strip()
        if action:
            qs = qs.filter(action__icontains=action)
        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(actor__username__icontains=q)
                | Q(target_type__icontains=q)
                | Q(target_id__icontains=q)
                | Q(action__icontains=q)
            )
        paginator = OpsPagination()
        page = paginator.paginate_queryset(qs, request)
        results = []
        for row in page:
            results.append({
                'id': row.id,
                'action': row.action,
                'actor_id': row.actor_id,
                'actor_username': getattr(row.actor, 'username', None) if row.actor_id else None,
                'target_type': row.target_type,
                'target_id': row.target_id,
                'meta': row.meta or {},
                'ip_address': row.ip_address,
                'created_at': row.created_at.isoformat() if row.created_at else None,
            })
        return paginator.get_paginated_response(results)


class OpsUsersExportView(APIView):
    """CSV of hosted users — safe columns only (no balances / ledger)."""

    permission_classes = [IsOpsStaff]

    def get(self, request):
        from .models import DeviceToken, Transaction, Entitlement as Ent
        from django.db.models import Count, Max

        qs = (
            User.objects.all()
            .select_related('ops_meta')
            .annotate(
                wallet_count=Count('accounts', distinct=True),
                device_count=Count('device_tokens', distinct=True),
            )
            .order_by('-date_joined')
        )
        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(username__icontains=q)
                | Q(email__icontains=q)
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
            )
        premium = (request.query_params.get('premium') or '').strip().lower()
        if premium in ('1', 'true', 'yes'):
            now = timezone.now()
            qs = qs.filter(entitlements__status=Ent.STATUS_ACTIVE).filter(
                Q(entitlements__expires_at__isnull=True) | Q(entitlements__expires_at__gt=now)
            ).distinct()

        # Cap export size for safety
        users = list(qs[:5000])
        ids = [u.id for u in users]
        since = timezone.now().date() - timedelta(days=30)
        tx_counts = {
            row['user_id']: row['c']
            for row in (
                Transaction.objects.filter(user_id__in=ids, date__gte=since)
                .values('user_id')
                .annotate(c=Count('id'))
            )
        }
        device_last = {
            row['user_id']: row['m']
            for row in DeviceToken.objects.filter(user_id__in=ids).values('user_id').annotate(m=Max('updated_at'))
        }
        activity_last = {
            row['user_id']: row['m']
            for row in Transaction.objects.filter(user_id__in=ids).values('user_id').annotate(m=Max('created_at'))
        }
        platform_map: dict[int, list[str]] = {uid: [] for uid in ids}
        for row in DeviceToken.objects.filter(user_id__in=ids).values('user_id', 'platform').distinct():
            platform_map.setdefault(row['user_id'], []).append(row['platform'])

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            'id', 'username', 'email', 'first_name', 'last_name',
            'date_joined', 'last_seen_at', 'inactivity_tier', 'suspended',
            'is_premium', 'premium_product', 'wallet_count', 'tx_count_30d',
            'device_count', 'platforms', 'push_enabled',
        ])
        for u in users:
            row = _serialize_user(
                u,
                wallet_count=getattr(u, 'wallet_count', 0),
                tx_count_30d=tx_counts.get(u.id, 0),
                device_count=getattr(u, 'device_count', 0),
                platforms=platform_map.get(u.id, []),
                device_touch=device_last.get(u.id),
                activity_touch=activity_last.get(u.id),
            )
            prem = row.get('premium') or {}
            writer.writerow([
                row['id'], row['username'], row['email'], row['first_name'], row['last_name'],
                row['date_joined'] or '', row['last_seen_at'] or '', row['inactivity_tier'],
                'yes' if row['suspended'] else 'no',
                'yes' if prem.get('is_premium') else 'no',
                prem.get('product_id') or '',
                row['wallet_count'], row['tx_count_30d'], row['device_count'],
                '|'.join(row.get('platforms') or []),
                'yes' if row['push_enabled'] else 'no',
            ])

        log_ops_action(
            actor=request.user,
            action='users.export_csv',
            meta={'count': len(users), 'q': q, 'premium': premium},
            request=request,
        )
        resp = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
        resp['Content-Disposition'] = 'attachment; filename="wallettrails_users.csv"'
        return resp
