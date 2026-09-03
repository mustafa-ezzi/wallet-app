"""Expo Push API helper (HTTPS JSON). No FCM credentials required for Expo tokens."""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'


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
