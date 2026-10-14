"""Month questions for Trai. The model names the question. Django adds the numbers.

Totals use the same rows as the home screen: this user only, no Bank Transfer,
no people double-entry. A read never creates a draft.
"""

import calendar
import re
from datetime import date, datetime
from decimal import Decimal

from django.db.models import Sum

from .bot_actions import action_is_unsafe, match_expense_category, normalize_action
from .models import Account, Transaction

READ_ACTIONS = frozenset({'month_summary', 'category_spent'})


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
