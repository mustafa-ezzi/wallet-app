"""Allowed home (books) currencies. Keep in sync with mobile/src/currency/homeCurrency.ts."""

ALLOWED_HOME_CURRENCIES = frozenset({
    'PKR', 'INR', 'AED', 'SAR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD',
    'TRY', 'MYR', 'QAR', 'OMR', 'BHD', 'KWD', 'CNY', 'THB',
})

DEFAULT_HOME_CURRENCY = 'PKR'


def normalize_home_currency(raw, default=DEFAULT_HOME_CURRENCY) -> str:
    code = str(raw or default).strip().upper()
    if not code:
        code = default
    if code not in ALLOWED_HOME_CURRENCIES:
        allowed = ', '.join(sorted(ALLOWED_HOME_CURRENCIES))
        raise ValueError(f'Unsupported currency. Choose one of: {allowed}')
    return code


def user_home_currency(user) -> str:
    try:
        profile = getattr(user, 'profile', None)
        return normalize_home_currency(getattr(profile, 'currency', None))
    except Exception:
        return DEFAULT_HOME_CURRENCY
