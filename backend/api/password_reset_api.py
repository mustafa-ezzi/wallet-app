"""Forgot-password OTP API (email code → verify → set new password)."""

from django.conf import settings
from django.contrib.auth.models import User
from django.core import signing
from django.core.mail import send_mail
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PasswordResetOTP

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
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or 'CashTrail <noreply@cashtrail.app>'
    send_mail(subject, body, from_email, [to_email], fail_silently=False)


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email or '@' not in email:
            return Response({'detail': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        user = _find_user(email)
        # Always look successful to avoid account enumeration
        if not user:
            return Response(GENERIC_OK)

        _row, code = PasswordResetOTP.create_for_email(email)
        payload = dict(GENERIC_OK)

        try:
            _send_otp_email(user.email or email, code, user.first_name)
        except Exception as exc:
            # Dev / misconfigured SMTP: still allow reset when DEBUG
            if settings.DEBUG:
                payload['debug_code'] = code
                payload['detail'] = (
                    'Email could not be sent (check SMTP). '
                    f'Debug code included because DEBUG=True. ({exc.__class__.__name__})'
                )
            else:
                return Response(
                    {'detail': 'Could not send email right now. Try again later.'},
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

        row = (
            PasswordResetOTP.objects.filter(email=email, used=False)
            .order_by('-created_at')
            .first()
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
