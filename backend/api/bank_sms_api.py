"""Bank SMS import — pending queue + approve/reject (Phase 2)."""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Account, BankSmsImport, BankSmsImportSettings, Transaction


def _to_decimal(value, default=None):
    if value is None or value == '':
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return default


def _parse_tx_date(raw) -> Optional[date]:
    if raw is None or raw == '':
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    s = str(raw).strip()
    d = parse_date(s)
    if d:
        return d
    dt = parse_datetime(s)
    return dt.date() if dt else None


def _user_wallet(user, account_id) -> Optional[Account]:
    if not account_id:
        return None
    try:
        aid = int(account_id)
    except (TypeError, ValueError):
        return None
    return Account.objects.filter(user=user, id=aid, type__in=['bank', 'cash']).first()


class BankSmsImportSerializer(serializers.ModelSerializer):
    suggested_account_name = serializers.SerializerMethodField()
    resolved_account_name = serializers.SerializerMethodField()
    cash_account_name = serializers.SerializerMethodField()

    class Meta:
        model = BankSmsImport
        fields = (
            'id', 'status', 'kind', 'amount', 'occurred_at', 'tx_date',
            'suggested_account', 'suggested_account_name',
            'resolved_account', 'resolved_account_name',
            'cash_account', 'cash_account_name',
            'category', 'notes', 'fingerprint', 'tid', 'counterparty',
            'bank_hint', 'account_mask', 'raw_snippet', 'source',
            'created_transaction_ids', 'parser_version', 'confidence',
            'parse_reason', 'record_atm_as_expense',
            'responded_at', 'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'status', 'created_transaction_ids', 'responded_at',
            'created_at', 'updated_at',
            'suggested_account_name', 'resolved_account_name', 'cash_account_name',
        )

    def get_suggested_account_name(self, obj):
        return obj.suggested_account.name if obj.suggested_account_id else None

    def get_resolved_account_name(self, obj):
        return obj.resolved_account.name if obj.resolved_account_id else None

    def get_cash_account_name(self, obj):
        return obj.cash_account.name if obj.cash_account_id else None


class BankSmsImportCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[c[0] for c in BankSmsImport.KIND_CHOICES])
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)
    tx_date = serializers.DateField(required=False, allow_null=True)
    occurred_at = serializers.DateTimeField(required=False, allow_null=True)
    fingerprint = serializers.CharField(max_length=64)
    tid = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')
    counterparty = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    bank_hint = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')
    account_mask = serializers.CharField(max_length=32, required=False, allow_blank=True, default='')
    raw_snippet = serializers.CharField(max_length=280, required=False, allow_blank=True, default='')
    source = serializers.ChoiceField(
        choices=[c[0] for c in BankSmsImport.SOURCE_CHOICES],
        default=BankSmsImport.SOURCE_PASTE,
    )
    category = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    confidence = serializers.DecimalField(max_digits=4, decimal_places=3, required=False, allow_null=True)
    parse_reason = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')
    parser_version = serializers.CharField(max_length=32, required=False, allow_blank=True, default='1')
    suggested_account_id = serializers.IntegerField(required=False, allow_null=True)
    resolved_account_id = serializers.IntegerField(required=False, allow_null=True)
    cash_account_id = serializers.IntegerField(required=False, allow_null=True)
    record_atm_as_expense = serializers.BooleanField(required=False, default=False)


class BankSmsImportApproveSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=[c[0] for c in BankSmsImport.KIND_CHOICES],
        required=False,
    )
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    tx_date = serializers.DateField(required=False)
    category = serializers.CharField(max_length=100, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    resolved_account_id = serializers.IntegerField(required=False, allow_null=True)
    cash_account_id = serializers.IntegerField(required=False, allow_null=True)
    record_atm_as_expense = serializers.BooleanField(required=False)
    create_cash = serializers.BooleanField(required=False, default=False)
    create_cash_name = serializers.CharField(max_length=100, required=False, allow_blank=True, default='Cash')


class BankSmsImportSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankSmsImportSettings
        fields = (
            'sms_import_enabled',
            'sms_permission_prompted_at',
            'default_cash_wallet',
            'wallet_aliases',
            'auto_create_cash_on_atm',
            'updated_at',
        )
        read_only_fields = ('sms_permission_prompted_at', 'updated_at')


def approve_bank_sms_import(user, item: BankSmsImport, overrides: dict) -> BankSmsImport:
    """Create Transaction legs and mark import approved. Must run inside atomic."""
    if item.status != BankSmsImport.STATUS_PENDING:
        raise ValueError('Only pending imports can be approved.')

    kind = overrides.get('kind') or item.kind
    if kind == BankSmsImport.KIND_UNKNOWN:
        kind = BankSmsImport.KIND_EXPENSE

    amount = overrides.get('amount')
    if amount is None:
        amount = item.amount
    amount = _to_decimal(amount)
    if amount is None or amount <= 0:
        raise ValueError('A positive amount is required.')

    tx_date = overrides.get('tx_date') or item.tx_date or date.today()
    if not isinstance(tx_date, date):
        tx_date = _parse_tx_date(tx_date) or date.today()

    notes = overrides.get('notes')
    if notes is None:
        notes = item.notes or 'Bank SMS'
    notes = str(notes).strip() or 'Bank SMS'

    category = overrides.get('category')
    if category is None:
        category = item.category or ''

    record_atm_as_expense = overrides.get('record_atm_as_expense')
    if record_atm_as_expense is None:
        record_atm_as_expense = item.record_atm_as_expense

    bank_id = overrides.get('resolved_account_id')
    if bank_id is None:
        bank_id = item.resolved_account_id or item.suggested_account_id
    bank = _user_wallet(user, bank_id)
    if not bank or bank.type != 'bank':
        # Allow cash-as-source only for non-ATM expense edge cases; ATM needs bank
        if kind == BankSmsImport.KIND_ATM and not record_atm_as_expense:
            raise ValueError('Pick a bank wallet.')
        if not bank:
            raise ValueError('Pick a bank wallet.')

    cash = None
    created_ids: list[int] = []

    if kind == BankSmsImport.KIND_ATM and not record_atm_as_expense:
        cash_id = overrides.get('cash_account_id')
        if cash_id is None:
            cash_id = item.cash_account_id
        cash = _user_wallet(user, cash_id)
        if cash and cash.type != 'cash':
            cash = None
        if not cash:
            settings_obj, _ = BankSmsImportSettings.objects.get_or_create(user=user)
            if overrides.get('create_cash') or settings_obj.auto_create_cash_on_atm:
                name = (overrides.get('create_cash_name') or 'Cash').strip() or 'Cash'
                if settings_obj.default_cash_wallet_id:
                    cash = _user_wallet(user, settings_obj.default_cash_wallet_id)
                if not cash:
                    cash = Account.objects.filter(user=user, type='cash').order_by('id').first()
                if not cash:
                    cash = Account.objects.create(
                        user=user, name=name, type='cash', opening_balance=Decimal('0'),
                    )
            else:
                raise ValueError('No Cash wallet. Create one or record as expense.')

        out_tx = Transaction.objects.create(
            user=user,
            type='expense',
            amount=amount,
            date=tx_date,
            account=bank,
            category='Bank Transfer',
            notes=f'{notes} (ATM out)',
        )
        in_tx = Transaction.objects.create(
            user=user,
            type='income',
            amount=amount,
            date=tx_date,
            account=cash,
            category='Bank Transfer',
            notes=f'{notes} (ATM in)',
        )
        created_ids = [out_tx.id, in_tx.id]
    elif kind in (BankSmsImport.KIND_INCOME, BankSmsImport.KIND_REVERSAL):
        cat = category or 'Other'
        note = f'{notes} (reversal)' if kind == BankSmsImport.KIND_REVERSAL else notes
        tx = Transaction.objects.create(
            user=user,
            type='income',
            amount=amount,
            date=tx_date,
            account=bank,
            category=cat,
            notes=note,
        )
        created_ids = [tx.id]
    else:
        # expense (including ATM-as-expense)
        cat = category or 'Miscellaneous'
        tx = Transaction.objects.create(
            user=user,
            type='expense',
            amount=amount,
            date=tx_date,
            account=bank,
            category=cat,
            notes=notes,
        )
        created_ids = [tx.id]

    item.kind = kind
    item.amount = amount
    item.tx_date = tx_date
    item.notes = notes
    item.category = category or item.category
    item.resolved_account = bank
    item.cash_account = cash
    item.record_atm_as_expense = bool(record_atm_as_expense)
    item.created_transaction_ids = created_ids
    item.status = BankSmsImport.STATUS_APPROVED
    item.responded_at = timezone.now()
    item.save()
    return item


class BankSmsImportViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = BankSmsImport.objects.filter(user=self.request.user).select_related(
            'suggested_account', 'resolved_account', 'cash_account',
        )
        status_f = (self.request.query_params.get('status') or '').strip().lower()
        if status_f:
            qs = qs.filter(status=status_f)
        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return BankSmsImportCreateSerializer
        return BankSmsImportSerializer

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        return Response(BankSmsImportSerializer(qs[:100], many=True).data)

    def retrieve(self, request, *args, **kwargs):
        return Response(BankSmsImportSerializer(self.get_object()).data)

    def create(self, request, *args, **kwargs):
        ser = BankSmsImportCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        fingerprint = data['fingerprint'].strip()
        if not fingerprint:
            return Response({'detail': 'fingerprint is required.'}, status=status.HTTP_400_BAD_REQUEST)

        existing = BankSmsImport.objects.filter(
            user=request.user, fingerprint=fingerprint, status=BankSmsImport.STATUS_PENDING,
        ).first()
        if existing:
            return Response(BankSmsImportSerializer(existing).data, status=status.HTTP_200_OK)

        suggested = _user_wallet(request.user, data.get('suggested_account_id'))
        resolved = _user_wallet(request.user, data.get('resolved_account_id')) or suggested
        cash = _user_wallet(request.user, data.get('cash_account_id'))

        tx_date = data.get('tx_date') or date.today()
        amount = data.get('amount')

        try:
            item = BankSmsImport.objects.create(
                user=request.user,
                status=BankSmsImport.STATUS_PENDING,
                kind=data['kind'],
                amount=amount,
                occurred_at=data.get('occurred_at'),
                tx_date=tx_date,
                suggested_account=suggested,
                resolved_account=resolved,
                cash_account=cash if cash and cash.type == 'cash' else None,
                category=(data.get('category') or '')[:100],
                notes=data.get('notes') or '',
                fingerprint=fingerprint[:64],
                tid=(data.get('tid') or '')[:64],
                counterparty=(data.get('counterparty') or '')[:120],
                bank_hint=(data.get('bank_hint') or '')[:64],
                account_mask=(data.get('account_mask') or '')[:32],
                raw_snippet=(data.get('raw_snippet') or '')[:280],
                source=data.get('source') or BankSmsImport.SOURCE_PASTE,
                parser_version=(data.get('parser_version') or '1')[:32],
                confidence=data.get('confidence'),
                parse_reason=(data.get('parse_reason') or '')[:64],
                record_atm_as_expense=bool(data.get('record_atm_as_expense')),
            )
        except IntegrityError:
            existing = BankSmsImport.objects.filter(
                user=request.user, fingerprint=fingerprint, status=BankSmsImport.STATUS_PENDING,
            ).first()
            if existing:
                return Response(BankSmsImportSerializer(existing).data, status=status.HTTP_200_OK)
            raise

        return Response(BankSmsImportSerializer(item).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        item = self.get_object()
        if item.status != BankSmsImport.STATUS_PENDING:
            return Response({'detail': 'Only pending imports can be edited.'}, status=status.HTTP_400_BAD_REQUEST)

        kind = request.data.get('kind')
        if kind in dict(BankSmsImport.KIND_CHOICES):
            item.kind = kind
        if 'amount' in request.data:
            amt = _to_decimal(request.data.get('amount'))
            if amt is not None:
                item.amount = amt
        if 'tx_date' in request.data:
            d = _parse_tx_date(request.data.get('tx_date'))
            if d:
                item.tx_date = d
        if 'category' in request.data:
            item.category = str(request.data.get('category') or '')[:100]
        if 'notes' in request.data:
            item.notes = str(request.data.get('notes') or '')
        if 'record_atm_as_expense' in request.data:
            item.record_atm_as_expense = str(request.data.get('record_atm_as_expense')).lower() in {
                '1', 'true', 'yes',
            }
        if 'resolved_account_id' in request.data:
            item.resolved_account = _user_wallet(request.user, request.data.get('resolved_account_id'))
        if 'cash_account_id' in request.data:
            w = _user_wallet(request.user, request.data.get('cash_account_id'))
            item.cash_account = w if w and w.type == 'cash' else None
        item.save()
        return Response(BankSmsImportSerializer(item).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        item = self.get_object()
        ser = BankSmsImportApproveSerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                # lock row
                item = BankSmsImport.objects.select_for_update().get(pk=item.pk, user=request.user)
                item = approve_bank_sms_import(request.user, item, ser.validated_data)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(BankSmsImportSerializer(item).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        item = self.get_object()
        if item.status != BankSmsImport.STATUS_PENDING:
            return Response({'detail': 'Only pending imports can be rejected.'}, status=status.HTTP_400_BAD_REQUEST)
        item.status = BankSmsImport.STATUS_REJECTED
        item.responded_at = timezone.now()
        item.save(update_fields=['status', 'responded_at', 'updated_at'])
        return Response(BankSmsImportSerializer(item).data)


class BankSmsImportSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, user) -> BankSmsImportSettings:
        obj, _ = BankSmsImportSettings.objects.get_or_create(user=user)
        return obj

    def get(self, request):
        obj = self._get(request.user)
        return Response({
            'sms_import_enabled': obj.sms_import_enabled,
            'sms_permission_prompted_at': obj.sms_permission_prompted_at.isoformat() if obj.sms_permission_prompted_at else None,
            'default_cash_wallet_id': obj.default_cash_wallet_id,
            'wallet_aliases': obj.wallet_aliases or [],
            'auto_create_cash_on_atm': obj.auto_create_cash_on_atm,
            'updated_at': obj.updated_at.isoformat() if obj.updated_at else None,
        })

    def patch(self, request):
        return self._set(request)

    def put(self, request):
        return self._set(request)

    def _set(self, request):
        obj = self._get(request.user)
        if 'sms_import_enabled' in request.data:
            obj.sms_import_enabled = bool(request.data.get('sms_import_enabled'))
        if 'auto_create_cash_on_atm' in request.data:
            obj.auto_create_cash_on_atm = bool(request.data.get('auto_create_cash_on_atm'))
        if 'wallet_aliases' in request.data and isinstance(request.data.get('wallet_aliases'), list):
            obj.wallet_aliases = request.data.get('wallet_aliases')
        if 'default_cash_wallet_id' in request.data:
            wid = request.data.get('default_cash_wallet_id')
            obj.default_cash_wallet = _user_wallet(request.user, wid) if wid else None
        if request.data.get('mark_permission_prompted'):
            obj.sms_permission_prompted_at = timezone.now()
        obj.save()
        return self.get(request)
