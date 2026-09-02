"""
Personal monthly category budgets.

GET  /api/budgets/?year=&month=     → spent + limits for the month
PUT  /api/budgets/                 → upsert one limit
DELETE /api/budgets/{id}/          → clear a limit
POST /api/budgets/copy-from-previous/ → copy prior month's limits
"""
from __future__ import annotations

import calendar
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CategoryBudget, Transaction

MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

# Keep in sync with mobile/frontend EXPENSE_CATEGORIES keys.
EXPENSE_CATEGORY_KEYS = [
    'Personal',
    'Travel',
    'Grocery',
    'Fuel & Maintenance',
    'Food & Drink',
    'Transport',
    'Entertainment',
    'Bills & Utilities',
    'Rent',
    'Health',
    'Shopping',
    'Education',
    'Gifts',
    'Miscellaneous',
]

ALL_CATEGORY = CategoryBudget.ALL_CATEGORY


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _parse_period(request, *, required=False):
    """Return (year, month) from query/body. Defaults to today when not required."""
    from datetime import date
    today = date.today()
    raw_year = request.query_params.get('year') if hasattr(request, 'query_params') else None
    raw_month = request.query_params.get('month') if hasattr(request, 'query_params') else None
    if raw_year is None and isinstance(getattr(request, 'data', None), dict):
        raw_year = request.data.get('year')
        raw_month = request.data.get('month')
    if raw_year is None or raw_month is None:
        if required:
            return None, None, 'year and month are required.'
        return today.year, today.month, None
    try:
        year = int(raw_year)
        month = int(raw_month)
    except (TypeError, ValueError):
        return None, None, 'year and month must be integers.'
    if year < 2000 or year > 2100:
        return None, None, 'year out of range.'
    if month < 1 or month > 12:
        return None, None, 'month must be 1–12.'
    return year, month, None


def _spent_by_category(user, year: int, month: int) -> dict[str, Decimal]:
    qs = Transaction.objects.filter(
        user=user,
        type='expense',
        date__year=year,
        date__month=month,
    ).exclude(category='Bank Transfer').exclude(
        people_action__gt='',
    )
    rows = qs.values('category').annotate(total=Sum('amount'))
    out: dict[str, Decimal] = {}
    for row in rows:
        key = (row['category'] or '').strip() or 'Uncategorized'
        out[key] = _money(row['total'])
    return out


def _status_for(limit: Decimal | None, spent: Decimal) -> str:
    if limit is None:
        return 'unset'
    if limit <= 0:
        return 'unset'
    pct = float(spent / limit * 100) if limit else 0.0
    if pct > 100:
        return 'over'
    if pct > 80:
        return 'warning'
    return 'ok'


def _row(category: str, label: str, spent: Decimal, limit: Decimal | None, budget_id: int | None):
    has_limit = limit is not None and limit > 0
    remaining = None
    over = None
    percent = None
    if has_limit:
        remaining = float(max(_money(0), _money(limit) - spent))
        over = float(max(_money(0), spent - _money(limit)))
        percent = round(float(spent / limit * 100), 1) if limit else 0.0
    return {
        'id': budget_id,
        'category': category,
        'label': label,
        'limit': float(limit) if has_limit else None,
        'spent': float(spent),
        'remaining': remaining,
        'over': over,
        'percent': percent,
        'status': _status_for(limit if has_limit else None, spent),
        'has_limit': has_limit,
    }


def build_budget_payload(user, year: int, month: int) -> dict:
    spent_map = _spent_by_category(user, year, month)
    budgets = {
        b.category: b
        for b in CategoryBudget.objects.filter(user=user, year=year, month=month)
    }

    total_spent = _money(sum(spent_map.values(), Decimal('0')))
    all_budget = budgets.get(ALL_CATEGORY)
    total_limit = _money(all_budget.limit_amount) if all_budget else None

    # Prefer known categories; also include any custom/legacy categories with spend or a limit.
    known = set(EXPENSE_CATEGORY_KEYS)
    extras = sorted(
        (c for c in set(spent_map.keys()) | set(budgets.keys()) if c not in known and c != ALL_CATEGORY),
        key=lambda c: (-float(spent_map.get(c, 0)), c.lower()),
    )

    rows = []
    # Overall "All" row first
    rows.append(_row(
        ALL_CATEGORY,
        'All expenses',
        total_spent,
        total_limit,
        all_budget.id if all_budget else None,
    ))

    for key in EXPENSE_CATEGORY_KEYS + extras:
        b = budgets.get(key)
        spent = spent_map.get(key, Decimal('0.00'))
        limit = _money(b.limit_amount) if b else None
        rows.append(_row(key, key if key != ALL_CATEGORY else 'All expenses', spent, limit, b.id if b else None))

    # Sort body (skip All): over → warning → has_limit → spent desc → name
    head, body = rows[0], rows[1:]

    def sort_key(r):
        status_rank = {'over': 0, 'warning': 1, 'ok': 2, 'unset': 3}.get(r['status'], 9)
        return (
            status_rank,
            0 if r['has_limit'] else 1,
            -float(r['spent'] or 0),
            (r['label'] or '').lower(),
        )

    body.sort(key=sort_key)
    rows = [head] + body

    # Category limits total (excluding __all__) for summary when no overall cap
    category_limits_sum = _money(sum(
        (_money(budgets[c].limit_amount) for c in budgets if c != ALL_CATEGORY),
        Decimal('0'),
    ))
    summary_limit = float(total_limit) if total_limit is not None else (
        float(category_limits_sum) if category_limits_sum > 0 else None
    )

    return {
        'year': year,
        'month': month,
        'period_label': f'{MONTH_NAMES[month]} {year}',
        'currency': 'PKR',
        'total_spent': float(total_spent),
        'total_limit': summary_limit,
        'overall_limit': float(total_limit) if total_limit is not None else None,
        'category_limits_sum': float(category_limits_sum),
        'days_in_month': calendar.monthrange(year, month)[1],
        'rows': rows,
    }


class BudgetsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        year, month, err = _parse_period(request)
        if err:
            return Response({'detail': err}, status=400)
        return Response(build_budget_payload(request.user, year, month))

    def put(self, request):
        year, month, err = _parse_period(request, required=True)
        if err:
            return Response({'detail': err}, status=400)

        category = (request.data.get('category') or '').strip()
        if not category:
            return Response({'detail': 'category is required.'}, status=400)
        if len(category) > 100:
            return Response({'detail': 'category is too long.'}, status=400)

        raw_limit = request.data.get('limit_amount', request.data.get('limit'))
        if raw_limit is None or raw_limit == '' or raw_limit is False:
            # Clear limit
            deleted, _ = CategoryBudget.objects.filter(
                user=request.user, year=year, month=month, category=category,
            ).delete()
            payload = build_budget_payload(request.user, year, month)
            payload['cleared'] = deleted > 0
            return Response(payload)

        try:
            limit = _money(raw_limit)
        except Exception:
            return Response({'detail': 'limit_amount must be a number.'}, status=400)
        if limit <= 0:
            # Treat non-positive as clear
            CategoryBudget.objects.filter(
                user=request.user, year=year, month=month, category=category,
            ).delete()
            return Response(build_budget_payload(request.user, year, month))

        obj, _created = CategoryBudget.objects.update_or_create(
            user=request.user,
            year=year,
            month=month,
            category=category,
            defaults={'limit_amount': limit},
        )
        payload = build_budget_payload(request.user, year, month)
        payload['budget_id'] = obj.id
        return Response(payload)


class BudgetDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk: int):
        deleted, _ = CategoryBudget.objects.filter(user=request.user, pk=pk).delete()
        if not deleted:
            return Response({'detail': 'Not found.'}, status=404)
        # Prefer year/month from query so UI can refresh the right period
        year, month, err = _parse_period(request)
        if err:
            return Response({'detail': 'Cleared.', 'id': pk}, status=200)
        return Response(build_budget_payload(request.user, year, month))


class BudgetCopyPreviousView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        year, month, err = _parse_period(request, required=True)
        if err:
            return Response({'detail': err}, status=400)

        if month == 1:
            prev_year, prev_month = year - 1, 12
        else:
            prev_year, prev_month = year, month - 1

        previous = list(CategoryBudget.objects.filter(
            user=request.user, year=prev_year, month=prev_month,
        ))
        if not previous:
            return Response(
                {'detail': 'No budgets found for the previous month.', 'copied': 0},
                status=400,
            )

        copied = 0
        for b in previous:
            _, created = CategoryBudget.objects.update_or_create(
                user=request.user,
                year=year,
                month=month,
                category=b.category,
                defaults={'limit_amount': b.limit_amount},
            )
            copied += 1
        payload = build_budget_payload(request.user, year, month)
        payload['copied'] = copied
        payload['from_year'] = prev_year
        payload['from_month'] = prev_month
        return Response(payload, status=status.HTTP_200_OK)
