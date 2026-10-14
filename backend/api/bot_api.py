"""Trai message and confirm. A sentence stores a draft. Confirm writes the books."""

from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .bot_actions import WRITE_ACTIONS, normalize_action
from .bot_catalog import load_catalog
from .bot_draft import (
    DraftExpired,
    allow_model_call,
    cancel_pending,
    confirm_draft,
    correct_pending,
    message_kind,
    pending_draft,
    recent_saved_draft,
    store_proposal,
)
from .bot_gemini import BotModelError, generate_action
from .bot_reads import READ_ACTIONS, regular_question, resolve_read


def _without_empty_warning(result: dict) -> dict:
    if not result.get('warning'):
        result.pop('warning', None)
    return result


class BotMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        text = request.data.get('text') if isinstance(request.data, dict) else None
        text = ' '.join(str(text or '').split())
        if not text:
            return Response({'detail': 'Say what you want to record.'}, status=400)
        if len(text) > 500:
            return Response({'detail': 'That message is too long.'}, status=400)

        kind = message_kind(text)
        pending = pending_draft(request.user)
        if pending and pending.expires_at <= timezone.now() and kind in ('confirm', 'correct'):
            return Response(
                {'detail': 'That confirmation expired. Say it again.', 'saved': False},
                status=400,
            )
        if kind == 'confirm':
            if pending is not None:
                return _confirm_response(request)
            saved = recent_saved_draft(request.user)
            if saved is not None:
                return _confirm_response(request, saved.id)
            return Response({
                'reply': 'There is nothing to save. I checked, and the notebook is still blank.',
                'action': {'action': 'ask', 'ask': 'There is nothing to save.'},
                'saved': False,
            })
        if kind == 'cancel':
            if not cancel_pending(request.user):
                return Response({
                    'reply': 'There is nothing to cancel. We are already in the clear.',
                    'action': {'action': 'ask', 'ask': 'There is nothing to cancel.'},
                    'saved': False,
                })
            return Response({
                'reply': 'Cancelled. Nothing was saved. The rupees get to stay put.',
                'action': {'action': 'refuse'},
                'saved': False,
            })
        if kind == 'correct' and pending is not None:
            corrected = correct_pending(request.user, text)
            if corrected is not None:
                return Response(_without_empty_warning(corrected))

        catalog = load_catalog(request.user)
        local = regular_question(text, catalog)
        if local is not None:
            result = resolve_read(request.user, local, catalog, text)
            result['saved'] = False
            return Response(_without_empty_warning(result))

        if not allow_model_call(request.user):
            return Response(
                {'detail': 'Trai is resting until tomorrow.', 'saved': False},
                status=429,
            )
        try:
            raw = generate_action(text, catalog)
        except BotModelError as exc:
            return Response({'detail': str(exc), 'saved': False}, status=503)
        if str(raw.get('action') if isinstance(raw, dict) else '') in READ_ACTIONS:
            result = resolve_read(request.user, raw, catalog, text)
            result['saved'] = False
            return Response(_without_empty_warning(result))
        result = normalize_action(raw, catalog)
        if result['action']['action'] in WRITE_ACTIONS:
            draft = store_proposal(request.user, result['action'])
            result['draft_id'] = draft.id
        result['saved'] = False
        return Response(_without_empty_warning(result))


class BotConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return _confirm_response(request, _draft_id(request))


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


def _confirm_response(request, draft_id=None):
    try:
        result = confirm_draft(request.user, draft_id=draft_id, request=request)
    except DraftExpired as exc:
        return Response({'detail': exc.detail, 'saved': False}, status=400)
    except NotFound:
        return Response({'detail': 'Not found.'}, status=404)
    except ValidationError as exc:
        return Response({'detail': exc.detail, 'saved': False}, status=400)
    return Response(_without_empty_warning(result))
