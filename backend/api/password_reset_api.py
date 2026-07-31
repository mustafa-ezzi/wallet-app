"""Forgot-password OTP API (email code → verify → set new password)."""

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

RESET_SALT = 'cashtrail-password-reset'
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


def _send_otp_email(to_email: str, code: str, first_name: str = '') -> None:
    from django.core.mail import EmailMessage, get_connection

    name = (first_name or '').strip() or 'there'
    subject = 'CashTrail password reset code'
    body = (
        f'Hi {name},\n\n'
        f'Your CashTrail password reset code is:\n\n'
        f'    {code}\n\n'
        f'This code expires in 10 minutes. If you did not request a reset, ignore this email.\n\n'
        f'— CashTrail\n'
        f'Follow every rupee.\n'
    )
    # Gmail requires From == authenticated user
    from_email = (getattr(settings, 'EMAIL_HOST_USER', None) or '').strip() or settings.DEFAULT_FROM_EMAIL
    password = (getattr(settings, 'EMAIL_HOST_PASSWORD', '') or '').replace(' ', '')

    connection = get_connection(
        backend='django.core.mail.backends.smtp.EmailBackend',
        host=settings.EMAIL_HOST,
        port=settings.EMAIL_PORT,
        username=settings.EMAIL_HOST_USER,
        password=password,
        use_tls=settings.EMAIL_USE_TLS,
        timeout=getattr(settings, 'EMAIL_TIMEOUT', 12),
    )
    msg = EmailMessage(
        subject=subject,
        body=body,
        from_email=from_email,
        to=[to_email],
        connection=connection,
    )
    msg.send(fail_silently=False)


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
        smtp_configured = bool(getattr(settings, 'EMAIL_HOST', '').strip())

        try:
            _send_otp_email(user.email or email, code, user.first_name)
        except Exception as exc:
            logger.exception('forgot-password: email send failed')
            # Always include a usable path in DEBUG; in prod return clear SMTP guidance
            if settings.DEBUG or not smtp_configured:
                payload['debug_code'] = code
                payload['detail'] = (
                    'Email could not be sent. Use the debug code below, '
                    'or set EMAIL_HOST / EMAIL_HOST_USER / EMAIL_HOST_PASSWORD on Railway '
                    f'({exc.__class__.__name__}).'
                )
                return Response(payload)
            return Response(
                {
                    'detail': (
                        'Could not send email via Gmail SMTP. '
                        'Common fixes: strip spaces from App Password, set DEFAULT_FROM_EMAIL to just '
                        'mustafaezzi143@gmail.com, confirm 2FA App Password, and check Gmail '
                        '"Security > Recent security activity" for a blocked sign-in from Railway.'
                    ),
                    'smtp_error': f'{exc.__class__.__name__}: {exc}',
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
