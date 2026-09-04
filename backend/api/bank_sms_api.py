"""Bank SMS import — pending queue + approve/reject (Phase 2)."""

from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

from django.db import IntegrityError, transaction
from django.db.models import Q
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
            'linked_import',
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
    # Remember this wallet for mask/hint (Phase 4)
    remember_wallet = serializers.BooleanField(required=False, default=False)
    # Remember kind correction (Phase 5)
    remember_kind = serializers.BooleanField(required=False, default=False)


class BankSmsBatchSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        max_length=50,
    )
    # Optional defaults applied when an item has no resolved wallet
    resolved_account_id = serializers.IntegerField(required=False, allow_null=True)
    cash_account_id = serializers.IntegerField(required=False, allow_null=True)
    remember_wallet = serializers.BooleanField(required=False, default=False)


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


def _normalize_mask(mask: str) -> str:
    digits = ''.join(ch for ch in str(mask or '') if ch.isdigit())
    if not digits:
        return ''.join(ch for ch in str(mask or '').lower() if ch.isalnum())
    return digits[-4:] if len(digits) > 4 else digits


def _upsert_wallet_alias(aliases: list, *, account_id: int, hint: str = '', mask: str = '') -> list:
    next_list = [a for a in (aliases or []) if isinstance(a, dict)]
    hint_n = ''.join(ch for ch in hint.lower() if ch.isalnum()) if hint else ''
    mask_n = _normalize_mask(mask) if mask else ''
    if mask_n:
        next_list = [
            a for a in next_list
            if _normalize_mask(str(a.get('mask') or '')) != mask_n
        ]
        next_list.append({'account_id': account_id, 'mask': mask_n})
    if hint_n:
        next_list = [
            a for a in next_list
            if not (
                ''.join(ch for ch in str(a.get('hint') or '').lower() if ch.isalnum()) == hint_n
                and not a.get('mask')
            )
        ]
        if not any(
            ''.join(ch for ch in str(a.get('hint') or '').lower() if ch.isalnum()) == hint_n
            and int(a.get('account_id') or 0) == account_id
            for a in next_list
        ):
            next_list.append({'account_id': account_id, 'hint': hint_n})
    return next_list


def _sanitize_aliases(raw) -> list:
    if not isinstance(raw, list):
        return []
    out = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        try:
            aid = int(row.get('account_id'))
        except (TypeError, ValueError):
            continue
        if aid <= 0:
            continue
        entry = {'account_id': aid}
        hint = str(row.get('hint') or '').strip()
        mask = str(row.get('mask') or '').strip()
        if hint:
            entry['hint'] = ''.join(ch for ch in hint.lower() if ch.isalnum())
        if mask:
            entry['mask'] = _normalize_mask(mask)
        if 'hint' in entry or 'mask' in entry:
            out.append(entry)
    return out


def _sanitize_kind_overrides(raw) -> list:
    allowed = {'expense', 'atm', 'income', 'reversal'}
    if not isinstance(raw, list):
        return []
    out = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        kind = str(row.get('kind') or '').strip().lower()
        if kind not in allowed:
            continue
        entry = {'kind': kind}
        hint = str(row.get('hint') or '').strip()
        mask = str(row.get('mask') or '').strip()
        phrase = str(row.get('phrase') or '').strip().lower()[:80]
        if hint:
            entry['hint'] = ''.join(ch for ch in hint.lower() if ch.isalnum())
        if mask:
            entry['mask'] = _normalize_mask(mask)
        if phrase:
            entry['phrase'] = phrase
        if 'hint' in entry or 'mask' in entry or 'phrase' in entry:
            out.append(entry)
    return out[:40]


def _upsert_kind_override(overrides: list, *, kind: str, hint: str = '', mask: str = '', phrase: str = '') -> list:
    next_list = _sanitize_kind_overrides(overrides)
    entry = {'kind': kind}
    hint_n = ''.join(ch for ch in hint.lower() if ch.isalnum()) if hint else ''
    mask_n = _normalize_mask(mask) if mask else ''
    phrase_n = (phrase or '').strip().lower()[:80]
    if mask_n:
        next_list = [o for o in next_list if o.get('mask') != mask_n]
        entry['mask'] = mask_n
    if hint_n:
        next_list = [
            o for o in next_list
            if not (o.get('hint') == hint_n and not o.get('mask') and not o.get('phrase'))
        ]
        entry['hint'] = hint_n
    if phrase_n and not mask_n and not hint_n:
        next_list = [o for o in next_list if o.get('phrase') != phrase_n]
        entry['phrase'] = phrase_n
    if 'hint' in entry or 'mask' in entry or 'phrase' in entry:
        next_list.append(entry)
    return next_list[:40]


def _find_reversal_original(user, item: BankSmsImport) -> Optional[BankSmsImport]:
    """Best-effort: prior approved debit/ATM with same TID, or same amount+mask recently."""
    qs = BankSmsImport.objects.filter(
        user=user,
        status=BankSmsImport.STATUS_APPROVED,
    ).exclude(kind=BankSmsImport.KIND_REVERSAL).exclude(pk=item.pk)

    tid = (item.tid or '').strip()
    if tid:
        hit = qs.filter(tid__iexact=tid).order_by('-tx_date', '-id').first()
        if hit:
            return hit

    if item.amount is None:
        return None
    mask = _normalize_mask(item.account_mask)
    candidates = qs.filter(amount=item.amount).order_by('-tx_date', '-id')[:20]
    for c in candidates:
        if mask and _normalize_mask(c.account_mask) == mask:
            return c
        if not mask and not c.account_mask:
            # same amount alone is weak — only if within ~45 days and notes share counterparty
            if item.tx_date and c.tx_date and abs((item.tx_date - c.tx_date).days) <= 45:
                return c
    return None


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

    if kind == BankSmsImport.KIND_REVERSAL and not item.linked_import_id:
        original = _find_reversal_original(user, item)
        if original:
            item.linked_import = original
            # Annotate notes for audit trail
            if original.id and f'linked#{original.id}' not in item.notes:
                item.notes = f'{item.notes} · linked#{original.id}'.strip()

    item.save()

    settings_obj, _ = BankSmsImportSettings.objects.get_or_create(user=user)
    dirty = False
    if overrides.get('remember_wallet') and bank and bank.type == 'bank':
        settings_obj.wallet_aliases = _upsert_wallet_alias(
            list(settings_obj.wallet_aliases or []),
            account_id=bank.id,
            hint=item.bank_hint or '',
            mask=item.account_mask or '',
        )
        dirty = True
    if overrides.get('remember_kind') and kind in (
        BankSmsImport.KIND_EXPENSE, BankSmsImport.KIND_ATM,
        BankSmsImport.KIND_INCOME, BankSmsImport.KIND_REVERSAL,
    ):
        settings_obj.kind_overrides = _upsert_kind_override(
            list(settings_obj.kind_overrides or []),
            kind=kind,
            hint=item.bank_hint or '',
            mask=item.account_mask or '',
        )
        dirty = True
    if dirty:
        settings_obj.save()

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

        # Cross-source / SMS+push dedupe: same TID already pending or recently approved.
        tid = (data.get('tid') or '').strip()
        if tid:
            recent_cut = timezone.now() - timedelta(days=14)
            twin = (
                BankSmsImport.objects.filter(user=request.user, tid=tid)
                .filter(
                    Q(status=BankSmsImport.STATUS_PENDING)
                    | Q(status=BankSmsImport.STATUS_APPROVED, created_at__gte=recent_cut)
                )
                .order_by('-id')
                .first()
            )
            if twin:
                return Response(BankSmsImportSerializer(twin).data, status=status.HTTP_200_OK)

        # Soft dedupe without TID: same amount + mask + date within 2 days (pending or approved).
        amount = data.get('amount')
        mask = (data.get('account_mask') or '').strip()
        tx_date = data.get('tx_date') or date.today()
        if amount is not None and mask:
            soft_cut = timezone.now() - timedelta(days=2)
            soft = (
                BankSmsImport.objects.filter(
                    user=request.user,
                    amount=amount,
                    account_mask=mask,
                    tx_date=tx_date,
                )
                .filter(
                    Q(status=BankSmsImport.STATUS_PENDING)
                    | Q(status=BankSmsImport.STATUS_APPROVED, created_at__gte=soft_cut)
                )
                .order_by('-id')
                .first()
            )
            if soft:
                return Response(BankSmsImportSerializer(soft).data, status=status.HTTP_200_OK)

        suggested = _user_wallet(request.user, data.get('suggested_account_id'))
        resolved = _user_wallet(request.user, data.get('resolved_account_id')) or suggested
        cash = _user_wallet(request.user, data.get('cash_account_id'))

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

    @action(detail=False, methods=['post'], url_path='batch-approve')
    def batch_approve(self, request):
        ser = BankSmsBatchSerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data['ids']
        defaults = {
            'resolved_account_id': ser.validated_data.get('resolved_account_id'),
            'cash_account_id': ser.validated_data.get('cash_account_id'),
            'remember_wallet': ser.validated_data.get('remember_wallet', False),
        }
        approved = []
        errors = []
        for pk in ids:
            try:
                with transaction.atomic():
                    item = BankSmsImport.objects.select_for_update().filter(
                        pk=pk, user=request.user, status=BankSmsImport.STATUS_PENDING,
                    ).first()
                    if not item:
                        errors.append({'id': pk, 'detail': 'Not found or not pending.'})
                        continue
                    overrides = {k: v for k, v in defaults.items() if v is not None}
                    # Only pass resolved_account_id when provided
                    ov = {}
                    if defaults.get('resolved_account_id'):
                        ov['resolved_account_id'] = defaults['resolved_account_id']
                    if defaults.get('cash_account_id'):
                        ov['cash_account_id'] = defaults['cash_account_id']
                    if defaults.get('remember_wallet'):
                        ov['remember_wallet'] = True
                    item = approve_bank_sms_import(request.user, item, ov)
                    approved.append(BankSmsImportSerializer(item).data)
            except ValueError as exc:
                errors.append({'id': pk, 'detail': str(exc)})
        return Response({'approved': approved, 'errors': errors})

    @action(detail=False, methods=['post'], url_path='batch-reject')
    def batch_reject(self, request):
        ser = BankSmsBatchSerializer(data={'ids': (request.data or {}).get('ids') or []})
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data['ids']
        now = timezone.now()
        updated = BankSmsImport.objects.filter(
            user=request.user, id__in=ids, status=BankSmsImport.STATUS_PENDING,
        ).update(status=BankSmsImport.STATUS_REJECTED, responded_at=now)
        return Response({'rejected_count': updated})


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
            'kind_overrides': obj.kind_overrides or [],
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
            obj.wallet_aliases = _sanitize_aliases(request.data.get('wallet_aliases'))
            # Drop aliases pointing at wallets the user no longer owns
            owned = set(
                Account.objects.filter(user=request.user, type__in=['bank', 'cash'])
                .values_list('id', flat=True)
            )
            obj.wallet_aliases = [
                a for a in obj.wallet_aliases if int(a.get('account_id') or 0) in owned
            ]
        if 'kind_overrides' in request.data and isinstance(request.data.get('kind_overrides'), list):
            obj.kind_overrides = _sanitize_kind_overrides(request.data.get('kind_overrides'))
        if 'default_cash_wallet_id' in request.data:
            wid = request.data.get('default_cash_wallet_id')
            obj.default_cash_wallet = _user_wallet(request.user, wid) if wid else None
        if request.data.get('mark_permission_prompted'):
            obj.sms_permission_prompted_at = timezone.now()
        obj.save()
        return self.get(request)
