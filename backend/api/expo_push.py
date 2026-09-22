"""Expo Push API helper (HTTPS JSON). No FCM credentials required for Expo tokens."""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

def prune_stale_device_tokens(*, user=None) -> int:
    """Keep the newest token per user+platform. Old APK / Expo Go tokens poison Expo batches."""
    from .models import DeviceToken

    qs = DeviceToken.objects.all()
    if user is not None:
        qs = qs.filter(user=user)
    keep_ids: list[int] = []
    for row in qs.values('user_id', 'platform').distinct():
        latest_id = (
            DeviceToken.objects.filter(user_id=row['user_id'], platform=row['platform'])
            .order_by('-updated_at', '-id')
            .values_list('id', flat=True)
            .first()
        )
        if latest_id:
            keep_ids.append(latest_id)
    stale = qs.exclude(id__in=keep_ids)
    deleted, _ = stale.delete()
    return deleted
MIXED_PROJECT_CODE = 'PUSH_TOO_MANY_EXPERIENCE_IDS'
DEAD_TOKEN_MARKERS = ('DeviceNotRegistered', 'InvalidCredentials')


def _is_mixed_experience_error(body: str) -> bool:
    return MIXED_PROJECT_CODE in (body or '')


def _post_expo_messages(messages: list[dict], message_tokens: list[str]) -> dict:
    payload = json.dumps(messages).encode('utf-8')
    req = urllib.request.Request(
        EXPO_PUSH_URL,
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode('utf-8')
            parsed = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode('utf-8', errors='replace')
        logger.error('Expo push HTTP %s: %s', exc.code, err_body[:500])
        if _is_mixed_experience_error(err_body) and len(message_tokens) > 1:
            return {'_retry_one_by_one': True, 'errors': [err_body[:200]]}
        tickets = [
            {'token': t, 'status': 'error', 'message': f'HTTP {exc.code}'}
            for t in message_tokens
        ]
        return {
            'ok': 0,
            'failed': len(messages),
            'errors': [err_body[:200]],
            'tickets': tickets,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception('Expo push failed')
        tickets = [
            {'token': t, 'status': 'error', 'message': str(exc)[:200]}
            for t in message_tokens
        ]
        return {
            'ok': 0,
            'failed': len(messages),
            'errors': [str(exc)],
            'tickets': tickets,
        }

    # Whole-batch application error (sometimes 200 with errors[])
    if isinstance(parsed, dict) and parsed.get('errors') and not parsed.get('data'):
        blob = json.dumps(parsed.get('errors'))
        if _is_mixed_experience_error(blob) and len(message_tokens) > 1:
            return {'_retry_one_by_one': True, 'errors': [blob[:200]]}

    data_list = parsed.get('data') if isinstance(parsed, dict) else None
    if not isinstance(data_list, list):
        data_list = [parsed]

    ok = 0
    failed = 0
    errors: list[str] = []
    tickets: list[dict] = []
    for idx, item in enumerate(data_list):
        token = message_tokens[idx] if idx < len(message_tokens) else ''
        if isinstance(item, dict) and item.get('status') == 'ok':
            ok += 1
            tickets.append({
                'token': token,
                'status': 'ok',
                'id': item.get('id') or '',
            })
        else:
            failed += 1
            message = ''
            if isinstance(item, dict):
                message = str(item.get('message') or item.get('details') or item)
                errors.append(message)
            tickets.append({
                'token': token,
                'status': 'error',
                'message': message or 'unknown',
            })

    return {'ok': ok, 'failed': failed, 'errors': errors, 'tickets': tickets}


def drop_dead_expo_tokens(tickets: list[dict]) -> int:
    """Remove tokens Expo says are gone so they cannot poison the next batch."""
    from .models import DeviceToken

    dead = []
    for ticket in tickets:
        if not isinstance(ticket, dict):
            continue
        if ticket.get('status') == 'ok':
            continue
        blob = str(ticket.get('message') or '')
        if any(m in blob for m in DEAD_TOKEN_MARKERS):
            tok = (ticket.get('token') or '').strip()
            if tok:
                dead.append(tok)
    if not dead:
        return 0
    deleted, _ = DeviceToken.objects.filter(token__in=dead).delete()
    return deleted


def send_expo_push(
    tokens: list[str],
    *,
    title: str,
    body: str,
    data: dict | None = None,
    channel_id: str = 'wallettrails-due-reminders',
) -> dict:
    """
    Send push messages via Expo.
    Returns {ok, failed, errors, tickets: [{token, status, id?, message?}]}.
    """
    messages = []
    message_tokens: list[str] = []
    for token in tokens:
        t = (token or '').strip()
        if not t.startswith('ExponentPushToken[') and not t.startswith('ExpoPushToken['):
            logger.warning('Skipping non-Expo push token: %s…', t[:24])
            continue
        msg = {
            'to': t,
            'title': title,
            'body': body,
            'sound': 'default',
            'channelId': channel_id,
            'priority': 'high',
        }
        if data:
            msg['data'] = data
        messages.append(msg)
        message_tokens.append(t)

    if not messages:
        return {'ok': 0, 'failed': 0, 'errors': ['no valid tokens'], 'tickets': []}

    result = _post_expo_messages(messages, message_tokens)
    if result.get('_retry_one_by_one'):
        ok = 0
        failed = 0
        errors: list[str] = []
        tickets: list[dict] = []
        for msg, tok in zip(messages, message_tokens):
            one = _post_expo_messages([msg], [tok])
            ok += int(one.get('ok') or 0)
            failed += int(one.get('failed') or 0)
            errors.extend(one.get('errors') or [])
            tickets.extend(one.get('tickets') or [])
        result = {
            'ok': ok,
            'failed': failed,
            'errors': errors[:8],
            'tickets': tickets,
        }

    try:
        drop_dead_expo_tokens(result.get('tickets') or [])
    except Exception:  # noqa: BLE001
        logger.exception('Could not prune dead Expo tokens')

    return result
