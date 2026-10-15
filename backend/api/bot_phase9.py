"""Phase 9 assistant tasks for Trai.

A theme and the amount eye stay on the device. A budget, Travel Mode, or bill
reminder uses the API that screen already uses, and only after confirm.
An unknown color, page, or currency is a question. A PIN is never stored.
"""

import re
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .bot_actions import _amount, _ask, _refuse, match_known_category
from .budgets_api import MONTH_NAMES, _money, _spent_by_category
from .fx import TRAVEL_CURRENCIES, get_fx_quote
from .models import CategoryBudget, NotificationPreference, RecurringExpense, TravelMode

THEMES = {
    'emerald': 'forest',
    'forest': 'forest',
    'green': 'forest',
    'ocean': 'ocean',
    'blue': 'ocean',
    'violet': 'slate',
    'purple': 'slate',
    'slate': 'slate',
    'rose': 'blush',
    'pink': 'blush',
    'blush': 'blush',
    'amber': 'clay',
    'orange': 'clay',
    'clay': 'clay',
}
THEME_LABEL = {
    'forest': 'Emerald',
    'ocean': 'Ocean',
    'slate': 'Violet',
    'blush': 'Rose',
    'clay': 'Amber',
}
PAGES = {
    'home': 'home',
    'dashboard': 'home',
    'wallets': 'wallets',
    'wallet': 'wallets',
    'accounts': 'wallets',
    'budgets': 'budgets',
    'budget': 'budgets',
    'bills': 'bills',
    'expenses': 'bills',
    'reports': 'reports',
    'report': 'reports',
    'settings': 'settings',
    'travel': 'travel',
    'travel mode': 'travel',
}
CURRENCY_WORDS = {
    'aed': 'AED',
    'dirham': 'AED',
    'dirhams': 'AED',
    'sar': 'SAR',
    'riyal': 'SAR',
    'riyals': 'SAR',
    'usd': 'USD',
    'dollar': 'USD',
    'dollars': 'USD',
    'eur': 'EUR',
    'euro': 'EUR',
    'euros': 'EUR',
    'gbp': 'GBP',
    'pound': 'GBP',
    'pounds': 'GBP',
    'try': 'TRY',
    'lira': 'TRY',
    'myr': 'MYR',
    'ringgit': 'MYR',
    'thb': 'THB',
    'baht': 'THB',
    'cny': 'CNY',
    'yuan': 'CNY',
    'qar': 'QAR',
    'omr': 'OMR',
    'bhd': 'BHD',
    'kwd': 'KWD',
    'inr': 'INR',
}
_THEME_INTENT = re.compile(r'\b(?:theme|colour|color|switch to|change to|make it|turn it)\b', re.I)
_COLORISH = re.compile(
    r'\b(?:gold|red|black|white|yellow|navy|teal|crimson|silver|grey|gray|brown|green|blue|pink|orange|purple|emerald|ocean|violet|rose|amber|forest|slate|blush|clay)\b',
    re.I,
)
_OPEN_RE = re.compile(r'\b(?:open|take me to|go to)\b', re.I)
_SIGNOUT_RE = re.compile(
    r'\b(?:log|sign)\s+(?:me\s+)?out\b|\blogout\b|\bsignout\b|\bdelete (?:my |the )?account\b',
    re.I,
)
_LOGIN_RE = re.compile(r'\b(?:password|email address)\b|\b(?:change|update|set) (?:my )?e-?mail\b', re.I)
_PIN_RE = re.compile(r'\bpin\b', re.I)
_REPORT_RE = re.compile(r'\b(?:email|share|send|export)\b.{0,40}\b(?:report|books|this)\b', re.I)
_HOUSEHOLD_RE = re.compile(r'\b(?:household|family ledger|shared expenses?)\b', re.I)
_SPEND_RE = re.compile(r'\b(?:spent|spend|paid|bought|expense|income|salary)\b', re.I)
_AMOUNT_RE = re.compile(
    r'\b(?:rs\.?|rp|pkr|rupees?)?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(k|thousand))?\b',
    re.I,
)
_SET_BUDGET_RE = re.compile(
    r'\b(?:set|change) (?:my |the )?(.+?) (?:budget )?to\b',
    re.I,
)


def phase9_question(text: str, catalog: dict) -> dict | None:
    """A phase 9 sentence Trai can route without the model. None leaves it for later."""
    if _SIGNOUT_RE.search(text):
        return {'action': 'refuse', 'reason': 'signout'}
    if _PIN_RE.search(text):
        return {'action': 'refuse', 'reason': 'pin'}
    if _LOGIN_RE.search(text):
        return {'action': 'refuse', 'reason': 'login'}
    if _REPORT_RE.search(text):
        return {'action': 'refuse', 'reason': 'report'}
    if _HOUSEHOLD_RE.search(text) and re.search(r'\b(?:open|budget|expense|shared)\b', text, re.I):
        return {'action': 'refuse', 'reason': 'household'}

    if re.search(r'\b(?:amounts?|numbers?|figures?)\b', text, re.I):
        if re.search(r'\b(?:hide|lock)\b', text, re.I):
            return {'action': 'hide_amounts'}
        if re.search(r'\b(?:show|reveal|unhide|unlock)\b', text, re.I):
            return {'action': 'show_amounts'}

    if _THEME_INTENT.search(text) and not (_SPEND_RE.search(text) and re.search(r'\d', text)):
        theme = _theme_in(text)
        if theme:
            return {'action': 'set_theme', 'theme': theme}
        if re.search(r'\b(?:theme|colour|color)\b', text, re.I) or _COLORISH.search(text):
            return {'action': 'ask', 'ask': _theme_ask()}

    if _OPEN_RE.search(text) and not re.search(r'\b(?:new|create|add|called|named)\b', text, re.I):
        if re.search(r'\b(?:balance|transaction|month)\b', text, re.I):
            return None
        page = _page_in(text)
        if page == 'household':
            return {'action': 'refuse', 'reason': 'household'}
        if page:
            return {'action': 'open_page', 'page': page}
        if re.search(r'\b(?:page|screen|tab)\b', text, re.I):
            return {'action': 'ask', 'ask': _page_ask()}

    if re.search(r'\bbudget\b', text, re.I) and re.search(r"\b(?!month\b)\w+'s\b", text or '', re.I):
        return {'action': 'refuse', 'reason': 'other'}

    if _SET_BUDGET_RE.search(text) and _AMOUNT_RE.search(text):
        raw = {'action': 'set_budget', 'category': _budget_name(text), 'amount': _grab_amount(text)}
        return _with_when(raw, text)

    if re.search(r'\b(?:am i over|over budget|budget status)\b', text, re.I) or (
        re.search(r'\bbudget\b', text, re.I) and re.search(r'\b(?:over|left|under)\b', text, re.I)
    ):
        if re.search(r"\b(?:someone else|another person|his budget|her budget|their budget)\b", text, re.I):
            return {'action': 'refuse', 'reason': 'other'}
        if re.search(r"\b(?!month\b)\w+'s\b", text or '', re.I):
            return {'action': 'refuse', 'reason': 'other'}
        return _with_when({'action': 'budget_status', 'category': _budget_name(text)}, text)

    if re.search(r'\btravel mode\b', text, re.I) or (
        re.search(r'\btravel\b', text, re.I) and re.search(r'\b(?:turn|switch|enable|disable)\b', text, re.I)
    ):
        if _SPEND_RE.search(text) and 'travel mode' not in text.lower():
            return None
        if re.search(r'\b(?:off|disable|stop)\b', text, re.I):
            return {'action': 'set_travel', 'enabled': False}
        return {'action': 'set_travel', 'enabled': True, 'travel_currency': _currency_in(text)}

    if re.search(r'\bremind', text, re.I):
        picked = _named(text, catalog.get('bills') or [])
        raw = {'action': 'set_reminder', 'remind': not bool(re.search(r"\b(?:stop|don't|do not|off)\b", text, re.I))}
        if len(picked) == 1:
            raw['bill_id'] = picked[0]['id']
        return raw
    return None


def normalize_phase9(raw, catalog, user=None, today=None) -> dict:
    today = today or timezone.localdate()
    if user is None:
        return _refuse()
    action = str(raw.get('action') or '').strip()
    if action == 'set_theme':
        theme = _theme_in(str(raw.get('theme') or '')) or _theme_in(str(raw.get('notes') or ''))
        if theme is None or theme not in THEME_LABEL:
            return _ask(_theme_ask())
        label = THEME_LABEL[theme]
        return _ready(f'Switch the theme to {label}. Save it?', action='set_theme', theme=theme, theme_label=label, summary=f'Theme · {label}')
    if action == 'hide_amounts':
        return _ready('The numbers lock with the eye you already use. A PIN stays in that lock.', action='hide_amounts')
    if action == 'show_amounts':
        return _ready('I will open the lock. Say the PIN there, not to me.', action='show_amounts')
    if action == 'open_page':
        page = PAGES.get(_loose_page(raw.get('page')))
        if page is None:
            return _ask(_page_ask())
        return _ready(f'Opening {page}.', action='open_page', page=page)
    if action == 'budget_status':
        return _status(raw, catalog, user, today)
    if action == 'set_budget':
        return _budget(raw, catalog, today)
    if action == 'set_travel':
        return _travel(raw, user)
    if action == 'set_reminder':
        return _reminder(raw, user)
    return _refuse()


def execute_phase9(user, action, request):
    """Apply a confirmed assistant change. Theme and the eye are not written here."""
    name = action.get('action')
    if name == 'set_theme':
        return None
    if name == 'set_budget':
        CategoryBudget.objects.update_or_create(
            user=user,
            year=int(action['year']),
            month=int(action['month']),
            category=action['category'],
            defaults={'limit_amount': Decimal(str(action['amount']))},
        )
        return None
    if name == 'set_travel':
        _apply_travel(user, action)
        return None
    if name == 'set_reminder':
        bill = RecurringExpense.objects.filter(user=user, pk=action.get('bill_id'), active=True).first()
        if bill is None:
            raise ValidationError('That bill is not on your list.')
        bill.remind = bool(action.get('remind'))
        bill.save(update_fields=['remind'])
        if bill.remind:
            pref, _ = NotificationPreference.objects.get_or_create(user=user)
            pref.enabled = True
            pref.lead_due = True
            pref.save(update_fields=['enabled', 'lead_due'])
        return None
    return None


def phase9_refusal(reason: str) -> dict:
    if reason == 'pin':
        return _no('I will not take a PIN. The lock you already use is the only place for it.')
    if reason == 'signout':
        return _no('I will not sign you out or close the account.')
    if reason == 'login':
        return _no('I will not change a login.')
    if reason == 'report':
        return _no('I will not email or share a report.')
    if reason == 'other':
        return _no('Another person\'s budget is not mine to read.')
    return _refuse()


def _status(raw, catalog, user, today):
    if re.search(r"\b(?:someone else|another person)\b", str(raw.get('category') or ''), re.I):
        return phase9_refusal('other')
    category = _known_budget_category(raw.get('category'), catalog)
    if category is None:
        return _ask('Which budget? Food, rent, fuel, or another category you already have.')
    year, month = _stored_period(raw, today)
    spent_map = _spent_by_category(user, year, month)
    if category == CategoryBudget.ALL_CATEGORY:
        spent = _money(sum(spent_map.values(), Decimal('0')))
        label = 'Overall'
    else:
        spent = _money(spent_map.get(category, 0))
        label = category
    row = CategoryBudget.objects.filter(user=user, year=year, month=month, category=category).first()
    limit = _money(row.limit_amount) if row else None
    month_label = f'{MONTH_NAMES[month]} {year}'
    if limit is None:
        reply = f'There is no {label} limit for {month_label}, so I cannot say you are over.'
        items = [{'label': 'Spent', 'amount': str(spent), 'detail': month_label}]
    else:
        over = spent > limit
        gap = abs(spent - limit)
        reply = (
            f'{label} is over for {month_label}. Spent {spent} of a {limit} limit.'
            if over else
            f'{label} is inside the limit for {month_label}. Spent {spent} of {limit}.'
        )
        items = [
            {'label': 'Spent', 'amount': str(spent)},
            {'label': 'Limit', 'amount': str(limit)},
            {'label': 'Over' if over else 'Left', 'amount': str(gap)},
        ]
    return _ready(reply, action='budget_status', category=label, amount=str(spent), month_label=month_label, items=items)


def _budget(raw, catalog, today):
    category = CategoryBudget.ALL_CATEGORY if _overall(str(raw.get('category') or '')) else _known_budget_category(raw.get('category'), catalog)
    if category is None:
        return _ask('Which category should get that limit? I will only use one you already have.')
    amount = _amount(raw.get('amount'))
    if amount is None or amount <= 0:
        return _ask('How much is the limit? I need a number, and I will not invent one.')
    year, month = _stored_period(raw, today)
    label = 'Overall' if category == CategoryBudget.ALL_CATEGORY else category
    summary = f'{label} budget · Rs {amount} · {MONTH_NAMES[month]}'
    return _ready(
        f'Set the {label} budget to Rs {amount} for {MONTH_NAMES[month]}. Save it?',
        action='set_budget',
        category=category,
        amount=str(amount),
        year=year,
        month=month,
        summary=summary,
    )


def _travel(raw, user):
    enabled = raw.get('enabled')
    if enabled is False or str(enabled).lower() in ('false', '0', 'off', 'no'):
        return _ready('Turn travel mode off. Save it?', action='set_travel', enabled=False, summary='Travel mode off')
    currency = _currency_in(str(raw.get('travel_currency') or '')) or _currency_in(str(raw.get('notes') or ''))
    if currency is None:
        return _ask('Which travel currency? Dirhams, riyals, dollars, or another one the trip screen already lists.')
    if currency not in TRAVEL_CURRENCIES:
        return _ask('That currency is not on the trip screen. Pick one it already lists.')
    from .currencies import user_home_currency
    home = user_home_currency(user)
    if currency == home:
        return _ask(f'{currency} is the home currency, so travel mode stays off. Which trip currency should I use?')
    try:
        quote = get_fx_quote(currency, home)
        rate = str(quote['rate'])
    except ValueError:
        return _ask('I could not read the rate Travel Mode already uses, so I will not guess one.')
    summary = f'Travel mode · {currency} · {rate} {home}'
    return _ready(
        f'Turn on travel mode in {currency} at {rate} {home} per 1 {currency}. Save it?',
        action='set_travel',
        enabled=True,
        travel_currency=currency,
        rate=rate,
        summary=summary,
    )


def _apply_travel(user, action):
    tm, _ = TravelMode.objects.get_or_create(user=user)
    if not action.get('enabled'):
        tm.enabled = False
        tm.save(update_fields=['enabled', 'updated_at'])
        return
    from .currencies import user_home_currency
    currency = str(action.get('travel_currency') or '').upper()
    if currency not in TRAVEL_CURRENCIES:
        raise ValidationError('That currency is not on the trip screen.')
    home = user_home_currency(user)
    try:
        quote = get_fx_quote(currency, home)
    except ValueError as exc:
        raise ValidationError('I could not read the rate Travel Mode already uses, so I left the trip alone.') from exc
    tm.enabled = True
    tm.travel_currency = currency
    tm.rate = Decimal(str(quote['rate']))
    tm.rate_source = 'cached' if quote.get('stale') else 'live'
    tm.rate_as_of = timezone.now()
    tm.start_date = tm.start_date or timezone.localdate()
    tm.save()


def _reminder(raw, user):
    bill_id = raw.get('bill_id')
    try:
        bill_id = int(bill_id)
    except (TypeError, ValueError):
        bill_id = None
    bill = RecurringExpense.objects.filter(user=user, pk=bill_id, active=True).first() if bill_id else None
    if bill is None:
        return _ask('Which bill should I remind you about? I only use bills you already have.')
    remind = raw.get('remind')
    if remind is False or str(remind).lower() in ('false', '0', 'off', 'no'):
        on = False
    else:
        on = True
    summary = f'{"Remind" if on else "Stop reminding"} · {bill.name}'
    reply = (
        f'Remind you the day {bill.name} is due. Save it?'
        if on else
        f'Stop the reminder for {bill.name}. Save it?'
    )
    return _ready(reply, action='set_reminder', bill_id=bill.id, remind=on, category=bill.name, summary=summary)


def _known_budget_category(raw, catalog):
    text = ' '.join(str(raw or '').replace('budget', ' ').split())
    if _overall(text):
        return CategoryBudget.ALL_CATEGORY
    found = match_known_category('expense', text, catalog)
    if found:
        return found
    allowed = list((catalog.get('categories') or {}).get('expense') or [])
    low = text.lower()
    hits = [name for name in allowed if name.lower() in low or low in name.lower()]
    if len(hits) == 1:
        return hits[0]
    return None


def _overall(text: str) -> bool:
    return bool(re.search(r'\b(?:overall|everything|whole month|total)\b', text or '', re.I))


def _with_when(raw, text):
    if re.search(r'\bnext month\b', text or '', re.I):
        raw['notes'] = 'next month'
    return raw


def _budget_name(text: str) -> str:
    match = _SET_BUDGET_RE.search(text or '')
    if match:
        return match.group(1).strip()
    cleaned = re.sub(r'\b(?:am i|over|my|the|budget|this month|next month|status|how is|how\'s|left|under)\b', ' ', text or '', flags=re.I)
    cleaned = re.sub(r'[?!.]', ' ', cleaned)
    return ' '.join(cleaned.split())


def _stored_period(raw, today):
    try:
        year = int(raw.get('year'))
        month = int(raw.get('month'))
    except (TypeError, ValueError):
        blob = ' '.join(str(raw.get(key) or '') for key in ('notes', 'category'))
        return _period(blob, today)
    if 2000 <= year <= 2100 and 1 <= month <= 12:
        return year, month
    return _period('', today)


def _period(text: str, today):
    if re.search(r'\bnext month\b', text or '', re.I):
        month = today.month + 1
        year = today.year + (1 if month == 13 else 0)
        return year, 1 if month == 13 else month
    return today.year, today.month


def _theme_in(text: str):
    low = (text or '').lower()
    for word, theme in THEMES.items():
        if re.search(rf'\b{re.escape(word)}\b', low):
            return theme
    return None


def _page_in(text: str):
    low = (text or '').lower()
    if re.search(r'\b(?:household|family)\b', low):
        return 'household'
    if 'travel mode' in low or re.search(r'\btravel\b', low):
        return 'travel'
    for word, page in PAGES.items():
        if word == 'travel mode':
            continue
        if re.search(rf'\b{re.escape(word)}\b', low):
            return page
    return None


def _loose_page(value) -> str:
    return ' '.join(str(value or '').split()).lower()


def _currency_in(text: str):
    raw = ' '.join(str(text or '').split())
    if not raw:
        return None
    upper = raw.upper()
    if upper in TRAVEL_CURRENCIES:
        return upper
    low = raw.lower()
    for word, code in CURRENCY_WORDS.items():
        if re.search(rf'\b{re.escape(word)}\b', low):
            return code
    return None


def _grab_amount(text: str):
    match = None
    for match in _AMOUNT_RE.finditer(text or ''):
        pass
    if match is None:
        return None
    number = match.group(1).replace(',', '')
    suffix = (match.group(2) or '').lower()
    if suffix in ('k', 'thousand'):
        number = str(Decimal(number) * 1000)
    return number


def _named(text, rows):
    low = (text or '').lower()
    hits = []
    for row in rows:
        name = str(row.get('name') or '').strip()
        if name and name.lower() in low:
            hits.append(row)
    return hits


def _theme_ask() -> str:
    return 'Which theme? Emerald, Ocean, Violet, Rose, or Amber.'


def _page_ask() -> str:
    return 'Which screen? Home, wallets, budgets, bills, reports, settings, or travel.'


def _ready(reply, **fields) -> dict:
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
    return {'reply': reply, 'action': action, 'saved': False}


def _no(reply) -> dict:
    result = _refuse()
    result['reply'] = reply
    result['action']['action'] = 'refuse'
    return result
