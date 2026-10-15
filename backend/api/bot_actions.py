"""Turn a model JSON object into a Trai action this server will accept.

A write action is only a proposal. Nothing here inserts a transaction.
"""

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.utils import timezone

PHASE8_ACTIONS = frozenset({
    'mark_bill_paid',
    'delete_last',
    'correct_last',
    'transfer',
    'people_action',
    'create_wallet',
    'create_income_source',
})
ALLOWED_ACTIONS = frozenset({
    'create_expense',
    'create_income',
    'mark_recurring_income',
    'ask',
    'refuse',
}) | PHASE8_ACTIONS
WRITE_ACTIONS = frozenset({
    'create_expense',
    'create_income',
    'mark_recurring_income',
}) | PHASE8_ACTIONS

_SQL_RE = re.compile(
    r'\b(select|insert|update|delete|drop|alter|union)\b',
    re.IGNORECASE,
)
_SECRET_RE = re.compile(r'password|google_sub|auth_user|otp', re.IGNORECASE)

EXPENSE_ALIASES = {
    'food': 'Food & Drink',
    'snack': 'Food & Drink',
    'snacks': 'Food & Drink',
    'chips': 'Food & Drink',
    'fuel': 'Fuel & Maintenance',
    'petrol': 'Fuel & Maintenance',
    'rent': 'Rent',
    'grocery': 'Grocery',
    'groceries': 'Grocery',
}
INCOME_ALIASES = {
    'salary': 'Salary',
    'monthly': 'Monthly Income',
}

REFUSE_REPLY = 'I can only add your own expenses and income. Other people\'s money is not my business.'


def normalize_action(raw, catalog, today=None, user=None) -> dict:
    """Return reply, action, saved=False, and warning when we block a double mark."""
    today = today or timezone.localdate()
    if not isinstance(raw, dict):
        return _ask('I missed that. Tell me the amount and the wallet, and I will stop guessing.')

    if _unsafe_text(raw):
        return _refuse()

    action = str(raw.get('action') or '').strip()
    if action not in ALLOWED_ACTIONS:
        return _refuse()
    if action == 'refuse':
        reason = str(raw.get('reason') or '')
        if reason in ('erase', 'household'):
            from .bot_phase8 import phase8_refusal
            return phase8_refusal(reason)
        return _refuse()
    if action == 'ask':
        question = _safe_question(raw.get('ask')) or ''
        if not _is_date_question(question):
            return _ask(question or 'Can you say that again with the amount and the wallet? I am a bookkeeper, not a mind reader.')
        action = 'mark_recurring_income' if _optional_int(raw.get('linked_project_id')) else 'create_expense'
        raw = {**raw, 'date': None}

    if action in PHASE8_ACTIONS:
        from .bot_phase8 import normalize_phase8
        return normalize_phase8(raw, catalog, user=user, today=today)

    wallets = {row['id']: row for row in catalog.get('wallets') or []}
    sources = {row['id']: row for row in catalog.get('income_sources') or []}

    account_id = _optional_int(raw.get('account_id'))
    project_id = _optional_int(raw.get('linked_project_id'))
    if account_id is not None and account_id not in wallets:
        return _refuse()
    if project_id is not None and project_id not in sources:
        return _refuse()

    if action == 'create_expense':
        project_id = None
    source = sources.get(project_id) if project_id is not None else None

    if action == 'mark_recurring_income':
        if source is None:
            return _ask('Which monthly income is this? I have a short list and I do not want to wave at the wrong one.')
        if source['income_type'] not in ('recurring_monthly', 'contract_monthly'):
            return _ask(f'Is {source["name"]} the monthly one, or a one-time visit?')
        if account_id is None:
            account_id = source.get('default_account_id')
            if account_id not in wallets:
                return _ask('Which wallet received this? I will not guess and then apologize.')

    if action in WRITE_ACTIONS and account_id is None:
        return _ask('Which wallet should I use? I know their names, not your mind.')

    amount = _amount(raw.get('amount'))
    if action == 'mark_recurring_income' and amount is None and source is not None:
        amount = _amount(source.get('amount'))
    if amount is None or amount <= 0:
        return _ask('How much was it? A number would help. I am terrible at guessing rupees.')

    if source is not None and source.get('received_this_month'):
        return _ask(
            f'{source["name"]} is already marked for this month. Is this an extra payment, or does it just like being counted twice?',
            warning='already_received_this_month',
            linked_project_id=source['id'],
        )

    parsed_date = _date(raw.get('date'), today)

    kind = 'expense' if action == 'create_expense' else 'income'
    raw_category = raw.get('category')
    if action == 'mark_recurring_income' and not str(raw_category or '').strip():
        raw_category = 'Monthly Income'
    category = _category(kind, raw_category, catalog)
    notes = _notes(raw.get('notes'))
    wallet_name = wallets[account_id]['name']
    proposal = {
        'action': action,
        'amount': f'{amount:.2f}',
        'account_id': account_id,
        'linked_project_id': project_id,
        'category': category,
        'notes': notes,
        'date': parsed_date.isoformat(),
        'confidence': _confidence(raw.get('confidence')),
        'ask': None,
    }
    return {
        'reply': _confirmation(proposal, wallet_name, source),
        'action': proposal,
        'saved': False,
        'warning': None,
    }


def _unsafe_text(raw) -> bool:
    for key, value in raw.items():
        if _SQL_RE.search(str(key)) or _SECRET_RE.search(str(key)):
            return True
        if isinstance(value, str) and (_SQL_RE.search(value) or _SECRET_RE.search(value)):
            return True
    return False


def _refuse() -> dict:
    return {
        'reply': REFUSE_REPLY,
        'action': {
            'action': 'refuse',
            'amount': None,
            'account_id': None,
            'linked_project_id': None,
            'category': '',
            'notes': '',
            'date': None,
            'confidence': None,
            'ask': None,
        },
        'saved': False,
        'warning': None,
    }


def _ask(question, warning=None, linked_project_id=None) -> dict:
    return {
        'reply': question,
        'action': {
            'action': 'ask',
            'amount': None,
            'account_id': None,
            'linked_project_id': linked_project_id,
            'category': '',
            'notes': '',
            'date': None,
            'confidence': None,
            'ask': question,
        },
        'saved': False,
        'warning': warning,
    }


def _optional_int(value):
    if value is None or value == '':
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _amount(value):
    if value is None or value == '':
        return None
    try:
        return Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return None


def _date(value, today: date) -> date:
    """A missing or everyday word is today. A named day is used when it is readable."""
    text = ' '.join(str(value or '').split())
    if text.lower() in ('', 'today', 'now', 'current', 'current date'):
        return today
    for raw in (text[:10], text):
        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y'):
            try:
                parsed = datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
            if abs((parsed - today).days) <= 366:
                return parsed
            return today
    return today


def _is_date_question(question: str) -> bool:
    text = question.lower()
    return 'date' in text or 'which day' in text or 'what day' in text


def match_known_category(kind: str, raw, catalog) -> str | None:
    allowed = list((catalog.get('categories') or {}).get(kind) or [])
    text = ' '.join(str(raw or '').split())
    if not text:
        return None
    aliases = EXPENSE_ALIASES if kind == 'expense' else INCOME_ALIASES
    canonical = aliases.get(text.lower(), text)
    for name in allowed:
        if name.lower() == canonical.lower():
            return name
    return None


def match_expense_category(raw, catalog) -> str | None:
    """An expense category from this user's list, or None when the name is not one of them."""
    return match_known_category('expense', raw, catalog)


def action_is_unsafe(raw) -> bool:
    return isinstance(raw, dict) and _unsafe_text(raw)


def _category(kind: str, raw, catalog) -> str:
    allowed = list((catalog.get('categories') or {}).get(kind) or [])
    text = ' '.join(str(raw or '').split())
    aliases = EXPENSE_ALIASES if kind == 'expense' else INCOME_ALIASES
    canonical = aliases.get(text.lower(), text)
    for name in allowed:
        if name.lower() == canonical.lower():
            return name
    if kind == 'expense':
        return 'Miscellaneous' if 'Miscellaneous' in allowed else (allowed[-1] if allowed else 'Miscellaneous')
    return 'Other' if 'Other' in allowed else (allowed[-1] if allowed else 'Other')


def _notes(value) -> str:
    text = ' '.join(str(value or '').split())
    return text[:500]


def _confidence(value):
    text = str(value or '').strip().lower()
    if text in ('high', 'medium', 'low'):
        return text
    return None


def _safe_question(value) -> str:
    text = ' '.join(str(value or '').split())
    if not text or len(text) > 240:
        return ''
    if _SQL_RE.search(text) or _SECRET_RE.search(text):
        return ''
    return text


def _confirmation(proposal, wallet_name, source) -> str:
    amount = _amount(proposal['amount'])
    shown = f'Rs {amount:,.2f}'
    if amount == amount.to_integral():
        shown = f'Rs {int(amount):,}'
    kind = 'Expense' if proposal['action'] == 'create_expense' else 'Income'
    place = 'from' if proposal['action'] == 'create_expense' else 'in'
    note = proposal['notes']
    note_bit = f', note {note}' if note else ''
    link = ''
    if source is not None and proposal['action'] == 'mark_recurring_income':
        link = f' This marks {source["name"]} for this month.'
    when = datetime.strptime(proposal['date'], '%Y-%m-%d').strftime('%d %b %Y')
    return (
        f'{kind} {shown} {place} {wallet_name}{note_bit}, '
        f'category {proposal["category"]}, on {when}.{link} Looks right from here. Save it?'
    )
