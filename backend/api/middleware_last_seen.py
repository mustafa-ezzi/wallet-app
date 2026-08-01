"""Mark authenticated API users as recently seen (JWT from PWA or mobile)."""

from __future__ import annotations


class LastSeenMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        path = request.path or ''
        # Skip noisy / non-app paths
        if not path.startswith('/api/'):
            return response
        if path.startswith('/api/ops/') or path.startswith('/api/jobs/'):
            return response
        if path.startswith('/api/auth/login') or path.startswith('/api/auth/register'):
            # login will update last_login when UPDATE_LAST_LOGIN is on
            return response

        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            from .last_seen import touch_user_last_seen

            auth = JWTAuthentication().authenticate(request)
            if auth:
                touch_user_last_seen(auth[0])
        except Exception:
            # Never break responses because of analytics/touch
            pass
        return response
