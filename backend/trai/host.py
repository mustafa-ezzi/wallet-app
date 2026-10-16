"""The only piece another project has to replace.

A host knows the catalog, which sentences it can answer without the model,
and how a confirmed draft is written. The engine never imports your models.
"""


class TraiHost:
    read_actions = frozenset()
    write_actions = frozenset()

    nothing_to_save = 'There is nothing to save. I checked, and the notebook is still blank.'
    nothing_to_cancel = 'There is nothing to cancel. We are already in the clear.'
    cancelled = 'Cancelled. Nothing was saved. The rupees get to stay put.'
    empty_message = 'Say what you want to record.'
    too_long = 'That message is too long.'
    expired = 'That confirmation expired. Say it again.'
    resting = 'Trai is resting until tomorrow.'

    def message_kind(self, text: str) -> str:
        """confirm, cancel, correct, or model."""
        raise NotImplementedError

    def pending_draft(self, user):
        raise NotImplementedError

    def recent_saved_draft(self, user):
        raise NotImplementedError

    def catalog(self, user) -> dict:
        raise NotImplementedError

    def route(self, text: str, catalog: dict):
        """A raw action this host can answer with no model call, or None."""
        return None

    def regular_question(self, text: str, catalog: dict):
        return None

    def resolve_read(self, user, raw, catalog: dict, text: str) -> dict:
        raise NotImplementedError

    def normalize(self, raw, catalog: dict, user) -> dict:
        raise NotImplementedError

    def allow_model_call(self, user) -> bool:
        raise NotImplementedError

    def store_proposal(self, user, action: dict):
        raise NotImplementedError

    def confirm(self, user, draft_id, request) -> dict:
        raise NotImplementedError

    def cancel(self, user) -> bool:
        raise NotImplementedError

    def correct(self, user, text: str):
        return None
