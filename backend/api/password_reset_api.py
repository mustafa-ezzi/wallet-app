"""Forgot-password OTP API (email code → verify → set new password)."""

import json
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.core import signing
from django.db import DatabaseError, ProgrammingError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PasswordResetOTP

logger = logging.getLogger(__name__)

RESET_SALT = 'wallettrails-password-reset'
RESET_MAX_AGE = 15 * 60  # seconds after OTP verified
GENERIC_OK = {'detail': 'If an account exists for that email, a code has been sent.'}


def _find_user(email: str):
    email_n = (email or '').strip().lower()
    if not email_n:
        return None
    return (
        User.objects.filter(email__iexact=email_n).first()
        or User.objects.filter(username__iexact=email_n).first()
    )


def _otp_email_content(code: str, first_name: str = '') -> tuple[str, str]:
    name = (first_name or '').strip() or 'there'
    subject = 'WalletTrails password reset code'
    body = (
        f'Hi {name},\n\n'
        f'Your WalletTrails password reset code is:\n\n'
        f'    {code}\n\n'
        f'This code expires in 10 minutes. If you did not request a reset, ignore this email.\n\n'
        f'— WalletTrails\n'
        f'Follow every rupee.\n'
    )
    return subject, body


def _from_email() -> str:
    from_email = (getattr(settings, 'DEFAULT_FROM_EMAIL', None) or '').strip()
    if not from_email or from_email.lower() == 'resend':
        return 'WalletTrails <onboarding@resend.dev>'
    return from_email


def _is_resend_test_from(from_email: str) -> bool:
    return 'resend.dev' in (from_email or '').lower()


def _resend_api_key() -> str:
    key = (
        getattr(settings, 'RESEND_API_KEY', None)
        or getattr(settings, 'EMAIL_HOST_PASSWORD', None)
        or ''
    )
    return str(key).replace(' ', '').strip()


def _use_resend_http() -> bool:
    """Railway often blocks outbound SMTP — prefer Resend HTTPS API."""
    host = (getattr(settings, 'EMAIL_HOST', '') or '').lower()
    key = _resend_api_key()
    if getattr(settings, 'RESEND_API_KEY', ''):
        return True
    if key.startswith('re_'):
        return True
    if 'resend.com' in host:
        return True
    return False


def _send_via_resend_api(to_email: str, subject: str, body: str) -> None:
    import urllib.error
    import urllib.request

    api_key = _resend_api_key()
    if not api_key:
        raise RuntimeError('RESEND_API_KEY / EMAIL_HOST_PASSWORD is missing')

    payload = {
        'from': _from_email(),
        'to': [to_email],
        'subject': subject,
        'text': body,
    }
    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'WalletTrails/1.0',
        },
        method='POST',
    )
    timeout = getattr(settings, 'EMAIL_TIMEOUT', 12)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8', errors='replace')
            if resp.status >= 400:
                raise RuntimeError(_resend_error_message(resp.status, raw))
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode('utf-8', errors='replace')
        raise RuntimeError(_resend_error_message(exc.code, err_body)) from exc


def _resend_error_message(status_code: int, raw: str) -> str:
    message = raw
    try:
        parsed = json.loads(raw)
        message = parsed.get('message') or parsed.get('name') or raw
    except (json.JSONDecodeError, TypeError, AttributeError):
        pass
    lowered = str(message).lower()
    if status_code == 403 and (
        'verify a domain' in lowered or 'only send testing emails' in lowered
    ):
        return (
            'Resend is in test mode. Verify a domain at resend.com/domains, then set '
            'DEFAULT_FROM_EMAIL on Railway to an address on that domain '
            '(not onboarding@resend.dev).'
        )
    return f'Resend API {status_code}: {message}'


def _send_via_smtp(to_email: str, subject: str, body: str) -> None:
    from django.core.mail import EmailMessage, get_connection

    password = (getattr(settings, 'EMAIL_HOST_PASSWORD', '') or '').replace(' ', '')
    use_ssl = int(getattr(settings, 'EMAIL_PORT', 587) or 587) in (465, 2465)
    use_tls = (not use_ssl) and bool(getattr(settings, 'EMAIL_USE_TLS', True))

    connection = get_connection(
        backend='django.core.mail.backends.smtp.EmailBackend',
        host=settings.EMAIL_HOST,
        port=settings.EMAIL_PORT,
        username=settings.EMAIL_HOST_USER,
        password=password,
        use_tls=use_tls,
        use_ssl=use_ssl,
        timeout=getattr(settings, 'EMAIL_TIMEOUT', 12),
    )
    msg = EmailMessage(
        subject=subject,
        body=body,
        from_email=_from_email(),
        to=[to_email],
        connection=connection,
    )
    msg.send(fail_silently=False)


def _send_otp_email(to_email: str, code: str, first_name: str = '') -> None:
    subject, body = _otp_email_content(code, first_name)
    if _use_resend_http():
        _send_via_resend_api(to_email, subject, body)
        return
    _send_via_smtp(to_email, subject, body)


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email or '@' not in email:
            return Response({'detail': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = _find_user(email)
        except Exception:
            logger.exception('forgot-password: user lookup failed')
            return Response(
                {'detail': 'Server error looking up account. Try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Always look successful to avoid account enumeration
        if not user:
            return Response(GENERIC_OK)

        try:
            _row, code = PasswordResetOTP.create_for_email(email)
        except (ProgrammingError, DatabaseError) as exc:
            logger.exception('forgot-password: OTP table missing or DB error')
            return Response(
                {
                    'detail': (
                        'Password reset is not ready on the server yet '
                        '(run migrations: 0013_password_reset_otp).'
                    ),
                    'error': exc.__class__.__name__,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception:
            logger.exception('forgot-password: create OTP failed')
            return Response(
                {'detail': 'Could not start password reset. Try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        payload = dict(GENERIC_OK)
        smtp_configured = bool(getattr(settings, 'EMAIL_HOST', '').strip()) or bool(
            _resend_api_key()
        )

        try:
            sender = _from_email()
            if _is_resend_test_from(sender):
                logger.warning(
                    'forgot-password: sending with Resend test From %s — '
                    'Resend will only deliver to the account owner until a domain is verified.',
                    sender,
                )
            _send_otp_email(user.email or email, code, user.first_name)
        except Exception as exc:
            logger.exception('forgot-password: email send failed (%s)', exc)
            if settings.DEBUG or not smtp_configured:
                payload['debug_code'] = code
                payload['detail'] = (
                    'Email could not be sent. Use the debug code below, '
                    'or set RESEND_API_KEY and DEFAULT_FROM_EMAIL on Railway '
                    f'({exc.__class__.__name__}).'
                )
                return Response(payload)
            return Response(
                {
                    'detail': (
                        'Could not send the reset email. Please try again in a few minutes.'
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(payload)


class VerifyResetOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        code = (request.data.get('code') or request.data.get('otp') or '').strip()
        if not email or not code:
            return Response({'detail': 'Email and code are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            row = (
                PasswordResetOTP.objects.filter(email=email, used=False)
                .order_by('-created_at')
                .first()
            )
        except (ProgrammingError, DatabaseError):
            return Response(
                {'detail': 'Password reset is not ready (run DB migrations).'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not row or not row.verify(code):
            return Response({'detail': 'Invalid or expired code.'}, status=status.HTTP_400_BAD_REQUEST)

        row.used = True
        row.save(update_fields=['used'])
        token = signing.dumps({'email': email}, salt=RESET_SALT)
        return Response({'reset_token': token, 'detail': 'Code verified. Set a new password.'})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = (request.data.get('reset_token') or '').strip()
        password = request.data.get('password') or ''
        if not token:
            return Response({'detail': 'Reset token is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(str(password)) < 6:
            return Response(
                {'detail': 'Password must be at least 6 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            data = signing.loads(token, salt=RESET_SALT, max_age=RESET_MAX_AGE)
        except signing.SignatureExpired:
            return Response(
                {'detail': 'Reset session expired. Request a new code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except signing.BadSignature:
            return Response(
                {'detail': 'Reset session expired. Request a new code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = data.get('email')
        user = _find_user(email) if email else None
        if not user:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(password)
        user.save(update_fields=['password'])
        return Response({'detail': 'Password updated. You can sign in now.'})
