"""WalletTrails plugin for the Trai engine. Another project replaces this file."""

from trai.host import TraiHost

from .bot_actions import WRITE_ACTIONS, normalize_action
from .bot_catalog import load_catalog
from .bot_draft import (
    allow_model_call,
    cancel_pending,
    confirm_draft,
    correct_pending,
    message_kind,
    pending_draft,
    recent_saved_draft,
    store_proposal,
)
from .bot_phase8 import phase8_question
from .bot_phase9 import phase9_question
from .bot_reads import READ_ACTIONS, regular_question, resolve_read


class WalletTraiHost(TraiHost):
    read_actions = READ_ACTIONS
    write_actions = WRITE_ACTIONS

    def message_kind(self, text: str) -> str:
        return message_kind(text)

    def pending_draft(self, user):
        return pending_draft(user)

    def recent_saved_draft(self, user):
        return recent_saved_draft(user)

    def catalog(self, user) -> dict:
        return load_catalog(user)

    def route(self, text: str, catalog: dict):
        raw = phase9_question(text, catalog)
        if raw is None:
            raw = phase8_question(text, catalog)
        return raw

    def regular_question(self, text: str, catalog: dict):
        return regular_question(text, catalog)

    def resolve_read(self, user, raw, catalog: dict, text: str) -> dict:
        return resolve_read(user, raw, catalog, text)

    def normalize(self, raw, catalog: dict, user) -> dict:
        return normalize_action(raw, catalog, user=user)

    def allow_model_call(self, user) -> bool:
        return allow_model_call(user)

    def store_proposal(self, user, action: dict):
        return store_proposal(user, action)

    def confirm(self, user, draft_id, request) -> dict:
        return confirm_draft(user, draft_id=draft_id, request=request)

    def cancel(self, user) -> bool:
        return cancel_pending(user)

    def correct(self, user, text: str):
        return correct_pending(user, text)


wallet_host = WalletTraiHost()
