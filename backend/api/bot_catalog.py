"""This user's wallets, income sources, and categories for Trai.

The dict is the only book data a model is allowed to see. It has no passwords,
no login ids, and no rows that belong to anyone else.
"""

from decimal import Decimal

from .models import Account, Project, UserCategory

EXPENSE_CATEGORIES = (
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
)

INCOME_CATEGORIES = (
    'Salary',
    'Freelance',
    'Business',
    'Monthly Income',
    'Gifts',
    'Other',
)

# Keys that must never appear anywhere in a catalog payload.
FORBIDDEN_CATALOG_KEYS = frozenset({
    'password',
    'google_sub',
    'email',
    'token',
    'secret',
    'otp',
})


def _money(value) -> str:
    return f'{Decimal(value):.2f}'


def load_catalog(user) -> dict:
    wallets = list(
        Account.objects.filter(user=user)
        .exclude(type='person')
        .order_by('name', 'id')
    )
    wallet_ids = {wallet.id for wallet in wallets}
    sources = []
    for project in Project.objects.filter(user=user, status='active').order_by('name', 'id'):
        default_id = project.default_account_id
        if default_id not in wallet_ids:
            default_id = None
        monthly = project.income_type in ('recurring_monthly', 'contract_monthly')
        received = project.income_received_this_month() if monthly else 0.0
        amount = Decimal(project.amount)
        sources.append({
            'id': project.id,
            'name': project.name,
            'income_type': project.income_type,
            'amount': _money(amount),
            'default_account_id': default_id,
            'received_this_month': monthly and received + 0.01 >= float(amount),
        })

    expense_names = list(EXPENSE_CATEGORIES)
    income_names = list(INCOME_CATEGORIES)
    for row in UserCategory.objects.filter(user=user).order_by('name'):
        bucket = expense_names if row.kind == 'expense' else income_names
        if row.name not in bucket:
            bucket.append(row.name)

    return {
        'wallets': [
            {'id': wallet.id, 'name': wallet.name, 'type': wallet.type}
            for wallet in wallets
        ],
        'income_sources': sources,
        'categories': {
            'expense': expense_names,
            'income': income_names,
        },
    }


def catalog_key_set(value) -> set[str]:
    found = set()
    if isinstance(value, dict):
        for key, item in value.items():
            found.add(str(key))
            found.update(catalog_key_set(item))
    elif isinstance(value, list):
        for item in value:
            found.update(catalog_key_set(item))
    return found
