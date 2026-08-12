"""
Travel Mode + People APIs (Phase A — data only, no mobile UI).
"""
from __future__ import annotations

import calendar
import uuid
from datetime import date
from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .fx import (
    HOME_CURRENCY,
    TRAVEL_CURRENCIES,
    convert_to_pkr,
    get_fx_quote,
    validate_rate,
)
from .models import Account, Transaction, TravelMode
from .serializers import AccountSerializer, TransactionSerializer


# ── Serializers ───────────────────────────────────────────────────────────────

class TravelModeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TravelMode
        fields = (
            'enabled', 'travel_currency', 'rate', 'rate_as_of', 'rate_source',
            'start_date', 'end_date', 'updated_at', 'created_at',
        )
        read_only_fields = ('rate_as_of', 'updated_at', 'created_at')


class TravelModeSetSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    travel_currency = serializers.CharField(required=False, allow_blank=True, max_length=10)
    rate = serializers.DecimalField(max_digits=18, decimal_places=6, required=False, allow_null=True)
    rate_source = serializers.ChoiceField(
        choices=['live', 'manual', 'cached', 'offline'],
        required=False,
        default='manual',
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    use_live_rate = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get('enabled'):
            return attrs
        currency = (attrs.get('travel_currency') or '').strip().upper()
        if not currency:
            raise serializers.ValidationError({'travel_currency': 'Required when enabling Travel Mode.'})
        if currency == HOME_CURRENCY:
            raise serializers.ValidationError({'travel_currency': 'Home currency PKR means Travel Mode is off.'})
        if currency not in TRAVEL_CURRENCIES:
            raise serializers.ValidationError({
                'travel_currency': f'Unsupported currency. Choose one of: {", ".join(sorted(TRAVEL_CURRENCIES))}',
            })
        attrs['travel_currency'] = currency

        start = attrs.get('start_date')
        end = attrs.get('end_date')
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'End date must be on or after start date.'})

        use_live = attrs.get('use_live_rate')
        rate = attrs.get('rate')
        if use_live:
            try:
                quote = get_fx_quote(currency, HOME_CURRENCY)
            except ValueError as exc:
                raise serializers.ValidationError({'rate': str(exc)}) from exc
            attrs['rate'] = Decimal(quote['rate'])
            attrs['rate_source'] = 'cached' if quote.get('stale') else 'live'
            attrs['_rate_as_of'] = quote.get('as_of')
        else:
            if rate is None:
                raise serializers.ValidationError({
                    'rate': 'Provide a rate, or set use_live_rate=true.',
                })
            try:
                attrs['rate'] = validate_rate(rate)
            except ValueError as exc:
                raise serializers.ValidationError({'rate': str(exc)}) from exc
            attrs['rate_source'] = attrs.get('rate_source') or 'manual'
        return attrs


PEOPLE_ACTION_LEGS = {
    # action: (wallet_type, person_type, wallet_note, person_note)
    'lend': ('expense', 'income', 'Money Lent', 'Money Lent'),
    'borrow': ('income', 'expense', 'Money Borrowed', 'Money Borrowed'),
    'pay': ('expense', 'income', 'Money Sent', 'Money Sent'),
    'receive': ('income', 'expense', 'Money Received', 'Money Received'),
}

MIRROR_PEOPLE_ACTION = {
    'lend': 'borrow',
    'borrow': 'lend',
    'pay': 'receive',
    'receive': 'pay',
}


def post_people_double_entry(
    *,
    user,
    action_name: str,
    wallet: Account,
    person: Account,
    amount: Decimal,
    tx_date=None,
    notes: str = '',
    pair_id: str | None = None,
    client_mutation_id: str | None = None,
    fx_kwargs: dict | None = None,
):
    """
    Create wallet + person legs for a people action.
    Returns (pair_id, wallet_tx, person_tx, created: bool).
    Idempotent on people_pair_id for this user.
    """
    tx_date = tx_date or date.today()
    pair_id = (pair_id or '').strip() or str(uuid.uuid4())
    fx_kwargs = fx_kwargs or {}

    existing = Transaction.objects.filter(user=user, people_pair_id=pair_id)
    if existing.exists():
        rows = list(existing.order_by('id'))
        wallet_tx = next((t for t in rows if t.account_id == wallet.id), rows[0])
        person_tx = next((t for t in rows if t.account_id == person.id), rows[-1])
        return pair_id, wallet_tx, person_tx, False

    wallet_type, person_type, wallet_cat, person_cat = PEOPLE_ACTION_LEGS[action_name]
    note_suffix = f' · {notes}' if notes else ''
    with db_transaction.atomic():
        wallet_tx = Transaction.objects.create(
            user=user,
            type=wallet_type,
            amount=amount,
            date=tx_date,
            account=wallet,
            category=f'People: {wallet_cat}',
            notes=f'{wallet_cat}: {wallet.name} ↔ {person.name}{note_suffix}',
            people_pair_id=pair_id,
            people_action=action_name,
            client_mutation_id=f'{client_mutation_id}:wallet' if client_mutation_id else None,
            **fx_kwargs,
        )
        person_tx = Transaction.objects.create(
            user=user,
            type=person_type,
            amount=amount,
            date=tx_date,
            account=person,
            category=f'People: {person_cat}',
            notes=f'{person_cat}: {wallet.name} ↔ {person.name}{note_suffix}',
            people_pair_id=pair_id,
            people_action=action_name,
            client_mutation_id=f'{client_mutation_id}:person' if client_mutation_id else None,
            **fx_kwargs,
        )
    return pair_id, wallet_tx, person_tx, True


class PeopleActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['lend', 'borrow', 'pay', 'receive'])
    wallet_id = serializers.IntegerField()
    person_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)  # PKR amount to post
    date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    # Optional travel snapshot (client already converted, or we convert here)
    original_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True,
    )
    original_currency = serializers.CharField(required=False, allow_blank=True, max_length=10)
    fx_rate = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True,
    )
    fx_source = serializers.ChoiceField(
        choices=['live', 'manual', 'cached', 'offline'],
        required=False,
        allow_blank=True,
        default='',
    )
    client_mutation_id = serializers.CharField(required=False, allow_blank=True, max_length=64)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return value

    def validate(self, attrs):
        request = self.context['request']
        user = request.user
        try:
            wallet = Account.objects.get(id=attrs['wallet_id'], user=user)
        except Account.DoesNotExist as exc:
            raise serializers.ValidationError({'wallet_id': 'Wallet not found.'}) from exc
        if wallet.type == 'person':
            raise serializers.ValidationError({'wallet_id': 'Must be a bank or cash wallet.'})

        try:
            person = Account.objects.get(id=attrs['person_id'], user=user, type='person')
        except Account.DoesNotExist as exc:
            raise serializers.ValidationError({'person_id': 'Person not found.'}) from exc

        attrs['wallet'] = wallet
        attrs['person'] = person

        orig = attrs.get('original_amount')
        rate = attrs.get('fx_rate')
        currency = (attrs.get('original_currency') or '').strip().upper()
        if orig is not None or rate is not None or currency:
            if orig is None or rate is None or not currency:
                raise serializers.ValidationError(
                    'original_amount, original_currency, and fx_rate must be set together.',
                )
            try:
                validate_rate(rate)
            except ValueError as exc:
                raise serializers.ValidationError({'fx_rate': str(exc)}) from exc
            attrs['original_currency'] = currency
            # Prefer server-side conversion if client sent foreign amount + rate
            attrs['amount'] = convert_to_pkr(orig, rate)
        return attrs


# ── Views ─────────────────────────────────────────────────────────────────────

class FxQuoteView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        base = request.query_params.get('base', '')
        quote = request.query_params.get('quote', HOME_CURRENCY)
        force = request.query_params.get('refresh', '').lower() in ('1', 'true', 'yes')
        try:
            data = get_fx_quote(base, quote, force_refresh=force)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(data)


class TravelModeView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_or_create(self, user) -> TravelMode:
        obj, _ = TravelMode.objects.get_or_create(user=user)
        return obj

    def get(self, request):
        tm = self._get_or_create(request.user)
        return Response(TravelModeSerializer(tm).data)

    def put(self, request):
        return self._set(request)

    def patch(self, request):
        return self._set(request)

    def _set(self, request):
        ser = TravelModeSetSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        tm = self._get_or_create(request.user)

        if not data['enabled']:
            tm.enabled = False
            tm.save(update_fields=['enabled', 'updated_at'])
            return Response(TravelModeSerializer(tm).data)

        tm.enabled = True
        tm.travel_currency = data['travel_currency']
        tm.rate = data['rate']
        tm.rate_source = data.get('rate_source') or 'manual'
        as_of_raw = data.get('_rate_as_of')
        if as_of_raw:
            try:
                from django.utils.dateparse import parse_datetime
                parsed = parse_datetime(as_of_raw)
                tm.rate_as_of = parsed or timezone.now()
            except Exception:
                tm.rate_as_of = timezone.now()
        else:
            tm.rate_as_of = timezone.now()
        tm.start_date = data.get('start_date') or tm.start_date or date.today()
        tm.end_date = data.get('end_date')
        tm.save()
        return Response(TravelModeSerializer(tm).data)


class PeopleViewSet(viewsets.ModelViewSet):
    """CRUD for person accounts + lend/borrow/pay/receive + month history."""

    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return Account.objects.filter(user=self.request.user, type='person')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, type='person', opening_balance=Decimal('0'))

    def perform_update(self, serializer):
        serializer.save(type='person')

    def destroy(self, request, *args, **kwargs):
        person = self.get_object()
        bal = Decimal(str(person.current_balance))
        if abs(bal) > Decimal('0.01'):
            return Response(
                {
                    'detail': 'Settle this person to zero before deleting.',
                    'balance': float(bal),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='actions')
    def actions(self, request):
        ser = PeopleActionSerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        user = request.user
        action_name = data['action']
        wallet = data['wallet']
        person = data['person']
        amount = data['amount']
        tx_date = data.get('date') or date.today()
        notes = (data.get('notes') or '').strip()
        pair_id = (data.get('client_mutation_id') or '').strip() or str(uuid.uuid4())
        client_mutation_id = (data.get('client_mutation_id') or '').strip() or None

        fx_kwargs = {}
        if data.get('original_amount') is not None:
            fx_kwargs = {
                'original_amount': data['original_amount'],
                'original_currency': data.get('original_currency') or '',
                'fx_rate': data.get('fx_rate'),
                'fx_source': data.get('fx_source') or '',
            }

        pair_id, wallet_tx, person_tx, created = post_people_double_entry(
            user=user,
            action_name=action_name,
            wallet=wallet,
            person=person,
            amount=amount,
            tx_date=tx_date,
            notes=notes,
            pair_id=pair_id,
            client_mutation_id=client_mutation_id,
            fx_kwargs=fx_kwargs,
        )
        wallet.refresh_from_db()
        person.refresh_from_db()
        return Response(
            {
                'people_pair_id': pair_id,
                'action': action_name,
                'transactions': TransactionSerializer([wallet_tx, person_tx], many=True).data,
                'wallet_balance': float(wallet.current_balance),
                'person_balance': float(person.current_balance),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'], url_path='history')
    def history(self, request, pk=None):
        person = self.get_object()
        today = date.today()
        try:
            year = int(request.query_params.get('year', today.year))
            month = int(request.query_params.get('month', today.month))
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid year/month.'}, status=status.HTTP_400_BAD_REQUEST)

        month_start = date(year, month, 1)
        last_day = calendar.monthrange(year, month)[1]
        month_end = date(year, month, last_day)

        # Opening = balance before month_start
        prior = person.transactions.filter(date__lt=month_start)
        prior_income = prior.filter(type='income').aggregate(t=Sum('amount'))['t'] or 0
        prior_expense = prior.filter(type='expense').aggregate(t=Sum('amount'))['t'] or 0
        opening = Decimal(str(person.opening_balance)) + Decimal(str(prior_income)) - Decimal(str(prior_expense))

        month_txs = person.transactions.filter(date__gte=month_start, date__lte=month_end)
        inflow = month_txs.filter(type='income').aggregate(t=Sum('amount'))['t'] or 0
        outflow = month_txs.filter(type='expense').aggregate(t=Sum('amount'))['t'] or 0
        closing = opening + Decimal(str(inflow)) - Decimal(str(outflow))

        return Response({
            'person': AccountSerializer(person).data,
            'year': year,
            'month': month,
            'opening_balance': float(opening),
            'inflow': float(inflow),
            'outflow': float(outflow),
            'closing_balance': float(closing),
            'pending_net': float(person.current_balance),
            'transactions': TransactionSerializer(
                month_txs.order_by('-date', '-id'), many=True,
            ).data,
        })
