"""Two endpoints. Set TRAI_HOST, or subclass and set host yourself."""

from django.conf import settings
from django.utils.module_loading import import_string
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .engine import TraiModelError, handle_confirm, handle_message
from .host import TraiHost


def load_host() -> TraiHost:
    target = getattr(settings, 'TRAI_HOST', '') or ''
    if not target:
        raise RuntimeError('Set TRAI_HOST to the dotted path of your TraiHost.')
    host = import_string(target)
    if not isinstance(host, TraiHost):
        raise RuntimeError('TRAI_HOST must point at a TraiHost instance.')
    return host


class TraiMessageView(APIView):
    permission_classes = [IsAuthenticated]
    host = None

    def get_host(self) -> TraiHost:
        return self.host or load_host()

    def model_call(self, text: str, catalog: dict) -> dict:
        raise TraiModelError('This host has no model call yet.')

    def post(self, request):
        text = request.data.get('text') if isinstance(request.data, dict) else None
        host = self.get_host()
        try:
            body, status = handle_message(request.user, text, host, request, self.model_call)
        except NotFound:
            return Response({'detail': 'Not found.'}, status=404)
        except ValidationError as exc:
            return Response({'detail': exc.detail, 'saved': False}, status=getattr(exc, 'status_code', 400))
        return Response(body, status=status)


class TraiConfirmView(APIView):
    permission_classes = [IsAuthenticated]
    host = None

    def get_host(self) -> TraiHost:
        return self.host or load_host()

    def post(self, request):
        host = self.get_host()
        try:
            body = handle_confirm(request.user, _draft_id(request), host, request)
        except ValidationError as exc:
            return Response({'detail': exc.detail, 'saved': False}, status=getattr(exc, 'status_code', 400))
        except NotFound:
            return Response({'detail': 'Not found.'}, status=404)
        return Response(body)


def _draft_id(request):
    if not isinstance(request.data, dict) or 'id' not in request.data:
        return None
    raw = request.data.get('id')
    if raw in (None, ''):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise NotFound('Not found.')
