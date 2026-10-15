"""Phase 8 writes for Trai.

Each one is a proposal until confirm. The server picks the bill, the person,
and the last entry Trai saved. A model id for another user, or for a row Trai
did not save, is ignored.
"""

import re
from datetime import datetime
from decimal import Decimal

from django.utils import timezone

from .bot_actions import (
    _SECRET_RE,
    _SQL_RE,
    _amount,
    _ask,
    _date,
    _notes,
    _optional_int,
    _refuse,
    match_known_category,
)
from .models import Account, BotDraft, Project, RecurringExpense, Transaction

_PEOPLE_KINDS = frozenset({'lend', 'borrow', 'pay', 'receive'})
_PEOPLE_LABEL = {
    'lend': 'Money Lent',
    'borrow': 'Money Borrowed',
    'pay': 'Money Sent',
    'receive': 'Money Received',
}
_WALLET_TYPES = frozenset({'bank', 'cash', 'credit_card'})
_INCOME_TYPES = frozenset({'recurring_monthly', 'contract_monthly', 'one_time'})

_DELETE_ALL_RE = re.compile(
    r'\b(?:delete|remove|erase|wipe|clear)\b.{0,40}\b(?:all|every|everything)\b',
    re.I,
)
_DELETE_LAST_RE = re.compile(
    r'\bundo\b|\b(?:delete|remove|erase)\b.{0,30}\b(?:last|that|it)\b',
    re.I,
)
_CORRECT_RE = re.compile(r'\b(?:correct|change|fix)\b.{0,40}\b(?:last|that)\b', re.I)
_BILL_VERB_RE = re.compile(r'\b(?:mark|paid|pay)\b', re.I)
_TRANSFER_RE = re.compile(r'\btransfer\b', re.I)
_MOVE_RE = re.compile(r'\bmove\b', re.I)
_FROM_TO_RE = re.compile(r'\bfrom\s+(.+?)\s+to\s+(.+)$', re.I)
_PEOPLE_RE = re.compile(r'\b(lend|lent|borrow|borrowed|pay|paid|receive|received)\b', re.I)
_WALLET_RE = re.compile(r'\b(?:add|create|open|new)\b', re.I)
_INCOME_RE = re.compile(r'\bincome(?:\s+source)?\s+(?:called|named\s+)?(.+)$', re.I)
_CALLED_RE = re.compile(r'\b(?:called|named)\s+["\']?(.+)', re.I)
_AMOUNT_RE = re.compile(
    r'\b(?:rs\.?|rp|pkr|rupees?)?\s*(\d+(?:[.,]\d+)?)(?:\s*(k|thousand))?\b',
    re.I,
)
_PLACE_RE = re.compile(r'\b(?:from|into|on|in)\s+(.+)$', re.I)


def phase8_question(text: str, catalog: dict) -> dict | None:
    """A phase 8 sentence Trai can route without the model. None leaves it for Gemini."""
    if _DELETE_ALL_RE.search(text):
        return {'action': 'refuse', 'reason': 'erase'}
    if re.search(r'\bhousehold\b', text or '', re.I):
        return {'action': 'refuse', 'reason': 'household'}
    if _DELETE_LAST_RE.search(text):
        return {'action': 'delete_last'}
    if _CORRECT_RE.search(text):
        raw = {'action': 'correct_last'}
        amount = _grab_amount(text)
        if amount:
            raw['amount'] = amount
        return raw

    bills = list(catalog.get('bills') or [])
    if _BILL_VERB_RE.search(text):
        picked = _named(text, bills)
        if len(picked) > 1 or (not picked and re.search(r'\b(?:mark\b.+\bpaid|paid\b.+\bbill|\bbill\b)', text, re.I)):
            return {'action': 'ask', 'ask': _which_bill(bills)}
        if len(picked) == 1:
            raw = {'action': 'mark_bill_paid', 'bill_id': picked[0]['id']}
            amount = _grab_amount(text)
            if amount:
                raw['amount'] = amount
            wallet = _explicit_wallet(text, catalog.get('wallets') or [])
            if wallet:
                raw['account_id'] = wallet['id']
            return raw

    if _TRANSFER_RE.search(text) or (_MOVE_RE.search(text) and _FROM_TO_RE.search(text)):
        raw = {'action': 'transfer'}
        amount = _grab_amount(text)
        if amount:
            raw['amount'] = amount
        match = _FROM_TO_RE.search(text)
        wallets = catalog.get('wallets') or []
        if match:
            sources = _named(match.group(1), wallets)
            dests = _named(match.group(2), wallets)
            if len(sources) == 1:
                raw['account_id'] = sources[0]['id']
            if len(dests) == 1:
                raw['to_account_id'] = dests[0]['id']
        return raw

    people_match = _PEOPLE_RE.search(text)
    people = _named(text, catalog.get('people') or [])
    if people_match and len(people) == 1:
        kind = people_match.group(1).lower()
        kind = {'lent': 'lend', 'borrowed': 'borrow', 'paid': 'pay', 'received': 'receive'}.get(kind, kind)
        raw = {'action': 'people_action', 'people_kind': kind, 'person_id': people[0]['id']}
        amount = _grab_amount(text)
        if amount:
            raw['amount'] = amount
        wallet = _explicit_wallet(text, catalog.get('wallets') or [])
        if wallet:
            raw['account_id'] = wallet['id']
        return raw

    if _WALLET_RE.search(text) and re.search(r'\bwallets?\b', text, re.I):
        raw = {'action': 'create_wallet', 'wallet_name': _called(text), 'wallet_type': _wallet_type(text)}
        amount = _grab_amount(text)
        if amount:
            raw['amount'] = amount
        return raw

    if _WALLET_RE.search(text) and re.search(r'\bincome\b', text, re.I):
        match = _INCOME_RE.search(text)
        name = _called(text) or _income_name(match.group(1) if match else '')
        raw = {
            'action': 'create_income_source',
            'source_name': name,
            'income_type': 'one_time' if re.search(r'\bone[- ]time\b', text, re.I) else 'recurring_monthly',
        }
        if re.search(r'\bcontract\b', text, re.I):
            raw['income_type'] = 'contract_monthly'
        amount = _grab_amount(text)
        if amount:
            raw['amount'] = amount
        wallet = _explicit_wallet(text, catalog.get('wallets') or [])
        if wallet:
            raw['account_id'] = wallet['id']
        return raw
    return None


def normalize_phase8(raw, catalog, user=None, today=None) -> dict:
    today = today or timezone.localdate()
    if user is None:
        return _refuse()
    action = str(raw.get('action') or '').strip()
    wallets = {row['id']: row for row in catalog.get('wallets') or []}
    if action == 'mark_bill_paid':
        return _bill(raw, user, wallets, today)
    if action == 'delete_last':
        return _delete(raw, user)
    if action == 'correct_last':
        return _correct(raw, user, catalog, wallets, today)
    if action == 'transfer':
        return _transfer(raw, wallets, today)
    if action == 'people_action':
        return _people(raw, catalog, wallets, today)
    if action == 'create_wallet':
        return _wallet(raw, user, today)
    if action == 'create_income_source':
        return _income(raw, user, wallets, today)
    return _refuse()


def execute_phase8(user, action, mutation_id, request):
    """Write the confirmed proposal. Returns the row a later undo should target."""
    name = action.get('action')
    if name == 'mark_bill_paid':
        return _pay_bill(user, action, mutation_id, request)
    if name == 'delete_last':
        _delete_saved(user, action)
        return None
    if name == 'correct_last':
        return _apply_correction(user, action)
    if name == 'transfer':
        return _move_money(user, action, mutation_id)
    if name == 'people_action':
        return _people_entry(user, action, mutation_id)
    if name == 'create_wallet':
        _insert_wallet(user, action)
        return None
    if name == 'create_income_source':
        _insert_income(user, action)
        return None
    return None


def _bill(raw, user, wallets, today):
    bill_id = _optional_int(raw.get('bill_id'))
    bill = RecurringExpense.objects.filter(user=user, pk=bill_id, active=True).first() if bill_id else None
    if bill is None:
        if raw.get('bill_id') not in (None, ''):
            return _refuse()
        return _ask('Which bill should I mark paid?')
    left = Decimal(str(bill.remaining_amount)).quantize(Decimal('0.01'))
    if left <= Decimal('0.01'):
        when = 'this month' if bill.frequency == 'monthly' else 'in full'
        return _ask(f'{bill.name} is already paid {when}.', warning='already_paid_this_month')
    amount = _amount(raw.get('amount')) or left
    if amount <= 0:
        return _ask('How much of this bill should I mark paid?')
    if amount > left:
        return _ask(f'{bill.name} has {_shown(left)} left. How much should I mark?')
    account_id = _optional_int(raw.get('account_id'))
    if account_id is None and bill.account_id in wallets:
        account_id = bill.account_id
    if account_id is None:
        return _ask(f'Which wallet should pay {bill.name}?')
    if account_id not in wallets:
        return _refuse()
    when = _date(raw.get('date'), today)
    summary = f'Mark {bill.name} paid, {_shown(amount)} from {wallets[account_id]["name"]}.'
    return _ready(
        _save_reply(summary),
        action='mark_bill_paid',
        amount=f'{amount:.2f}',
        account_id=account_id,
        category=_safe_bit(bill.name, 100) or 'Bills & Utilities',
        notes='paid',
        date=when.isoformat(),
        summary=summary,
        bill_id=bill.id,
    )


def _delete(raw, user):
    tx = _target_transaction(user, raw.get('target_id'))
    if tx is None:
        return _ask('I have not saved an entry yet, so there is nothing to undo.')
    label = _safe_bit(tx.notes) or _safe_bit(tx.category) or 'entry'
    wallet = tx.account.name if tx.account_id else 'the wallet'
    when = tx.date.strftime('%d %b %Y')
    summary = f'Remove the {_shown(tx.amount)} {label} entry from {wallet}, on {when}.'
    return _ready(
        f'{summary} This only removes what I saved. Looks right from here. Save it?',
        action='delete_last',
        amount=f'{tx.amount:.2f}',
        account_id=tx.account_id,
        category=_safe_bit(tx.category, 100),
        notes=_safe_bit(tx.notes, 120),
        date=tx.date.isoformat(),
        summary=summary,
        target_id=tx.id,
    )


def _correct(raw, user, catalog, wallets, today):
    tx = _target_transaction(user, raw.get('target_id'))
    if tx is None:
        return _ask('I have not saved an entry yet, so there is nothing to change.')
    mentioned = any(raw.get(key) not in (None, '') for key in ('amount', 'account_id', 'notes', 'category', 'to_account_id'))
    if not mentioned:
        return _ask('What should I change on the last entry? The amount, the wallet, or the note?')
    amount = _amount(raw.get('amount')) if raw.get('amount') not in (None, '') else tx.amount
    if amount is None or amount <= 0:
        return _ask('How much should the last entry be?')
    account_id = _optional_int(raw.get('account_id')) if raw.get('account_id') not in (None, '') else tx.account_id
    if account_id not in wallets:
        if raw.get('account_id') not in (None, ''):
            return _refuse()
        return _ask('Which wallet should the last entry use?')
    sibling = _transfer_sibling(user, tx)
    to_id = sibling.account_id if sibling else None
    if raw.get('to_account_id') not in (None, ''):
        to_id = _optional_int(raw.get('to_account_id'))
        if to_id not in wallets:
            return _refuse()
    if sibling and (to_id is None or to_id == account_id):
        return _ask('Which wallet should receive the transfer?')
    if raw.get('date'):
        when = _date(raw.get('date'), today)
    else:
        when = tx.date
    category = tx.category or ''
    notes = tx.notes or ''
    if not tx.people_pair_id and tx.category != 'Bank Transfer':
        if raw.get('category'):
            kind = 'expense' if tx.type == 'expense' else 'income'
            category = match_known_category(kind, raw.get('category'), catalog) or category
        if raw.get('notes'):
            notes = _notes(raw.get('notes'))
    category = _safe_bit(category, 100)
    notes = _safe_bit(notes, 200)
    wallet_name = wallets[account_id]['name']
    if sibling:
        summary = f'Change the transfer to {_shown(amount)} from {wallet_name} to {wallets[to_id]["name"]}.'
    elif tx.people_pair_id:
        summary = f'Change the last people entry to {_shown(amount)} from {wallet_name}.'
    else:
        summary = f'Change the last entry to {_shown(amount)} from {wallet_name}.'
    fields = dict(
        action='correct_last',
        amount=f'{amount:.2f}',
        account_id=account_id,
        category=category,
        notes=notes,
        date=when.isoformat(),
        summary=summary,
        target_id=tx.id,
    )
    if to_id:
        fields['to_account_id'] = to_id
    if tx.people_pair_id:
        other = Transaction.objects.filter(user=user, people_pair_id=tx.people_pair_id).exclude(pk=tx.id).first()
        if other:
            fields['person_id'] = other.account_id
    return _ready(_save_reply(summary), **fields)


def _transfer(raw, wallets, today):
    source_id = _optional_int(raw.get('account_id'))
    dest_id = _optional_int(raw.get('to_account_id'))
    if source_id is not None and source_id not in wallets:
        return _refuse()
    if dest_id is not None and dest_id not in wallets:
        return _refuse()
    if source_id is None or dest_id is None:
        return _ask('Which wallets? Tell me where it leaves and where it arrives.')
    if source_id == dest_id:
        return _ask('Those are the same wallet. Which one should receive the money?')
    amount = _amount(raw.get('amount'))
    if amount is None or amount <= 0:
        return _ask('How much should I move?')
    when = _date(raw.get('date'), today)
    summary = f'Move {_shown(amount)} from {wallets[source_id]["name"]} to {wallets[dest_id]["name"]}.'
    return _ready(
        _save_reply(summary),
        action='transfer',
        amount=f'{amount:.2f}',
        account_id=source_id,
        to_account_id=dest_id,
        category='Bank Transfer',
        date=when.isoformat(),
        summary=summary,
    )


def _people(raw, catalog, wallets, today):
    kind = str(raw.get('people_kind') or '').strip().lower()
    if kind not in _PEOPLE_KINDS:
        return _ask('Is this lend, borrow, pay, or receive?')
    people = {row['id']: row for row in catalog.get('people') or []}
    person_id = _optional_int(raw.get('person_id'))
    if person_id not in people:
        if raw.get('person_id') not in (None, ''):
            return _refuse()
        return _ask('Who is this for?')
    account_id = _optional_int(raw.get('account_id'))
    if account_id is None:
        return _ask('Which wallet should I use?')
    if account_id not in wallets:
        return _refuse()
    amount = _amount(raw.get('amount'))
    if amount is None or amount <= 0:
        return _ask('How much was it?')
    when = _date(raw.get('date'), today)
    label = _PEOPLE_LABEL[kind]
    summary = f'{kind.capitalize()} {_shown(amount)} with {people[person_id]["name"]} from {wallets[account_id]["name"]}.'
    return _ready(
        _save_reply(summary),
        action='people_action',
        people_kind=kind,
        person_id=person_id,
        amount=f'{amount:.2f}',
        account_id=account_id,
        category=f'People: {label}',
        date=when.isoformat(),
        summary=summary,
    )


def _wallet(raw, user, today):
    wallet_type = str(raw.get('wallet_type') or 'bank').strip().lower().replace(' ', '_')
    if wallet_type in ('credit', 'card'):
        wallet_type = 'credit_card'
    if wallet_type == 'person':
        return _no('People stay on the people list. I can add a bank, cash, or card wallet.')
    if wallet_type not in _WALLET_TYPES:
        return _ask('Should this be a bank, cash, or card wallet?')
    name = _safe_bit(raw.get('wallet_name'), 100)
    if not name:
        return _ask('What should I call the wallet?')
    if Account.objects.filter(user=user, name__iexact=name).exists():
        return _ask(f'You already have {name}.')
    opening = _amount(raw.get('amount'))
    if opening is not None and opening < 0:
        return _ask('The opening balance needs to be zero or more.')
    if opening is None:
        opening = Decimal('0.00')
    kind = {'bank': 'bank', 'cash': 'cash', 'credit_card': 'card'}[wallet_type]
    summary = f'New {kind} wallet {name}.'
    if opening > 0:
        summary = f'{summary[:-1]}, opening {_shown(opening)}.'
    return _ready(
        _save_reply(summary),
        action='create_wallet',
        wallet_name=name,
        wallet_type=wallet_type,
        amount=f'{opening:.2f}' if opening > 0 else None,
        date=_date(None, today).isoformat(),
        summary=summary,
    )


def _income(raw, user, wallets, today):
    income_type = str(raw.get('income_type') or 'recurring_monthly').strip()
    if income_type not in _INCOME_TYPES:
        return _ask('I can add a monthly source or a one-time source.')
    name = _safe_bit(raw.get('source_name'), 150)
    if not name:
        return _ask('What should I call the income source?')
    if Project.objects.filter(user=user, name__iexact=name).exists():
        return _ask(f'You already have {name}.')
    amount = _amount(raw.get('amount'))
    if amount is None or amount <= 0:
        return _ask(f'How much does {name} bring in?')
    account_id = _optional_int(raw.get('account_id'))
    if account_id is not None and account_id not in wallets:
        return _refuse()
    when = _date(raw.get('date'), today)
    rhythm = 'one-time' if income_type == 'one_time' else 'monthly'
    summary = f'New {rhythm} income {name}, {_shown(amount)}.'
    return _ready(
        _save_reply(summary),
        action='create_income_source',
        source_name=name,
        income_type=income_type,
        amount=f'{amount:.2f}',
        account_id=account_id,
        date=when.isoformat(),
        summary=summary,
    )


def _pay_bill(user, action, mutation_id, request):
    from .serializers import TransactionSerializer

    existing = Transaction.objects.filter(user=user, client_mutation_id=mutation_id).first()
    if existing:
        return existing
    bill = RecurringExpense.objects.filter(user=user, pk=action.get('bill_id'), active=True).first()
    if bill is None or bill.remaining_amount <= 0.01:
        from rest_framework.exceptions import ValidationError
        raise ValidationError('That bill is already paid.')
    data = {
        'type': 'expense',
        'amount': action['amount'],
        'date': action['date'],
        'account': action['account_id'],
        'category': (action.get('category') or bill.name)[:100],
        'notes': action.get('notes') or 'paid',
        'client_mutation_id': mutation_id,
        'linked_recurring_expense': bill.id,
    }
    serializer = TransactionSerializer(data=data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    return serializer.save(user=user)


def _delete_saved(user, action):
    from rest_framework.exceptions import ValidationError

    tx = Transaction.objects.select_for_update().filter(pk=action.get('target_id'), user=user).first()
    if tx is None:
        return
    if not BotDraft.objects.filter(user=user, status=BotDraft.SAVED, transaction_id=tx.id).exists():
        raise ValidationError('That entry is not one I saved.')
    _remove_pair(user, tx)


def _apply_correction(user, action):
    from rest_framework.exceptions import ValidationError

    tx = Transaction.objects.select_for_update().filter(pk=action.get('target_id'), user=user).first()
    if tx is None:
        raise ValidationError('That entry is already gone.')
    if not BotDraft.objects.filter(user=user, status=BotDraft.SAVED, transaction_id=tx.id).exists():
        raise ValidationError('That entry is not one I saved.')
    amount = Decimal(action['amount'])
    when = datetime.strptime(action['date'], '%Y-%m-%d').date()
    account_id = action['account_id']
    if tx.people_pair_id:
        rows = Transaction.objects.select_for_update().filter(user=user, people_pair_id=tx.people_pair_id)
        for row in rows:
            row.amount = amount
            row.date = when
            if row.id == tx.id:
                row.account_id = account_id
            row.save()
        return tx
    sibling = _transfer_sibling(user, tx)
    if sibling is None or sibling.category != 'Bank Transfer':
        tx.amount = amount
        tx.date = when
        tx.account_id = account_id
        if action.get('category'):
            tx.category = action['category']
        tx.notes = action.get('notes') or ''
        tx.save()
        return tx
    tx.amount = amount
    tx.date = when
    tx.account_id = account_id
    tx.save()
    sibling.amount = amount
    sibling.date = when
    if action.get('to_account_id'):
        sibling.account_id = action['to_account_id']
    sibling.save()
    return tx


def _move_money(user, action, mutation_id):
    from rest_framework.exceptions import ValidationError

    out_key = mutation_id
    in_key = f'{mutation_id}:in'
    existing = Transaction.objects.filter(user=user, client_mutation_id=out_key).first()
    incoming = Transaction.objects.filter(user=user, client_mutation_id=in_key).first()
    if existing and incoming:
        return existing
    source = Account.objects.filter(user=user, pk=action.get('account_id')).exclude(type='person').first()
    dest = Account.objects.filter(user=user, pk=action.get('to_account_id')).exclude(type='person').first()
    if source is None or dest is None or source.id == dest.id:
        raise ValidationError('Those wallets cannot be used for a transfer.')
    amount = Decimal(action['amount'])
    when = datetime.strptime(action['date'], '%Y-%m-%d').date()
    note = f'{source.name} to {dest.name}'
    if existing is None:
        existing = Transaction.objects.create(
            user=user,
            type='expense',
            amount=amount,
            date=when,
            account=source,
            category='Bank Transfer',
            notes=f'{note} (transfer out)',
            client_mutation_id=out_key,
        )
    if incoming is None:
        Transaction.objects.create(
            user=user,
            type='income',
            amount=amount,
            date=when,
            account=dest,
            category='Bank Transfer',
            notes=f'{note} (transfer in)',
            client_mutation_id=in_key,
        )
    return existing


def _people_entry(user, action, mutation_id):
    from rest_framework.exceptions import ValidationError

    from .travel_people_api import post_people_double_entry

    kind = action.get('people_kind')
    if kind not in _PEOPLE_KINDS:
        raise ValidationError('That people action is not one I can save.')
    wallet = Account.objects.filter(user=user, pk=action.get('account_id')).exclude(type='person').first()
    person = Account.objects.filter(user=user, pk=action.get('person_id'), type='person').first()
    if wallet is None or person is None:
        raise ValidationError('Pick one of your wallets and one of your people.')
    _pair, wallet_tx, _person_tx, _created = post_people_double_entry(
        user=user,
        action_name=kind,
        wallet=wallet,
        person=person,
        amount=Decimal(action['amount']),
        tx_date=datetime.strptime(action['date'], '%Y-%m-%d').date(),
        notes='',
        pair_id=mutation_id,
        client_mutation_id=mutation_id,
    )
    return wallet_tx


def _insert_wallet(user, action):
    from rest_framework.exceptions import ValidationError

    name = action.get('wallet_name') or ''
    wallet_type = action.get('wallet_type')
    if wallet_type not in _WALLET_TYPES or not name:
        raise ValidationError('That wallet cannot be added.')
    if Account.objects.filter(user=user, name__iexact=name).exists():
        raise ValidationError('That wallet already exists.')
    opening = Decimal(action['amount']) if action.get('amount') else Decimal('0')
    Account.objects.create(user=user, name=name, type=wallet_type, opening_balance=opening)


def _insert_income(user, action):
    from rest_framework.exceptions import ValidationError

    name = action.get('source_name') or ''
    income_type = action.get('income_type')
    if income_type not in _INCOME_TYPES or not name:
        raise ValidationError('That income source cannot be added.')
    if Project.objects.filter(user=user, name__iexact=name).exists():
        raise ValidationError('That income source already exists.')
    Project.objects.create(
        user=user,
        name=name,
        income_type=income_type,
        amount=Decimal(action['amount']),
        status='active',
        start_date=datetime.strptime(action['date'], '%Y-%m-%d').date(),
        default_account_id=action.get('account_id'),
    )


def _target_transaction(user, preferred_id):
    """The last entry Trai saved. A different id is ignored. A deleted id is not replaced."""
    last = _last_trai_transaction(user)
    preferred = _optional_int(preferred_id)
    if not preferred or last is None or preferred == last.id:
        return last
    if Transaction.objects.filter(pk=preferred).exists():
        return last
    return None


def _last_trai_transaction(user):
    draft = (
        BotDraft.objects.filter(user=user, status=BotDraft.SAVED, transaction__isnull=False)
        .select_related('transaction', 'transaction__account')
        .order_by('-updated_at', '-id')
        .first()
    )
    tx = draft.transaction if draft else None
    if tx is None or tx.user_id != user.id:
        return None
    return tx


def phase8_refusal(reason: str) -> dict:
    if reason == 'household':
        return _no('Shared household expenses stay outside this chat.')
    return _no('I will not erase the books. I can undo the last entry I saved, and that is all.')


def _owned(user, tx_id):
    tx = Transaction.objects.filter(pk=tx_id, user=user).select_related('account').first()
    if tx is None:
        return None
    if not BotDraft.objects.filter(user=user, status=BotDraft.SAVED, transaction_id=tx.id).exists():
        return None
    return tx


def _transfer_sibling(user, tx):
    mutation = tx.client_mutation_id or ''
    if not mutation or tx.category != 'Bank Transfer':
        return None
    other = mutation[:-3] if mutation.endswith(':in') else f'{mutation}:in'
    return Transaction.objects.filter(user=user, client_mutation_id=other).select_related('account').first()


def _remove_pair(user, tx):
    ids = [tx.id]
    if tx.people_pair_id:
        ids = list(
            Transaction.objects.filter(user=user, people_pair_id=tx.people_pair_id).values_list('id', flat=True)
        )
    else:
        sibling = _transfer_sibling(user, tx)
        if sibling:
            ids.append(sibling.id)
    Transaction.objects.filter(user=user, pk__in=ids).delete()


def _ready(reply, warning=None, **fields) -> dict:
    action = {
        'action': fields.pop('action'),
        'amount': None,
        'account_id': None,
        'linked_project_id': None,
        'category': '',
        'notes': '',
        'date': None,
        'confidence': 'high',
        'ask': None,
        'summary': '',
    }
    action.update(fields)
    result = {'reply': reply, 'action': action, 'saved': False}
    if warning:
        result['warning'] = warning
    return result


def _no(reply) -> dict:
    result = _refuse()
    result['reply'] = reply
    return result


def _save_reply(summary: str) -> str:
    return f'{summary} Looks right from here. Save it?'


def _shown(amount) -> str:
    amount = Decimal(amount).quantize(Decimal('0.01'))
    if amount == amount.to_integral():
        return f'Rs {int(amount):,}'
    return f'Rs {amount:,.2f}'


def _safe_bit(value, limit=80) -> str:
    text = ' '.join(str(value or '').split())
    if not text or _SQL_RE.search(text) or _SECRET_RE.search(text):
        return ''
    return text[:limit]


def _grab_amount(text: str):
    match = _AMOUNT_RE.search(text or '')
    if not match:
        return None
    number = match.group(1).replace(',', '')
    if match.group(2):
        return str(int(Decimal(number) * 1000))
    if re.fullmatch(r'\d+\.\d{3}', number):
        return number.replace('.', '')
    return number


def _named(text: str, rows: list) -> list:
    lowered = text or ''
    found = []
    for row in rows:
        name = str(row.get('name') or '').strip()
        if len(name) < 2:
            continue
        if re.search(rf'(?<![a-z0-9]){re.escape(name.lower())}(?![a-z0-9])', lowered.lower()):
            found.append(row)
    if len(found) < 2:
        return found
    found.sort(key=lambda row: len(row['name']), reverse=True)
    winner = found[0]['name'].lower()
    extras = [row for row in found[1:] if row['name'].lower() not in winner]
    if extras:
        return found
    return [found[0]]


def _explicit_wallet(text: str, wallets: list):
    match = _PLACE_RE.search(text or '')
    if not match:
        return None
    hits = _named(match.group(1), wallets)
    if len(hits) == 1:
        return hits[0]
    return None


def _called(text: str) -> str:
    match = _CALLED_RE.search(text or '')
    if not match:
        return ''
    chunk = re.split(r'\b(?:with|for|from|please)\b', match.group(1), maxsplit=1, flags=re.I)[0]
    chunk = _AMOUNT_RE.sub(' ', chunk)
    return ' '.join(chunk.strip(' "\',.-').split())[:100]


def _income_name(chunk: str) -> str:
    text = _AMOUNT_RE.sub(' ', chunk or '')
    text = re.sub(r'\b(?:recurring|monthly|one[- ]time|contract|source)\b', ' ', text, flags=re.I)
    text = re.sub(r'^(?:of|for)\s+', '', text.strip(), flags=re.I)
    text = re.sub(r'\s+(?:of|for)$', '', text.strip(), flags=re.I)
    return ' '.join(text.split())[:150]


def _wallet_type(text: str) -> str:
    if re.search(r'\bperson\b', text or '', re.I):
        return 'person'
    if re.search(r'\b(?:card|credit)\b', text or '', re.I):
        return 'credit_card'
    if re.search(r'\bcash\b', text or '', re.I):
        return 'cash'
    return 'bank'


def _which_bill(bills: list) -> str:
    if not bills:
        return 'You do not have a bill set up yet.'
    names = ', '.join(row['name'] for row in bills[:6])
    return f'Which bill — {names}?'
