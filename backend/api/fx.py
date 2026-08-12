"""
FX quote helpers for Travel Mode (Phase A).

Returns quote units per 1 base unit (e.g. PKR per 1 AED).
Vendors are called only from the server — never from mobile/web clients.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta

from django.utils import timezone

from .models import FxRateCache

TRAVEL_CURRENCIES = frozenset({
    'AED', 'SAR', 'USD', 'EUR', 'GBP', 'TRY', 'MYR', 'THB',
    'CNY', 'QAR', 'OMR', 'BHD', 'KWD', 'INR',
})
HOME_CURRENCY = 'PKR'
CACHE_TTL = timedelta(hours=6)
REQUEST_TIMEOUT_SEC = 8


def _quantize_rate(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)


def _quantize_money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def convert_to_pkr(foreign_amount, rate) -> Decimal:
    """PKR = round(foreign * rate, 2)."""
    return _quantize_money(Decimal(str(foreign_amount)) * Decimal(str(rate)))


def validate_rate(rate) -> Decimal:
    r = Decimal(str(rate))
    if r <= 0:
        raise ValueError('Rate must be greater than zero.')
    if r > Decimal('100000'):
        raise ValueError('Rate looks unrealistic.')
    return _quantize_rate(r)


def _http_json(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'CashTrail/1.0', 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SEC) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _fetch_open_er_api(base: str, quote: str) -> tuple[Decimal, str]:
    data = _http_json(f'https://open.er-api.com/v6/latest/{base}')
    if str(data.get('result', '')).lower() not in ('success', ''):
        # Some responses use result=success; tolerate missing if rates present
        if 'rates' not in data:
            raise ValueError(f'open.er-api error: {data.get("error-type") or data}')
    rates = data.get('rates') or {}
    if quote not in rates:
        raise ValueError(f'open.er-api missing {quote} for {base}')
    return _quantize_rate(rates[quote]), 'open.er-api.com'


def _fetch_frankfurter(base: str, quote: str) -> tuple[Decimal, str]:
    # Frankfurter does not support every currency; fine as fallback
    data = _http_json(f'https://api.frankfurter.app/latest?from={base}&to={quote}')
    rates = data.get('rates') or {}
    if quote not in rates:
        raise ValueError(f'frankfurter missing {quote} for {base}')
    return _quantize_rate(rates[quote]), 'frankfurter.app'


def _upsert_cache(base: str, quote: str, rate: Decimal, source: str) -> FxRateCache:
    now = timezone.now()
    row, _ = FxRateCache.objects.update_or_create(
        base=base,
        quote=quote,
        defaults={'rate': rate, 'source': source, 'fetched_at': now},
    )
    return row


def get_fx_quote(base: str, quote: str = HOME_CURRENCY, force_refresh: bool = False) -> dict:
    """
    Return { base, quote, rate, as_of, source, stale }.
    Uses cache if younger than 6h unless force_refresh.
    """
    base = (base or '').strip().upper()
    quote = (quote or HOME_CURRENCY).strip().upper()

    if not base or not quote:
        raise ValueError('base and quote are required.')
    if base == quote:
        return {
            'base': base,
            'quote': quote,
            'rate': '1.000000',
            'as_of': timezone.now().isoformat(),
            'source': 'identity',
            'stale': False,
        }
    if quote != HOME_CURRENCY:
        raise ValueError(f'Only {HOME_CURRENCY} quote is supported in v1.')
    if base == HOME_CURRENCY:
        raise ValueError('Travel Mode is off when base is PKR.')
    if base not in TRAVEL_CURRENCIES:
        raise ValueError(f'Unsupported travel currency: {base}')

    cached = FxRateCache.objects.filter(base=base, quote=quote).first()
    now = timezone.now()
    if (
        cached
        and not force_refresh
        and cached.fetched_at
        and (now - cached.fetched_at) < CACHE_TTL
    ):
        return {
            'base': base,
            'quote': quote,
            'rate': str(cached.rate),
            'as_of': cached.fetched_at.isoformat(),
            'source': cached.source or 'cached',
            'stale': False,
        }

    errors: list[str] = []
    for fetcher in (_fetch_open_er_api, _fetch_frankfurter):
        try:
            rate, source = fetcher(base, quote)
            row = _upsert_cache(base, quote, rate, source)
            return {
                'base': base,
                'quote': quote,
                'rate': str(row.rate),
                'as_of': row.fetched_at.isoformat(),
                'source': source,
                'stale': False,
            }
        except Exception as exc:  # noqa: BLE001 — try next vendor / cache
            label = getattr(fetcher, '__name__', type(fetcher).__name__)
            errors.append(f'{label}: {exc}')

    if cached:
        return {
            'base': base,
            'quote': quote,
            'rate': str(cached.rate),
            'as_of': cached.fetched_at.isoformat() if cached.fetched_at else now.isoformat(),
            'source': cached.source or 'cached',
            'stale': True,
            'warning': 'Live FX unavailable; returning last cached rate.',
            'errors': errors[:3],
        }

    raise ValueError(
        'Could not fetch exchange rate and no cache is available. Enter a rate manually. '
        + ('; '.join(errors[:2]) if errors else '')
    )
