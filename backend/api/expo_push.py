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
    channel_id: str = 'cashtrail-due-reminders',
) -> dict:
    """
    Send push messages via Expo. Returns summary {ok, failed, errors}.
    Tokens that look invalid are skipped.
    """
    messages = []
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

    if not messages:
        return {'ok': 0, 'failed': 0, 'errors': ['no valid tokens']}

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
        return {'ok': 0, 'failed': len(messages), 'errors': [err_body[:200]]}
    except Exception as exc:  # noqa: BLE001
        logger.exception('Expo push failed')
        return {'ok': 0, 'failed': len(messages), 'errors': [str(exc)]}

    data_list = parsed.get('data') if isinstance(parsed, dict) else None
    if not isinstance(data_list, list):
        data_list = [parsed]

    ok = 0
    failed = 0
    errors: list[str] = []
    for item in data_list:
        if isinstance(item, dict) and item.get('status') == 'ok':
            ok += 1
        else:
            failed += 1
            if isinstance(item, dict):
                errors.append(str(item.get('message') or item.get('details') or item))

    return {'ok': ok, 'failed': failed, 'errors': errors}
