"""
CashTrail Ops API — Phase 0–1.

Privacy: serializers expose hosted-user metadata and *counts* only.
Never include Transaction rows, balances, installment amounts, or household ledgers.
"""

from datetime import timedelta

from django.contrib.auth.models import User
from django.db.models import Count, Max, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Account, DeviceToken, Transaction, UserOpsMeta, SupportThread
from .ops_audit import log_ops_action
from .ops_permissions import IsOpsStaff


def _ensure_ops_meta(user: User) -> UserOpsMeta:
    meta, _ = UserOpsMeta.objects.get_or_create(user=user)
    return meta


def _last_seen_for(
    user: User,
    ops_meta: UserOpsMeta | None,
    *,
    device_touch=None,
    activity_touch=None,
):
    """
    Best-effort "last active" for Ops.
    Prefer explicit last_seen / login / device / recent writes — never invent 90d idle
    just because last_login is null (JWT refresh does not update last_login).
    """
    candidates = []
    if user.last_login:
        candidates.append(user.last_login)
    if ops_meta and ops_meta.last_seen_at:
        candidates.append(ops_meta.last_seen_at)
    if device_touch:
        candidates.append(device_touch)
    if activity_touch:
        candidates.append(activity_touch)
    if not candidates and user.date_joined:
        # Brand-new or never stamped — use join time, not "inactive 90d"
        candidates.append(user.date_joined)
    return max(candidates) if candidates else None


def _inactivity_tier(last_seen):
    if last_seen is None:
        return UserOpsMeta.INACTIVITY_90D
    age = timezone.now() - last_seen
    if age >= timedelta(days=90):
        return UserOpsMeta.INACTIVITY_90D
    if age >= timedelta(days=30):
        return UserOpsMeta.INACTIVITY_30D
    if age >= timedelta(days=7):
        return UserOpsMeta.INACTIVITY_7D
    return UserOpsMeta.INACTIVITY_NONE


def _serialize_user(
    user: User,
    *,
    wallet_count=None,
    tx_count_30d=None,
    device_count=None,
    platforms=None,
    device_touch=None,
    activity_touch=None,
):
    ops = getattr(user, 'ops_meta', None)
    last_seen = _last_seen_for(
        user, ops, device_touch=device_touch, activity_touch=activity_touch,
    )
    # Always compute live — do not trust a stale cached inactivity_tier
    tier = _inactivity_tier(last_seen)
    suspended = bool(ops and ops.suspended_at) or (not user.is_active)

    if wallet_count is None:
        wallet_count = user.accounts.count()
    if tx_count_30d is None:
        since = timezone.now().date() - timedelta(days=30)
        tx_count_30d = user.transactions.filter(date__gte=since).count()
    if device_count is None:
        device_count = user.device_tokens.count()
    if platforms is None:
        platforms = list(
            user.device_tokens.order_by('platform')
            .values_list('platform', flat=True)
            .distinct()
        )

    return {
        'id': user.id,
        'username': user.username,
        'email': user.email or '',
        'first_name': user.first_name or '',
        'last_name': user.last_name or '',
        'date_joined': user.date_joined.isoformat() if user.date_joined else None,
        'last_login': user.last_login.isoformat() if user.last_login else None,
        'last_seen_at': last_seen.isoformat() if last_seen else None,
        'is_active': user.is_active,
        'is_staff': user.is_staff,
        'is_superuser': user.is_superuser,
        'suspended': suspended,
        'suspended_at': ops.suspended_at.isoformat() if ops and ops.suspended_at else None,
        'inactivity_tier': tier,
        'marketing_opt_out': bool(ops.marketing_opt_out) if ops else False,
        'wallet_count': wallet_count,
        'tx_count_30d': tx_count_30d,
        'device_count': device_count,
        'platforms': platforms,
        'push_enabled': device_count > 0,
        # Intentionally omitted: balances, transactions, categories, household ledgers
    }


class OpsPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class OpsMeView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        u = request.user
        return Response({
            'id': u.id,
            'username': u.username,
            'email': u.email or '',
            'first_name': u.first_name or '',
            'last_name': u.last_name or '',
            'is_staff': u.is_staff,
            'is_superuser': u.is_superuser,
        })


class OpsDashboardView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        now = timezone.now()
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        total_users = User.objects.count()
        new_24h = User.objects.filter(date_joined__gte=day_ago).count()
        new_7d = User.objects.filter(date_joined__gte=week_ago).count()
        new_30d = User.objects.filter(date_joined__gte=month_ago).count()

        active_7d = User.objects.filter(
            Q(last_login__gte=week_ago)
            | Q(ops_meta__last_seen_at__gte=week_ago)
            | Q(transactions__created_at__gte=week_ago)
            | Q(device_tokens__updated_at__gte=week_ago)
        ).distinct().count()

        suspended = User.objects.filter(
            Q(is_active=False) | Q(ops_meta__suspended_at__isnull=False)
        ).distinct().count()

        devices_with_push = DeviceToken.objects.values('user_id').distinct().count()
        total_tokens = DeviceToken.objects.count()

        inactive_7d = UserOpsMeta.objects.filter(inactivity_tier=UserOpsMeta.INACTIVITY_7D).count()
        inactive_30d = UserOpsMeta.objects.filter(inactivity_tier=UserOpsMeta.INACTIVITY_30D).count()
        inactive_90d = UserOpsMeta.objects.filter(inactivity_tier=UserOpsMeta.INACTIVITY_90D).count()

        # Counts only — never sample transaction amounts
        wallet_accounts = Account.objects.count()
        txs_30d = Transaction.objects.filter(date__gte=month_ago.date()).count()

        return Response({
            'users': {
                'total': total_users,
                'new_24h': new_24h,
                'new_7d': new_7d,
                'new_30d': new_30d,
                'active_7d': active_7d,
                'suspended': suspended,
            },
            'push': {
                'users_with_device': devices_with_push,
                'total_tokens': total_tokens,
            },
            'inactivity': {
                'tier_7d': inactive_7d,
                'tier_30d': inactive_30d,
                'tier_90d': inactive_90d,
            },
            'volume_counts_only': {
                'wallet_accounts': wallet_accounts,
                'transactions_30d': txs_30d,
            },
            'support': {
                'open': SupportThread.objects.exclude(status=SupportThread.STATUS_CLOSED).count(),
                'waiting_ops': SupportThread.objects.filter(status=SupportThread.STATUS_WAITING_OPS).count(),
                'waiting_user': SupportThread.objects.filter(status=SupportThread.STATUS_WAITING_USER).count(),
            },
            'generated_at': now.isoformat(),
        })


class OpsUserListView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
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

        platform = (request.query_params.get('platform') or '').strip().lower()
        if platform:
            qs = qs.filter(device_tokens__platform=platform).distinct()

        inactivity = (request.query_params.get('inactivity') or '').strip().lower()
        if inactivity in {
            UserOpsMeta.INACTIVITY_7D,
            UserOpsMeta.INACTIVITY_30D,
            UserOpsMeta.INACTIVITY_90D,
            UserOpsMeta.INACTIVITY_NONE,
        }:
            qs = qs.filter(ops_meta__inactivity_tier=inactivity)

        suspended = (request.query_params.get('suspended') or '').strip().lower()
        if suspended in ('1', 'true', 'yes'):
            qs = qs.filter(Q(is_active=False) | Q(ops_meta__suspended_at__isnull=False)).distinct()
        elif suspended in ('0', 'false', 'no'):
            qs = qs.filter(is_active=True).filter(
                Q(ops_meta__isnull=True) | Q(ops_meta__suspended_at__isnull=True)
            )

        push = (request.query_params.get('push') or '').strip().lower()
        if push in ('1', 'true', 'yes'):
            qs = qs.filter(device_tokens__isnull=False).distinct()
        elif push in ('0', 'false', 'no'):
            qs = qs.filter(device_tokens__isnull=True)

        since = timezone.now().date() - timedelta(days=30)

        paginator = OpsPagination()
        page = paginator.paginate_queryset(qs, request)
        page_ids = [u.id for u in page]

        platform_map: dict[int, list[str]] = {uid: [] for uid in page_ids}
        for row in (
            DeviceToken.objects.filter(user_id__in=page_ids)
            .values('user_id', 'platform')
            .distinct()
        ):
            platform_map.setdefault(row['user_id'], []).append(row['platform'])

        tx_counts = {
            row['user_id']: row['c']
            for row in (
                Transaction.objects.filter(user_id__in=page_ids, date__gte=since)
                .values('user_id')
                .annotate(c=Count('id'))
            )
        }

        device_last = {
            row['user_id']: row['m']
            for row in (
                DeviceToken.objects.filter(user_id__in=page_ids)
                .values('user_id')
                .annotate(m=Max('updated_at'))
            )
        }
        # Recent writes = real app usage (PWA included), even when last_login is stale
        activity_last = {
            row['user_id']: row['m']
            for row in (
                Transaction.objects.filter(user_id__in=page_ids)
                .values('user_id')
                .annotate(m=Max('created_at'))
            )
        }

        results = [
            _serialize_user(
                u,
                wallet_count=getattr(u, 'wallet_count', None),
                tx_count_30d=tx_counts.get(u.id, 0),
                device_count=getattr(u, 'device_count', None),
                platforms=platform_map.get(u.id, []),
                device_touch=device_last.get(u.id),
                activity_touch=activity_last.get(u.id),
            )
            for u in page
        ]
        return paginator.get_paginated_response(results)


class OpsUserDetailView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request, user_id: int):
        try:
            user = User.objects.select_related('ops_meta').get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = _serialize_user(
            user,
            device_touch=(
                DeviceToken.objects.filter(user=user)
                .order_by('-updated_at')
                .values_list('updated_at', flat=True)
                .first()
            ),
            activity_touch=(
                Transaction.objects.filter(user=user)
                .order_by('-created_at')
                .values_list('created_at', flat=True)
                .first()
            ),
        )
        ops = _ensure_ops_meta(user)
        data['internal_notes'] = ops.internal_notes
        # Latest device touch (no token value — privacy)
        latest = (
            DeviceToken.objects.filter(user=user)
            .order_by('-updated_at')
            .values('platform', 'updated_at')
            .first()
        )
        data['latest_device'] = (
            {
                'platform': latest['platform'],
                'updated_at': latest['updated_at'].isoformat(),
            }
            if latest
            else None
        )
        return Response(data)


class OpsUserSuspendView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request, user_id: int):
        try:
            user = User.objects.select_related('ops_meta').get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        if user.is_superuser:
            return Response(
                {'detail': 'Cannot suspend a superuser.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.id == request.user.id:
            return Response(
                {'detail': 'Cannot suspend yourself.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        meta = _ensure_ops_meta(user)
        now = timezone.now()
        meta.suspended_at = now
        meta.save(update_fields=['suspended_at', 'updated_at'])
        user.is_active = False
        user.save(update_fields=['is_active'])

        log_ops_action(
            actor=request.user,
            action='user.suspend',
            target_type='user',
            target_id=user.id,
            meta={'username': user.username},
            request=request,
        )
        return Response(_serialize_user(user))


class OpsUserUnsuspendView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request, user_id: int):
        try:
            user = User.objects.select_related('ops_meta').get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        meta = _ensure_ops_meta(user)
        meta.suspended_at = None
        meta.save(update_fields=['suspended_at', 'updated_at'])
        user.is_active = True
        user.save(update_fields=['is_active'])

        log_ops_action(
            actor=request.user,
            action='user.unsuspend',
            target_type='user',
            target_id=user.id,
            meta={'username': user.username},
            request=request,
        )
        return Response(_serialize_user(user))


class OpsRefreshInactivityView(APIView):
    """Recompute inactivity_tier flags for all users (flag only — never delete)."""

    permission_classes = [IsOpsStaff]

    def post(self, request):
        updated = 0
        device_last = {
            row['user_id']: row['m']
            for row in DeviceToken.objects.values('user_id').annotate(m=Max('updated_at'))
        }
        activity_last = {
            row['user_id']: row['m']
            for row in Transaction.objects.values('user_id').annotate(m=Max('created_at'))
        }
        for user in User.objects.select_related('ops_meta').iterator(chunk_size=200):
            meta = _ensure_ops_meta(user)
            last_seen = _last_seen_for(
                user,
                meta,
                device_touch=device_last.get(user.id),
                activity_touch=activity_last.get(user.id),
            )
            tier = _inactivity_tier(last_seen)
            fields: list[str] = []
            if last_seen and (meta.last_seen_at is None or last_seen > meta.last_seen_at):
                meta.last_seen_at = last_seen
                fields.append('last_seen_at')
            if meta.inactivity_tier != tier:
                meta.inactivity_tier = tier
                fields.append('inactivity_tier')
            if fields:
                fields.append('updated_at')
                meta.save(update_fields=list(dict.fromkeys(fields)))
                updated += 1

        log_ops_action(
            actor=request.user,
            action='users.refresh_inactivity',
            meta={'updated': updated},
            request=request,
        )
        return Response({'updated': updated})
