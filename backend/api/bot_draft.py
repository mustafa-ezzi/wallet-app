"""Pending Trai entries. A sentence stores a draft. Confirm writes the transaction."""

import re
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from .bot_actions import PHASE8_ACTIONS, PHASE9_WRITES, WRITE_ACTIONS, match_known_category, normalize_action
from .bot_catalog import load_catalog
from .models import BotDailyUsage, BotDraft
from .serializers import TransactionSerializer

DRAFT_MINUTES = 10
CONFIRM_WORDS = frozenset({'yes', 'save', 'han', 'haan'})
CANCEL_WORDS = frozenset({'no', 'cancel', 'nope'})
_SPOKEN_CONFIRM_RE = re.compile(
    r'^(?:yes|yeah|yep|yup|ok|okay|han|haan|sure)\s+save(?:\s+it)?$'
    r'|^save\s+it$'
    r'|^(?:yes|yeah|yep|ok|okay)\s+do\s+it$',
)
_AMOUNT_RE = re.compile(
    r'^(?:make it|it was|change (?:it|the amount|amount) to)\s*(?:rs|rp|pkr)?\s*([0-9][0-9,]*)',
    re.IGNORECASE,
)
_WALLET_RE = re.compile(
    r'^(?:put it on|switch to|use)\s+(.+)$',
    re.IGNORECASE,
)
_CATEGORY_RE = re.compile(
    r'^(?:category|change (?:the )?category to)\s+(.+)$',
    re.IGNORECASE,
)
_NOTE_RE = re.compile(
    r'^(?:note|the note is|change (?:the )?note to|call it)\s+(.+)$',
    re.IGNORECASE,
)
_FILLER_RE = re.compile(r'\b(my|the|wallet|account|bank)\b', re.IGNORECASE)


class DraftExpired(ValidationError):
    status_code = 400


def allow_model_call(user) -> bool:
    cap = int(getattr(settings, 'BOT_DAILY_MESSAGE_CAP', 30) or 0)
    if cap <= 0:
        return False
    day = timezone.localdate()
    usage, created = BotDailyUsage.objects.get_or_create(
        user=user, day=day, defaults={'count': 1},
    )
    if created:
        return True
    updated = BotDailyUsage.objects.filter(pk=usage.pk, count__lt=cap).update(count=F('count') + 1)
    return updated == 1


def message_kind(text: str) -> str:
    cleaned = _clean(text)
    if (
        _AMOUNT_RE.search(cleaned)
        or _WALLET_RE.search(cleaned)
        or _CATEGORY_RE.search(cleaned)
        or _NOTE_RE.search(cleaned)
    ):
        return 'correct'
    spoken = ' '.join(cleaned.replace(',', ' ').split())
    if cleaned in CONFIRM_WORDS or _SPOKEN_CONFIRM_RE.search(spoken):
        return 'confirm'
    if cleaned in CANCEL_WORDS:
        return 'cancel'
    return 'model'


def pending_draft(user):
    return BotDraft.objects.filter(user=user, status=BotDraft.PENDING).first()


def recent_saved_draft(user):
    cutoff = timezone.now() - timedelta(minutes=DRAFT_MINUTES)
    return (
        BotDraft.objects.filter(user=user, status=BotDraft.SAVED, updated_at__gte=cutoff)
        .order_by('-updated_at')
        .first()
    )


def store_proposal(user, action: dict) -> BotDraft:
    expires = timezone.now() + timedelta(minutes=DRAFT_MINUTES)
    draft = pending_draft(user)
    if draft is None:
        draft = BotDraft(user=user, status=BotDraft.PENDING)
    draft.payload = action
    draft.client_mutation_id = uuid.uuid4().hex
    draft.status = BotDraft.PENDING
    draft.expires_at = expires
    draft.transaction = None
    draft.save()
    return draft


def cancel_pending(user) -> bool:
    draft = pending_draft(user)
    if draft is None:
        return False
    draft.status = BotDraft.CANCELLED
    draft.save(update_fields=['status', 'updated_at'])
    return True


def correct_pending(user, text: str) -> dict | None:
    draft = pending_draft(user)
    if draft is None or _expired(draft):
        return None
    catalog = load_catalog(user)
    raw = dict(draft.payload or {})
    cleaned = _clean(text)
    amount_match = _AMOUNT_RE.search(cleaned)
    wallet_match = _WALLET_RE.search(cleaned)
    if amount_match:
        raw['amount'] = amount_match.group(1).replace(',', '')
    if wallet_match:
        hits = _match_wallets(wallet_match.group(1), catalog.get('wallets') or [])
        if len(hits) != 1:
            if not amount_match:
                return None
            names = ', '.join(row['name'] for row in catalog.get('wallets') or [])
            question = f'Which wallet — {names}? They all waved.' if names else 'Which wallet should I use? I know their names, not your mind.'
            return _ask_about_draft(draft, question)
        raw['account_id'] = hits[0]['id']
    category_match = _CATEGORY_RE.search(_loose(text))
    note_match = _NOTE_RE.search(_loose(text))
    if category_match:
        kind = 'expense' if raw.get('action') == 'create_expense' else 'income'
        matched = match_known_category(kind, category_match.group(1), catalog)
        if matched is None:
            return _ask_about_draft(draft, 'Which category? Food, fuel, rent, or a surprise?')
        raw['category'] = matched
    if note_match:
        raw['notes'] = note_match.group(1)
    if not amount_match and not wallet_match and not category_match and not note_match:
        return None
    result = normalize_action(raw, catalog, user=user)
    if result['action']['action'] in WRITE_ACTIONS:
        draft.payload = result['action']
        draft.expires_at = timezone.now() + timedelta(minutes=DRAFT_MINUTES)
        draft.save(update_fields=['payload', 'expires_at', 'updated_at'])
    result['draft_id'] = draft.id
    result['saved'] = False
    return result


def _ask_about_draft(draft, question: str) -> dict:
    return {
        'reply': question,
        'action': {
            'action': 'ask',
            'amount': None,
            'account_id': None,
            'linked_project_id': None,
            'category': '',
            'notes': '',
            'date': None,
            'confidence': None,
            'ask': question,
        },
        'saved': False,
        'draft_id': draft.id,
    }


def confirm_draft(user, draft_id=None, request=None) -> dict:
    with transaction.atomic():
        draft = _locked_draft(user, draft_id)
        if draft.status == BotDraft.SAVED:
            return _saved_body(draft)
        if draft.status != BotDraft.PENDING:
            raise NotFound('Not found.')
        if _expired(draft):
            raise DraftExpired('That confirmation expired. Say it again.')
        catalog = load_catalog(user)
        checked = normalize_action(draft.payload, catalog, user=user)
        action = checked['action']
        if action.get('action') not in WRITE_ACTIONS:
            original = (draft.payload or {}).get('action')
            if original in (PHASE8_ACTIONS | PHASE9_WRITES) and action.get('action') == 'ask':
                draft.status = BotDraft.CANCELLED
                draft.save(update_fields=['status', 'updated_at'])
                reply = checked.get('reply') or ''
                if not str(reply).startswith('Cancelled.'):
                    checked['reply'] = f'Cancelled. {reply}'
                checked['saved'] = False
                return checked
            checked['saved'] = False
            checked['draft_id'] = draft.id
            return checked
        if action['action'] in PHASE8_ACTIONS:
            from .bot_phase8 import execute_phase8
            tx = execute_phase8(user, action, draft.client_mutation_id, request)
        elif action['action'] in PHASE9_WRITES:
            from .bot_phase9 import execute_phase9
            tx = execute_phase9(user, action, request)
        else:
            tx = _create_transaction(user, action, draft.client_mutation_id, request)
        draft.status = BotDraft.SAVED
        draft.transaction = tx
        draft.save(update_fields=['status', 'transaction', 'updated_at'])
        return _saved_body(draft)


def _create_transaction(user, action, mutation_id, request):
    kind = 'expense' if action['action'] == 'create_expense' else 'income'
    data = {
        'type': kind,
        'amount': action['amount'],
        'date': action['date'],
        'account': action['account_id'],
        'category': action.get('category') or '',
        'notes': action.get('notes') or '',
        'client_mutation_id': mutation_id,
    }
    if action.get('linked_project_id'):
        data['linked_project'] = action['linked_project_id']
    serializer = TransactionSerializer(data=data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    return serializer.save(user=user)


def _locked_draft(user, draft_id):
    qs = BotDraft.objects.select_for_update().filter(user=user)
    if draft_id is not None:
        draft = qs.filter(pk=draft_id).first()
    else:
        draft = qs.filter(status=BotDraft.PENDING).first()
    if draft is None:
        raise NotFound('Not found.')
    return draft


def _saved_body(draft) -> dict:
    payload = draft.payload or {}
    action = payload.get('action')
    tx = draft.transaction
    if action == 'delete_last':
        reply = 'Removed. That entry is gone, and the notebook looks tidier.'
    elif action == 'create_wallet':
        reply = f'Saved. {payload.get("wallet_name") or "That wallet"} is ready.'
    elif action == 'create_income_source':
        reply = f'Saved. {payload.get("source_name") or "That income"} is on the list.'
    elif action == 'transfer':
        reply = 'Saved. The transfer is in both wallets.'
    elif action == 'people_action':
        reply = 'Saved. That people entry is in the books.'
    elif action == 'mark_bill_paid':
        reply = f'Saved. {payload.get("category") or "That bill"} is marked paid.'
    elif action == 'correct_last':
        wallet = tx.account.name if tx and tx.account_id else 'Your wallet'
        reply = f'Saved. The last entry now matches, and {wallet} is updated.'
    elif action == 'set_theme':
        reply = f'Saved. The theme is now {payload.get("theme_label") or "the color you picked"}.'
    elif action == 'set_budget':
        reply = 'Saved. That budget is set for this month.'
    elif action == 'set_travel':
        reply = 'Saved. Travel mode matches that card.'
    elif action == 'set_reminder':
        reply = 'Saved. That bill reminder is updated.'
    else:
        wallet = tx.account.name if tx and tx.account_id else 'Your wallet'
        reply = f'Saved. {wallet} is updated, and it did not even complain.'
    return {
        'reply': reply,
        'action': payload,
        'saved': True,
        'draft_id': draft.id,
        'transaction_id': tx.id if tx else None,
    }


def _expired(draft) -> bool:
    return draft.expires_at <= timezone.now()


def _clean(text: str) -> str:
    return _loose(text).lower()


def _loose(text: str) -> str:
    cleaned = re.sub(r'[.!?]', '', text or '')
    cleaned = re.sub(r'\bplease\b', '', cleaned, flags=re.IGNORECASE)
    return ' '.join(cleaned.split())


_AFFIRMATIVE_RE = re.compile(
    r'^(?:yes|yeah|yep|yup|ok|okay|han|haan|sure|use it|that one)\b',
    re.IGNORECASE,
)
_CASH_WORDS = frozenset({'nakad', 'naqad', 'cash'})


def resume_wallet_answer(user, text: str, request=None):
    """Keep an expense that is only waiting for a wallet. A later 'cash' still belongs to it."""
    draft = pending_draft(user)
    if draft is None or _expired(draft):
        return None
    payload = dict(draft.payload or {})
    if payload.get('awaiting') != 'wallet':
        if (
            payload.get('action') in ('create_expense', 'create_income')
            and payload.get('account_id')
            and _affirmative(text)
            and not _replaces_expense(text, payload)
        ):
            return confirm_draft(user, None, request)
        return None
    if _replaces_expense(text, payload):
        draft.status = BotDraft.CANCELLED
        draft.save(update_fields=['status', 'updated_at'])
        return None

    from .bot_catalog import load_catalog
    catalog = load_catalog(user)
    wallets = [row for row in catalog.get('wallets') or [] if row.get('type') != 'person']
    hits = _match_wallet_answer(text, wallets)
    if len(hits) == 1:
        return _fill_wallet(user, draft, payload, hits[0]['id'], catalog, request)
    if len(hits) > 1:
        return _wallet_question(draft, payload, wallets, 'Which of those wallets should I use?')
    if _affirmative(text) and payload.get('suggested_account_id'):
        return _fill_wallet(user, draft, payload, payload['suggested_account_id'], catalog, request)

    cash = [row for row in wallets if row.get('type') == 'cash']
    if len(cash) == 1 and _means_unlisted_cash(text):
        payload['suggested_account_id'] = cash[0]['id']
        draft.payload = payload
        draft.expires_at = timezone.now() + timedelta(minutes=DRAFT_MINUTES)
        draft.save(update_fields=['payload', 'expires_at', 'updated_at'])
        note = payload.get('notes') or 'that'
        question = f"I don't have a physical wallet. Use {cash[0]['name']} for {note}?"
        return _wallet_question(draft, payload, wallets, question)

    note = payload.get('notes') or 'that'
    names = ', '.join(row['name'] for row in wallets) or 'the wallets you already have'
    return _wallet_question(
        draft,
        payload,
        wallets,
        f"I don't have that wallet. You have {names}. Which one should I use for {note}?",
    )


def _fill_wallet(user, draft, payload, account_id, catalog, request):
    from .bot_actions import WRITE_ACTIONS, normalize_action
    filled = {key: value for key, value in payload.items() if key not in ('awaiting', 'suggested_account_id')}
    filled['account_id'] = account_id
    result = normalize_action(filled, catalog, user=user)
    result.pop('partial', None)
    if result['action']['action'] in WRITE_ACTIONS:
        draft.payload = result['action']
        draft.expires_at = timezone.now() + timedelta(minutes=DRAFT_MINUTES)
        draft.save(update_fields=['payload', 'expires_at', 'updated_at'])
        result['draft_id'] = draft.id
    result['saved'] = False
    return result


def _wallet_question(draft, payload, wallets, question: str) -> dict:
    draft.payload = payload
    draft.expires_at = timezone.now() + timedelta(minutes=DRAFT_MINUTES)
    draft.save(update_fields=['payload', 'expires_at', 'updated_at'])
    body = _ask_about_draft(draft, question)
    body['draft_id'] = draft.id
    return body


def _affirmative(text: str) -> bool:
    return bool(_AFFIRMATIVE_RE.search(_clean(text)))


def _means_unlisted_cash(text: str) -> bool:
    words = set(_clean(text).split())
    return bool(words & {'physical', 'pocket', 'purse', 'nakad', 'naqad'})


def _replaces_expense(text: str, payload: dict) -> bool:
    digits = re.findall(r'\d+', (text or '').replace(',', ''))
    if not digits:
        return False
    current = str(payload.get('amount') or '').split('.')[0]
    return any(piece != current for piece in digits)


def _match_wallet_answer(text: str, wallets: list) -> list:
    lowered = _clean(text)
    stripped = _AFFIRMATIVE_RE.sub('', lowered).strip()
    hits = _match_wallets(stripped or lowered, wallets)
    if hits:
        return hits
    named = [row for row in wallets if row['name'].lower() in lowered]
    if named:
        return named
    if set(lowered.split()) & _CASH_WORDS:
        cash = [row for row in wallets if row.get('type') == 'cash']
        if len(cash) == 1:
            return cash
    return []


def _match_wallets(query: str, wallets: list) -> list:
    q = _FILLER_RE.sub(' ', query.lower())
    q = ' '.join(q.split())
    if not q:
        return []
    hits = []
    for wallet in wallets:
        name = wallet['name'].lower()
        if q in name or name in q or (q == 'cash' and wallet['type'] == 'cash'):
            hits.append(wallet)
    return hits
