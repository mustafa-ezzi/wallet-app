"""A tiny host for a notes app. Copy this, then replace catalog, route, and confirm.

It is not mounted. WalletTrails uses api.trai_host.wallet_host instead.
"""

from .host import TraiHost


class NotesHost(TraiHost):
    write_actions = frozenset({'create_note'})
    nothing_to_save = 'There is nothing to save.'
    cancelled = 'Cancelled. Nothing was saved.'

    def message_kind(self, text: str) -> str:
        cleaned = ' '.join((text or '').replace('.', '').split()).lower()
        if cleaned in {'yes', 'save', 'save it', 'yes save it'}:
            return 'confirm'
        if cleaned in {'no', 'cancel'}:
            return 'cancel'
        return 'model'

    def pending_draft(self, user):
        return None

    def recent_saved_draft(self, user):
        return None

    def catalog(self, user) -> dict:
        return {'notebooks': []}

    def route(self, text: str, catalog: dict):
        return None

    def regular_question(self, text: str, catalog: dict):
        return None

    def resolve_read(self, user, raw, catalog, text):
        return {'reply': 'Nothing to read yet.', 'action': {'action': 'ask'}, 'saved': False}

    def normalize(self, raw, catalog, user) -> dict:
        return {
            'reply': 'Save this note?',
            'action': {'action': 'create_note', 'notes': ''},
            'saved': False,
        }

    def allow_model_call(self, user) -> bool:
        return False

    def store_proposal(self, user, action):
        raise NotImplementedError('Store the proposal on your own draft row.')

    def confirm(self, user, draft_id, request) -> dict:
        raise NotImplementedError('Write the note here, and only here.')

    def cancel(self, user) -> bool:
        return False


notes_host = NotesHost()
