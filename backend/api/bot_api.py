"""WalletTrails endpoints. The conversation loop lives in the trai package."""

from rest_framework.exceptions import NotFound

from trai.views import TraiConfirmView, TraiMessageView

from .bot_gemini import generate_action
from .trai_host import wallet_host


class BotMessageView(TraiMessageView):
    host = wallet_host

    def model_call(self, text: str, catalog: dict) -> dict:
        return generate_action(text, catalog)


class BotConfirmView(TraiConfirmView):
    host = wallet_host


def _draft_id(request):
    """Kept so older imports still find the helper."""
    if not isinstance(request.data, dict) or 'id' not in request.data:
        return None
    raw = request.data.get('id')
    if raw in (None, ''):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise NotFound('Not found.')
