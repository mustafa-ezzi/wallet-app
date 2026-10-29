"""Fernet encryption for provider tokens. Ciphertext never leaves the server."""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core import signing


def _fernet() -> Fernet:
    raw = (getattr(settings, 'INTEGRATIONS_ENCRYPTION_KEY', '') or os.environ.get('INTEGRATIONS_ENCRYPTION_KEY', '')).strip()
    if raw:
        try:
            return Fernet(raw.encode('utf-8'))
        except (ValueError, TypeError):
            digest = hashlib.sha256(raw.encode('utf-8')).digest()
            return Fernet(base64.urlsafe_b64encode(digest))
    digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_token(plain: str) -> str:
    text = (plain or '').strip()
    if not text:
        return ''
    return _fernet().encrypt(text.encode('utf-8')).decode('utf-8')


def decrypt_token(blob: str) -> str:
    if not blob:
        return ''
    try:
        return _fernet().decrypt(blob.encode('utf-8')).decode('utf-8')
    except (InvalidToken, ValueError, TypeError):
        return ''


def issue_oauth_state(user_id: int, provider: str) -> str:
    return signing.dumps({'uid': user_id, 'provider': provider}, salt='ops-oauth')


def read_oauth_state(state: str, provider: str, max_age: int = 600) -> int:
    data = signing.loads(state, salt='ops-oauth', max_age=max_age)
    if not isinstance(data, dict) or data.get('provider') != provider:
        raise signing.BadSignature('provider')
    return int(data['uid'])
