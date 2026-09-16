"""Sign in / sign up with a Google ID token (Android)."""

import base64
import json
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .currencies import DEFAULT_HOME_CURRENCY, normalize_home_currency
from .models import UserProfile
from .serializers import attach_household_invites

logger = logging.getLogger(__name__)


def _allowed_audiences() -> list[str]:
    return list(getattr(settings, 'GOOGLE_OAUTH_CLIENT_IDS', None) or [])


def _unverified_claims(raw_token: str) -> dict:
    parts = raw_token.split('.')
    if len(parts) != 3:
        raise ValueError('Google token is not a JWT.')
    payload = parts[1] + ('=' * (-len(parts[1]) % 4))
    data = json.loads(base64.urlsafe_b64decode(payload.encode('ascii')))
    if not isinstance(data, dict):
        raise ValueError('Invalid Google token payload.')
    return data


def _claim_ids(value) -> list[str]:
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _verify_google_id_token(raw_token: str) -> dict:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    audiences = _allowed_audiences()
    if not audiences:
        raise RuntimeError('GOOGLE_OAUTH_CLIENT_IDS is not set on the server.')

    peek = _unverified_claims(raw_token)
    claimed = []
    for value in (peek.get('aud'), peek.get('azp')):
        for item in _claim_ids(value):
            if item not in claimed:
                claimed.append(item)

    ordered = [item for item in claimed if item in audiences]
    for item in audiences:
        if item not in ordered:
            ordered.append(item)

    request = google_requests.Request()
    last_error = None
    for audience in ordered:
        try:
            try:
                info = id_token.verify_oauth2_token(
                    raw_token,
                    request,
                    audience=audience,
                    clock_skew_in_seconds=60,
                )
            except TypeError:
                info = id_token.verify_oauth2_token(raw_token, request, audience=audience)
        except Exception as exc:  # noqa: BLE001 — try next client id
            last_error = exc
            continue
        token_ids = _claim_ids(info.get('aud')) + _claim_ids(info.get('azp'))
        if any(item in audiences for item in token_ids):
            return info
        last_error = ValueError(f'Token audience is not allowed: {info.get("aud")}')

    logger.warning(
        'google-auth: rejected iss=%s aud=%s azp=%s err=%s',
        peek.get('iss'),
        peek.get('aud'),
        peek.get('azp'),
        last_error,
    )
    raise ValueError(str(last_error) if last_error else 'Invalid Google token.')


def _unique_username(email: str, sub: str) -> str:
    base = (email or f'g_{sub}')[:140]
    if not User.objects.filter(username__iexact=base).exists():
        return base
    return f'g_{sub}'[:150]


class GoogleAuthView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_token = (request.data.get('id_token') or request.data.get('idToken') or '').strip()
        if raw_token.lower().startswith('bearer '):
            raw_token = raw_token[7:].strip()
        if not raw_token:
            return Response({'detail': 'Google sign-in token is missing.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            currency = normalize_home_currency(request.data.get('currency') or DEFAULT_HOME_CURRENCY)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            info = _verify_google_id_token(raw_token)
        except RuntimeError as exc:
            logger.exception('google-auth: not configured')
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except ValueError:
            logger.exception('google-auth: token rejected')
            return Response({'detail': 'Google sign-in could not be verified.'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            logger.exception('google-auth: verify failed')
            return Response({'detail': 'Google sign-in could not be verified.'}, status=status.HTTP_401_UNAUTHORIZED)

        email = (info.get('email') or '').strip().lower()
        sub = str(info.get('sub') or '').strip()
        if not email or not sub:
            return Response({'detail': 'Google account is missing an email.'}, status=status.HTTP_400_BAD_REQUEST)
        if not info.get('email_verified', False):
            return Response({'detail': 'Google email is not verified.'}, status=status.HTTP_400_BAD_REQUEST)

        given = (info.get('given_name') or '').strip()[:150]
        family = (info.get('family_name') or '').strip()[:150]

        created = False
        with transaction.atomic():
            user = None
            profile = UserProfile.objects.filter(google_sub=sub).select_related('user').first()
            if profile:
                user = profile.user
            if user is None:
                user = User.objects.filter(email__iexact=email).first() or User.objects.filter(username__iexact=email).first()
            if user is None:
                user = User(
                    username=_unique_username(email, sub),
                    email=email,
                    first_name=given,
                    last_name=family,
                )
                user.set_unusable_password()
                user.save()
                UserProfile.objects.create(user=user, currency=currency, google_sub=sub)
                attach_household_invites(user)
                created = True
            else:
                if not user.first_name and given:
                    user.first_name = given
                if not user.last_name and family:
                    user.last_name = family
                if not user.email:
                    user.email = email
                user.save()
                profile, _ = UserProfile.objects.get_or_create(
                    user=user,
                    defaults={'currency': currency, 'google_sub': sub},
                )
                if not profile.google_sub:
                    profile.google_sub = sub
                    profile.save(update_fields=['google_sub'])

        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'created': created,
        })
