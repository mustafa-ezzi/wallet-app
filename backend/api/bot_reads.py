"""Month questions for Trai. The model names the question. Django adds the numbers.

Totals use the same rows as the home screen: this user only, no Bank Transfer,
no people double-entry. A read never creates a draft.
"""

import calendar
import re
from datetime import date, datetime
from decimal import Decimal

from django.db.models import Sum

from .bot_actions import EXPENSE_ALIASES, action_is_unsafe, match_expense_category, normalize_action
from .models import Account, Transaction

READ_ACTIONS = frozenset({'month_summary', 'category_spent', 'recent_transaction', 'balance'})

_RECENT_RE = re.compile(
    r"\b(?:what(?:'s| was| is)|show|tell me)\b.{0,40}\b(?:recent|latest|last)\b.{0,24}\b(?:transaction|expense|income|entry)s?\b"
    r'|\b(?:recent|latest|last)\b.{0,24}\b(?:transaction|expense|income|entry)s?\b'
    r'|\bmy transactions\b'
    r'|\bwhat did i (?:just|last) (?:buy|spend|pay)\b',
    re.I,
)
_MONTH_RE = re.compile(
    r"\b(?:how was my month|how is my month|how's my month|how did (?:my|this) month|this month(?:'s)? summary|month summary)\b",
    re.I,
)
_SPEND_RE = re.compile(
    r'\b(?:how much (?:did i |have i |i )?(?:spend|spent)|spent on|spend on|spending on|monthly spend)\b',
    re.I,
)
_BALANCE_RE = re.compile(
    r"\b(?:my balance|what(?:'s| is) my balance|how much do i have|how much have i got|how much is (?:left|in|on)|wallet balances?|account balances?)\b",
    re.I,
)


def month_totals(user, today=None) -> dict:
    """Income, expense, and net for the month containing today. Same filter as DashboardView."""
    today = today or date.today()
    start, end = _month_bounds(today.year, today.month)
    income = _personal_total(user, 'income', start, end)
    expense = _personal_total(user, 'expense', start, end)
    return {
        'month': f'{start.year:04d}-{start.month:02d}',
        'month_income': income,
        'month_expense': expense,
        'month_net': income - expense,
    }


def regular_question(text: str, catalog: dict) -> dict | None:
    """A lookup Trai can answer without the model. A new entry still goes to the model."""
    if _looks_like_new_entry(text):
        return None
    if _RECENT_RE.search(text):
        kind = ''
        if re.search(r'\b(?:expenses?|spend|spent|buy|bought|paid)\b', text, re.I) and not re.search(r'\bincomes?\b', text, re.I):
            kind = 'expense'
        elif re.search(r'\bincomes?\b', text, re.I):
            kind = 'income'
        return {'action': 'recent_transaction', 'category': kind}
    if _MONTH_RE.search(text):
        return {'action': 'month_summary'}
    if _SPEND_RE.search(text):
        category = _category_in_text(text, catalog)
        if category:
            return {'action': 'category_spent', 'category': category}
        return None
    if _BALANCE_RE.search(text):
        return {'action': 'balance'}
    return None


def resolve_read(user, raw, catalog, text='', today=None) -> dict:
    today = today or date.today()
    if not isinstance(raw, dict) or action_is_unsafe(raw) or _names_person(user, text):
        return normalize_action({'action': 'refuse'}, catalog)
    action = str(raw.get('action') or '').strip()
    year, month = _month_from(raw.get('month'), today)
    if action == 'month_summary':
        return _summary(user, year, month, today)
    if action == 'category_spent':
        return _category(user, raw.get('category'), catalog, year, month, today)
    if action == 'recent_transaction':
        kind = str(raw.get('category') or '').strip().lower()
        return _recent(user, kind if kind in ('expense', 'income') else '')
    if action == 'balance':
        return _balance(user, text, raw.get('account_id'))
    return normalize_action({'action': 'refuse'}, catalog)


def _summary(user, year: int, month: int, today: date) -> dict:
    start, end = _month_bounds(year, month)
    totals = month_totals(user, date(year, month, 1))
    income = _rupees(totals['month_income'])
    expense = _rupees(totals['month_expense'])
    net = totals['month_net']
    label = date(year, month, 1).strftime('%B %Y')
    spent = _top_categories(user, start, end)
    count = _expense_count(user, start, end)
    if totals['month_income'] == 0 and totals['month_expense'] == 0:
        reply = f'{label} is still empty. Nothing came in and nothing went out.'
    elif net >= 0:
        reply = (
            f'{label} left you {_rupees(net)}. '
            f'You received {income} and spent {expense}. The month behaved.'
        )
    else:
        reply = (
            f'{label} ran {_rupees(abs(net))} over. '
            f'You received {income} and spent {expense}. The month got a little ambitious.'
        )
    return _read_body(reply, {
        'action': 'month_summary',
        'amount': None,
        'category': '',
        'month': totals['month'],
        'month_label': label,
        'expense_count': count,
        'top_categories': spent,
        'month_income': f'{totals["month_income"]:.2f}',
        'month_expense': f'{totals["month_expense"]:.2f}',
        'month_net': f'{totals["month_net"]:.2f}',
    })


def _category(user, raw_category, catalog, year: int, month: int, today: date) -> dict:
    category = match_expense_category(raw_category, catalog)
    if category is None:
        return normalize_action({'action': 'ask', 'ask': 'Which category? Food, fuel, rent, or a surprise?'}, catalog)
    start, end = _month_bounds(year, month)
    total = _personal_total(user, 'expense', start, end, category=category)
    title = _month_title(year, month, today)
    when = 'this month' if title == 'This month' else f'in {title}'
    reply = f'{category} {when}: {_rupees(total)}. I counted twice so nothing can sneak past.'
    return _read_body(reply, {
        'action': 'category_spent',
        'amount': f'{total:.2f}',
        'category': category,
        'month': f'{year:04d}-{month:02d}',
        'month_income': None,
        'month_expense': None,
        'month_net': None,
    })


def _looks_like_new_entry(text: str) -> bool:
    if re.search(r'\b(?:rp|rs\.?|rupees?|pkr|\d+\s*k|thousand)\b', text, re.I):
        return True
    return any(int(number) >= 20 for number in re.findall(r'\d+', text))


def _category_in_text(text: str, catalog: dict) -> str | None:
    lowered = text.lower()
    allowed = list((catalog.get('categories') or {}).get('expense') or [])
    needles = [(alias, name) for alias, name in EXPENSE_ALIASES.items()]
    needles.extend((name.lower(), name) for name in allowed)
    needles.sort(key=lambda item: len(item[0]), reverse=True)
    for needle, name in needles:
        if name not in allowed:
            continue
        if re.search(rf'\b{re.escape(needle)}\b', lowered):
            return name
    return None


def _recent(user, kind: str) -> dict:
    rows = Transaction.objects.filter(user=user).exclude(account__type='person').select_related('account')
    if kind in ('expense', 'income'):
        rows = rows.filter(type=kind)
    found = list(rows[:3])
    if not found:
        noun = {'expense': 'expense', 'income': 'income'}.get(kind, 'transaction')
        reply = f'You do not have a {noun} yet. A sentence like “chips, Rp 50, cash” is enough to start.'
        return _read_body(reply, {'action': 'recent_transaction', 'items': [], 'month_label': 'Latest'})
    items = [_recent_item(row) for row in found]
    first = found[0]
    return _read_body(_recent_reply(first), {
        'action': 'recent_transaction',
        'amount': f'{Decimal(first.amount).quantize(Decimal("0.01")):.2f}',
        'category': first.category or '',
        'notes': ' '.join(str(first.notes or '').split())[:120],
        'date': first.date.isoformat(),
        'account_id': first.account_id,
        'month_label': 'Latest',
        'items': items,
    })


def _recent_item(row) -> dict:
    label = ' '.join(str(row.notes or '').split()) or (row.category or '').strip() or row.get_type_display()
    return {
        'label': label[:80],
        'amount': f'{Decimal(row.amount).quantize(Decimal("0.01")):.2f}',
        'detail': f'{row.account.name} · {row.date.strftime("%d %b %Y")}',
    }


def _recent_reply(row) -> str:
    amount = _rupees(Decimal(row.amount))
    when = row.date.strftime('%d %b %Y')
    what = ' '.join(str(row.notes or '').split()) or (row.category or '').strip() or 'something'
    wallet = row.account.name
    if row.type == 'income':
        return f'Your latest transaction was {amount} in, {what}, into {wallet}, on {when}.'
    return f'Your latest transaction was {amount} for {what}, from {wallet}, on {when}.'


def _balance(user, text: str, account_id) -> dict:
    named = _account_for_balance(user, text, account_id)
    if named is not None:
        bal = Decimal(str(named.current_balance)).quantize(Decimal('0.01'))
        return _read_body(f'{named.name} has {_rupees(bal)}.', {
            'action': 'balance',
            'amount': f'{bal:.2f}',
            'account_id': named.id,
            'month_label': named.name,
            'items': [{'label': named.name, 'amount': f'{bal:.2f}', 'detail': ''}],
        })
    wallets = list(Account.objects.filter(user=user).exclude(type='person'))
    total = Decimal('0.00')
    debt = Decimal('0.00')
    items = []
    for account in wallets:
        bal = Decimal(str(account.current_balance)).quantize(Decimal('0.01'))
        if account.type == 'credit_card':
            if bal > 0:
                debt += bal
            continue
        total += bal
        items.append({'label': account.name, 'amount': f'{bal:.2f}', 'detail': ''})
    if not wallets:
        reply = 'You do not have a wallet yet.'
    elif debt > 0:
        reply = f'You have {_rupees(total)} in bank and cash. Cards are carrying {_rupees(debt)}.'
    else:
        reply = f'You have {_rupees(total)} in bank and cash.'
    head = {'label': 'Bank and cash', 'amount': f'{total:.2f}', 'detail': ''}
    return _read_body(reply, {
        'action': 'balance',
        'amount': f'{total:.2f}',
        'month_label': 'Balance',
        'items': [head, *items],
    })


def _account_for_balance(user, text: str, account_id):
    wallets = list(Account.objects.filter(user=user).exclude(type='person'))
    if account_id not in (None, ''):
        try:
            wanted = int(account_id)
        except (TypeError, ValueError):
            wanted = None
        for account in wallets:
            if account.id == wanted:
                return account
    lowered = text.lower()
    for account in sorted(wallets, key=lambda row: len(row.name), reverse=True):
        if re.search(rf'\b{re.escape(account.name.lower())}\b', lowered):
            return account
    return None


def _read_body(reply: str, action: dict) -> dict:
    action.setdefault('account_id', None)
    action.setdefault('linked_project_id', None)
    action.setdefault('notes', '')
    action.setdefault('date', None)
    action.setdefault('confidence', None)
    action.setdefault('ask', None)
    return {'reply': reply, 'action': action, 'saved': False, 'warning': None}


def _top_categories(user, start: date, end: date, limit: int = 3) -> list:
    rows = (
        Transaction.objects.filter(
            user=user,
            type='expense',
            date__gte=start,
            date__lte=end,
        )
        .exclude(category='Bank Transfer')
        .exclude(people_action__gt='')
        .values('category')
        .annotate(total=Sum('amount'))
        .order_by('-total')[:limit]
    )
    found = []
    for row in rows:
        total = Decimal(row['total'] or 0).quantize(Decimal('0.01'))
        if total <= 0:
            continue
        found.append({
            'category': (row['category'] or '').strip() or 'Uncategorized',
            'amount': f'{total:.2f}',
        })
    return found


def _expense_count(user, start: date, end: date) -> int:
    return (
        Transaction.objects.filter(
            user=user,
            type='expense',
            date__gte=start,
            date__lte=end,
        )
        .exclude(category='Bank Transfer')
        .exclude(people_action__gt='')
        .count()
    )


def _personal_total(user, kind: str, start: date, end: date, category: str | None = None) -> Decimal:
    rows = Transaction.objects.filter(
        user=user,
        type=kind,
        date__gte=start,
        date__lte=end,
    ).exclude(category='Bank Transfer').exclude(people_action__gt='')
    if category is not None:
        rows = rows.filter(category=category)
    total = rows.aggregate(total=Sum('amount'))['total'] or 0
    return Decimal(total).quantize(Decimal('0.01'))


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year, month, calendar.monthrange(year, month)[1])
    return start, end


def _month_from(value, today: date) -> tuple[int, int]:
    text = str(value or '').strip()
    if not text:
        return today.year, today.month
    try:
        parsed = datetime.strptime(text[:7], '%Y-%m')
    except ValueError:
        return today.year, today.month
    if parsed.year < 2000 or parsed.year > 2100:
        return today.year, today.month
    return parsed.year, parsed.month


def _month_title(year: int, month: int, today: date) -> str:
    if year == today.year and month == today.month:
        return 'This month'
    return date(year, month, 1).strftime('%B %Y')


def _rupees(amount: Decimal) -> str:
    amount = Decimal(amount).quantize(Decimal('0.01'))
    if amount == amount.to_integral():
        return f'Rs {int(amount):,}'
    return f'Rs {amount:,.2f}'


def _names_person(user, text: str) -> bool:
    lowered = text.lower()
    names = Account.objects.filter(user=user, type='person').values_list('name', flat=True)
    for name in names:
        cleaned = ' '.join(str(name or '').split()).lower()
        if cleaned and re.search(rf'\b{re.escape(cleaned)}\b', lowered):
            return True
    return False
