"""One sentence in, one draft or one answer out. The host does the project work."""

from django.utils import timezone


class TraiModelError(Exception):
    """The model could not be called. Nothing was written."""


def handle_message(user, text: str, host, request, model_call) -> tuple[dict, int]:
    text = ' '.join(str(text or '').split())
    if not text:
        return {'detail': host.empty_message}, 400
    if len(text) > 500:
        return {'detail': host.too_long}, 400

    kind = host.message_kind(text)
    pending = host.pending_draft(user)
    if pending and pending.expires_at <= timezone.now() and kind in ('confirm', 'correct'):
        return {'detail': host.expired, 'saved': False}, 400
    resume = getattr(host, 'resume_pending', None)
    if callable(resume) and pending is not None and kind != 'cancel':
        continued = resume(user, text, request)
        if continued is not None:
            return _without_empty_warning(continued), 200
    if kind == 'confirm':
        if pending is not None:
            return _saved_or_raise(host.confirm(user, None, request))
        saved = host.recent_saved_draft(user)
        if saved is not None:
            return _saved_or_raise(host.confirm(user, saved.id, request))
        return {
            'reply': host.nothing_to_save,
            'action': {'action': 'ask', 'ask': 'There is nothing to save.'},
            'saved': False,
        }, 200
    if kind == 'cancel':
        if not host.cancel(user):
            return {
                'reply': host.nothing_to_cancel,
                'action': {'action': 'ask', 'ask': 'There is nothing to cancel.'},
                'saved': False,
            }, 200
        return {
            'reply': host.cancelled,
            'action': {'action': 'refuse'},
            'saved': False,
        }, 200
    if kind == 'correct' and pending is not None:
        corrected = host.correct(user, text)
        if corrected is not None:
            return _without_empty_warning(corrected), 200

    catalog = host.catalog(user)
    raw = host.route(text, catalog)
    if raw is None:
        local = host.regular_question(text, catalog)
        if local is not None:
            result = host.resolve_read(user, local, catalog, text)
            result['saved'] = False
            return _without_empty_warning(result), 200
        if not host.allow_model_call(user):
            return {'detail': host.resting, 'saved': False}, 429
        try:
            raw = model_call(text, catalog)
        except TraiModelError as exc:
            return {'detail': str(exc), 'saved': False}, 503
        action_name = str(raw.get('action') if isinstance(raw, dict) else '')
        if action_name in host.read_actions:
            result = host.resolve_read(user, raw, catalog, text)
            result['saved'] = False
            return _without_empty_warning(result), 200
    result = host.normalize(raw, catalog, user)
    partial = result.pop('partial', None)
    if result['action']['action'] in host.write_actions:
        draft = host.store_proposal(user, result['action'])
        result['draft_id'] = draft.id
    elif partial is not None:
        draft = host.store_proposal(user, partial)
        result['draft_id'] = draft.id
    result['saved'] = False
    return _without_empty_warning(result), 200


def handle_confirm(user, draft_id, host, request) -> dict:
    return _without_empty_warning(host.confirm(user, draft_id, request))


def _saved_or_raise(result: dict) -> tuple[dict, int]:
    return _without_empty_warning(result), 200


def _without_empty_warning(result: dict) -> dict:
    if not result.get('warning'):
        result.pop('warning', None)
    return result
