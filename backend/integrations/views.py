"""Ops team, integrations, short-lived Ops login, and the nightly sync job."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core import signing
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from api.ops_audit import log_ops_action
from api.ops_permissions import ops

from .adapters import get_adapter, write_metric_rows
from .crypto import encrypt_token, issue_oauth_state, read_oauth_state
from .models import IntegrationAccount, StaffRole
from .roles import ROLE_CAPABILITIES, capabilities_for, role_for
from .sync import run_all_syncs, run_sync

OPS_ACCESS_LIFETIME = timedelta(hours=2)
OPS_REFRESH_LIFETIME = timedelta(days=7)

PROVIDERS = (
    (IntegrationAccount.PROVIDER_GA4, 'Google Analytics 4'),
    (IntegrationAccount.PROVIDER_INSTAGRAM, 'Instagram'),
    (IntegrationAccount.PROVIDER_FACEBOOK, 'Facebook'),
    (IntegrationAccount.PROVIDER_LINKEDIN, 'LinkedIn'),
)
PROVIDER_KEYS = {key for key, _label in PROVIDERS}


def _issue_ops_tokens(user):
    refresh = RefreshToken.for_user(user)
    refresh.set_exp(lifetime=OPS_REFRESH_LIFETIME)
    access = refresh.access_token
    access.set_exp(lifetime=OPS_ACCESS_LIFETIME)
    return str(access), str(refresh)


class OpsLoginView(APIView):
    """Staff login with a 2-hour access token. The mobile app keeps the longer JWT."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        username = (request.data.get('username') or '').strip()
        password = request.data.get('password') or ''
        user = authenticate(username=username, password=password)
        if user is None or not user.is_active:
            return Response({'detail': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.is_staff:
            return Response({'detail': 'Ops access requires a staff account.'}, status=status.HTTP_403_FORBIDDEN)
        access, refresh = _issue_ops_tokens(user)
        return Response({'access': access, 'refresh': refresh})


class OpsRefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = (request.data.get('refresh') or '').strip()
        try:
            refresh = RefreshToken(raw)
        except TokenError:
            return Response({'detail': 'Invalid refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            user = User.objects.get(pk=refresh.get('user_id'))
        except User.DoesNotExist:
            return Response({'detail': 'Invalid refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.is_active or not user.is_staff:
            return Response({'detail': 'Ops access requires a staff account.'}, status=status.HTTP_403_FORBIDDEN)
        access = refresh.access_token
        access.set_exp(lifetime=OPS_ACCESS_LIFETIME)
        return Response({'access': str(access)})


def me_payload(user) -> dict:
    caps = sorted(capabilities_for(user))
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email or '',
        'first_name': user.first_name or '',
        'last_name': user.last_name or '',
        'is_staff': user.is_staff,
        'is_superuser': user.is_superuser,
        'role': role_for(user),
        'capabilities': caps,
    }


def _serialize_member(user) -> dict:
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email or '',
        'role': role_for(user),
        'is_superuser': user.is_superuser,
    }


class OpsTeamListCreateView(APIView):
    permission_classes = [ops({'GET': 'team.read', 'POST': 'team.write'})]

    def get(self, request):
        users = User.objects.filter(is_staff=True).order_by('username')
        return Response({'results': [_serialize_member(user) for user in users]})

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        username = (data.get('username') or '').strip()
        email = (data.get('email') or '').strip()
        role = (data.get('role') or '').strip()
        password = data.get('password') or ''
        if role not in ROLE_CAPABILITIES:
            return Response({'detail': 'Pick a role.'}, status=status.HTTP_400_BAD_REQUEST)
        if not username:
            return Response({'detail': 'Username is required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(username=username).first()
        created = False
        if user is None:
            if len(password) < 8:
                return Response(
                    {'detail': 'A new staff user needs a password of at least 8 characters.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user = User.objects.create_user(username=username, email=email, password=password)
            created = True
        elif password:
            if len(password) < 8:
                return Response(
                    {'detail': 'Password must be at least 8 characters.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(password)
        if email:
            user.email = email
        user.is_staff = True
        user.is_active = True
        user.save()
        StaffRole.objects.update_or_create(user=user, defaults={'role': role})
        log_ops_action(
            actor=request.user,
            action='team.invite' if created else 'team.role',
            target_type='user',
            target_id=user.id,
            meta={'username': user.username, 'role': role},
            request=request,
        )
        return Response(_serialize_member(user), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class OpsTeamDetailView(APIView):
    permission_classes = [ops({'PATCH': 'team.write', 'POST': 'team.write'})]

    def patch(self, request, user_id: int):
        role = (request.data.get('role') or '').strip() if isinstance(request.data, dict) else ''
        if role not in ROLE_CAPABILITIES:
            return Response({'detail': 'Pick a role.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=user_id, is_staff=True)
        except User.DoesNotExist:
            return Response({'detail': 'Staff user not found.'}, status=status.HTTP_404_NOT_FOUND)
        if role != StaffRole.ROLE_OWNER and _owner_count(except_user=user) < 1:
            return Response({'detail': 'Keep at least one owner.'}, status=status.HTTP_400_BAD_REQUEST)
        StaffRole.objects.update_or_create(user=user, defaults={'role': role})
        log_ops_action(
            actor=request.user,
            action='team.role',
            target_type='user',
            target_id=user.id,
            meta={'username': user.username, 'role': role},
            request=request,
        )
        return Response(_serialize_member(user))

    def post(self, request, user_id: int):
        """Revoke Ops access. The user account itself stays."""
        if user_id == request.user.id:
            return Response({'detail': 'You cannot remove your own access.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=user_id, is_staff=True)
        except User.DoesNotExist:
            return Response({'detail': 'Staff user not found.'}, status=status.HTTP_404_NOT_FOUND)
        if role_for(user) == StaffRole.ROLE_OWNER and _owner_count(except_user=user) < 1:
            return Response({'detail': 'Keep at least one owner.'}, status=status.HTTP_400_BAD_REQUEST)
        user.is_staff = False
        user.save(update_fields=['is_staff'])
        StaffRole.objects.filter(user=user).delete()
        log_ops_action(
            actor=request.user,
            action='team.revoke',
            target_type='user',
            target_id=user.id,
            meta={'username': user.username},
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


def _owner_count(*, except_user=None) -> int:
    owners = 0
    qs = User.objects.filter(is_staff=True)
    if except_user is not None:
        qs = qs.exclude(pk=except_user.pk)
    for user in qs:
        if role_for(user) == StaffRole.ROLE_OWNER:
            owners += 1
    return owners


def _card(provider: str, label: str, account: IntegrationAccount | None) -> dict:
    return {
        'provider': provider,
        'label': label,
        'id': account.id if account else None,
        'status': account.status if account else IntegrationAccount.STATUS_NOT_SETUP,
        'display_name': account.display_name if account else '',
        'external_id': account.external_id if account else '',
        'token_expires_at': account.token_expires_at.isoformat() if account and account.token_expires_at else None,
        'last_sync_at': account.last_sync_at.isoformat() if account and account.last_sync_at else None,
        'last_error': account.last_error if account else '',
        'connected_at': account.connected_at.isoformat() if account and account.connected_at else None,
        'scopes': list(account.scopes or []) if account else [],
    }


class OpsIntegrationListView(APIView):
    permission_classes = [ops('integrations.read')]

    def get(self, request):
        by_provider = {row.provider: row for row in IntegrationAccount.objects.all()}
        return Response({
            'results': [_card(key, label, by_provider.get(key)) for key, label in PROVIDERS],
        })


class OpsIntegrationConnectView(APIView):
    permission_classes = [ops('integrations.write')]

    def post(self, request, provider: str):
        if provider not in PROVIDER_KEYS:
            return Response({'detail': 'Unknown provider.'}, status=status.HTTP_404_NOT_FOUND)
        adapter = get_adapter(provider)
        state = issue_oauth_state(request.user.id, provider)
        if adapter is None or not adapter.configured():
            return Response(
                {'detail': 'Not set up. Add this provider’s credentials on the server before connecting.', 'state': state},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {'detail': 'This provider’s connect flow is not available yet.', 'state': state},
            status=status.HTTP_400_BAD_REQUEST,
        )


class OpsIntegrationCallbackView(APIView):
    """OAuth redirect target. The signed state is the staff binding; no token is stored yet."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, provider: str):
        if provider not in PROVIDER_KEYS:
            return Response({'detail': 'Unknown provider.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            read_oauth_state(request.query_params.get('state') or '', provider)
        except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
            return Response({'detail': 'OAuth state is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Not set up.'}, status=status.HTTP_400_BAD_REQUEST)


class OpsIntegrationSyncView(APIView):
    permission_classes = [ops('integrations.write')]

    def post(self, request, account_id: int):
        try:
            account = IntegrationAccount.objects.get(pk=account_id)
        except IntegrationAccount.DoesNotExist:
            return Response({'detail': 'Integration not found.'}, status=status.HTTP_404_NOT_FOUND)
        run = run_sync(account)
        account.refresh_from_db()
        log_ops_action(
            actor=request.user,
            action='integration.sync',
            target_type='integration',
            target_id=account.id,
            meta={'provider': account.provider, 'ok': run.ok, 'rows_written': run.rows_written},
            request=request,
        )
        label = dict(PROVIDERS).get(account.provider, account.provider)
        body = _card(account.provider, label, account)
        body['rows_written'] = run.rows_written
        if not run.ok:
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        return Response(body)


class OpsIntegrationDisconnectView(APIView):
    permission_classes = [ops('integrations.write')]

    def post(self, request, account_id: int):
        try:
            account = IntegrationAccount.objects.get(pk=account_id)
        except IntegrationAccount.DoesNotExist:
            return Response({'detail': 'Integration not found.'}, status=status.HTTP_404_NOT_FOUND)
        account.encrypted_token = ''
        account.token_expires_at = None
        account.status = IntegrationAccount.STATUS_NOT_SETUP
        account.scopes = []
        account.save(update_fields=['encrypted_token', 'token_expires_at', 'status', 'scopes'])
        log_ops_action(
            actor=request.user,
            action='integration.disconnect',
            target_type='integration',
            target_id=account.id,
            meta={'provider': account.provider},
            request=request,
        )
        label = dict(PROVIDERS).get(account.provider, account.provider)
        return Response(_card(account.provider, label, account))


class OpsLinkedInUploadView(APIView):
    """JSON metric rows until the Community Management API is approved. No commenter data."""

    permission_classes = [ops('integrations.write')]

    def post(self, request):
        rows = request.data.get('rows') if isinstance(request.data, dict) else None
        if not isinstance(rows, list) or not rows:
            return Response({'detail': 'Send a rows list of metric, date and value.'}, status=status.HTTP_400_BAD_REQUEST)
        account, _created = IntegrationAccount.objects.get_or_create(
            provider=IntegrationAccount.PROVIDER_LINKEDIN,
            external_id='upload',
            defaults={
                'display_name': 'LinkedIn upload',
                'status': IntegrationAccount.STATUS_CONNECTED,
                'connected_by': request.user,
                'connected_at': timezone.now(),
            },
        )
        written = write_metric_rows(account, rows)
        if not written:
            return Response({'detail': 'No usable rows. Each row needs metric, date and value.'}, status=status.HTTP_400_BAD_REQUEST)
        account.status = IntegrationAccount.STATUS_CONNECTED
        account.last_sync_at = timezone.now()
        account.last_error = ''
        account.save(update_fields=['status', 'last_sync_at', 'last_error'])
        log_ops_action(
            actor=request.user,
            action='integration.linkedin_upload',
            target_type='integration',
            target_id=account.id,
            meta={'rows_written': written},
            request=request,
        )
        card = _card(account.provider, 'LinkedIn', account)
        card['rows_written'] = written
        return Response(card)


class SyncIntegrationsJobView(APIView):
    """Railway cron: POST /api/jobs/sync-integrations/ with CRON_SECRET."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = getattr(settings, 'CRON_SECRET', '') or ''
        provided = (
            request.headers.get('X-Cron-Secret')
            or request.META.get('HTTP_X_CRON_SECRET')
            or ''
        ).strip()
        auth = (request.headers.get('Authorization') or '').strip()
        if auth.lower().startswith('bearer '):
            provided = auth[7:].strip() or provided
        if not secret or provided != secret:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
        runs = run_all_syncs()
        return Response({
            'accounts': len(runs),
            'runs': [
                {
                    'provider': run.provider,
                    'ok': run.ok,
                    'rows_written': run.rows_written,
                    'error': run.error,
                }
                for run in runs
            ],
        })


def store_token(account: IntegrationAccount, plain: str) -> None:
    """Used by later adapters. Never called from a response serializer."""
    account.encrypted_token = encrypt_token(plain)
    account.save(update_fields=['encrypted_token'])
