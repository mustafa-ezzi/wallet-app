from datetime import date
from django.contrib.auth.models import User
from rest_framework import serializers
from .models import (
    UserProfile, Account, Project, Transaction,
    RecurringExpense, ReceivableInstallment, PayableInstallment,
    HouseholdLedger, HouseholdExpense, HouseholdMembership,
)


def _month_range(today=None):
    today = today or date.today()
    start = today.replace(day=1)
    if today.month == 12:
        end = today.replace(year=today.year + 1, month=1, day=1)
    else:
        end = today.replace(month=today.month + 1, day=1)
    return start, end


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    currency = serializers.CharField(write_only=True, default='PKR')

    class Meta:
        model = User
        fields = ('id', 'first_name', 'last_name', 'username', 'email', 'password', 'currency')

    def create(self, validated_data):
        currency = validated_data.pop('currency', 'PKR')
        password = validated_data.pop('password')
        validated_data.setdefault('username', validated_data.get('email', ''))
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        UserProfile.objects.create(user=user, currency=currency)
        # Attach any household "invite to register" rows for this email
        from django.utils import timezone
        from .models import HouseholdMembership
        email = (user.email or '').strip()
        if email:
            HouseholdMembership.objects.filter(
                status='invited', user__isnull=True, invited_email__iexact=email,
            ).update(user=user)
        return user


class UserSerializer(serializers.ModelSerializer):
    currency = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'first_name', 'last_name', 'username', 'email', 'currency')

    def get_currency(self, obj):
        try:
            return obj.profile.currency
        except Exception:
            return 'PKR'


class AccountSerializer(serializers.ModelSerializer):
    current_balance = serializers.ReadOnlyField()

    class Meta:
        model = Account
        fields = ('id', 'name', 'type', 'opening_balance', 'current_balance', 'created_at')
        read_only_fields = ('created_at',)


class ProjectSerializer(serializers.ModelSerializer):
    default_account_name = serializers.SerializerMethodField()
    months_to_complete    = serializers.ReadOnlyField()
    remaining_amount      = serializers.ReadOnlyField()
    installments_received = serializers.SerializerMethodField()
    received_this_month   = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            'id', 'name', 'income_type', 'amount', 'installment_amount', 'advance_amount',
            'remaining_amount', 'months_to_complete', 'installments_received', 'received_this_month',
            'status', 'start_date', 'default_account', 'default_account_name',
            'notes', 'created_at'
        )
        read_only_fields = ('created_at',)

    def get_default_account_name(self, obj):
        return obj.default_account.name if obj.default_account else None

    def get_installments_received(self, obj):
        if obj.income_type == 'one_time_installments':
            rec = obj.receivable_installments.first()
            if rec:
                return rec.installments_received
        return None

    def get_received_this_month(self, obj):
        start, end = _month_range()
        return obj.transactions.filter(
            type='income', date__gte=start, date__lt=end
        ).exists()


class TransactionSerializer(serializers.ModelSerializer):
    account_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    household_ledger = serializers.PrimaryKeyRelatedField(
        queryset=HouseholdLedger.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    household_expense_id = serializers.SerializerMethodField()
    household_ledger_name = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = (
            'id', 'type', 'amount', 'date', 'account', 'account_name',
            'linked_project', 'project_name', 'linked_receivable', 'linked_payable',
            'category', 'notes', 'created_at',
            'household_ledger', 'household_expense_id', 'household_ledger_name',
        )
        read_only_fields = ('created_at',)

    def get_account_name(self, obj):
        return obj.account.name if obj.account else None

    def get_project_name(self, obj):
        return obj.linked_project.name if obj.linked_project else None

    def get_household_expense_id(self, obj):
        he = obj.household_expenses.first()
        return he.id if he else None

    def get_household_ledger_name(self, obj):
        he = obj.household_expenses.select_related('ledger').first()
        return he.ledger.name if he else None

    def validate_household_ledger(self, ledger):
        if ledger is None:
            return ledger
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError('Authentication required.')
        if ledger.status == 'closed':
            raise serializers.ValidationError('This household ledger is closed.')
        if not HouseholdMembership.objects.filter(
            household=ledger.household, user=request.user, status='active',
        ).exists():
            raise serializers.ValidationError('You are not a member of this household.')
        return ledger

    def validate(self, attrs):
        ledger = attrs.get('household_ledger')
        if ledger and attrs.get('type', getattr(self.instance, 'type', None)) != 'expense':
            raise serializers.ValidationError({
                'household_ledger': 'Only expenses can be linked to a household ledger.',
            })
        if ledger and attrs.get('category') == 'Bank Transfer':
            raise serializers.ValidationError({
                'household_ledger': 'Bank transfers cannot be linked to a household.',
            })
        return attrs

    def create(self, validated_data):
        ledger = validated_data.pop('household_ledger', None)
        tx = Transaction.objects.create(**validated_data)
        if ledger and tx.type == 'expense':
            HouseholdExpense.objects.create(
                ledger=ledger,
                amount=tx.amount,
                date=tx.date,
                category=tx.category or '',
                notes=tx.notes or '',
                created_by=tx.user,
                paid_by=tx.user,
                linked_transaction=tx,
                linked_account=tx.account,
            )
        return tx

    def update(self, instance, validated_data):
        # household_ledger on update: only allow clearing or keep; linking new via PATCH is rare
        validated_data.pop('household_ledger', None)
        instance = super().update(instance, validated_data)
        for he in instance.household_expenses.all():
            if he.ledger.status == 'closed':
                continue
            he.amount = instance.amount
            he.date = instance.date
            he.category = instance.category or ''
            he.notes = instance.notes or ''
            he.linked_account = instance.account
            he.save(update_fields=['amount', 'date', 'category', 'notes', 'linked_account'])
        return instance


class RecurringExpenseSerializer(serializers.ModelSerializer):
    account_name = serializers.SerializerMethodField()
    paid_this_month = serializers.SerializerMethodField()

    class Meta:
        model = RecurringExpense
        fields = (
            'id', 'name', 'amount', 'frequency', 'due_day', 'account',
            'account_name', 'active', 'paid_this_month', 'created_at'
        )
        read_only_fields = ('created_at',)

    def get_account_name(self, obj):
        return obj.account.name if obj.account else None

    def get_paid_this_month(self, obj):
        start, end = _month_range()
        # Recorded via "Record Payment" with category = expense name
        qs = Transaction.objects.filter(
            user=obj.user, type='expense',
            date__gte=start, date__lt=end,
            category=obj.name,
        )
        return qs.exists()


class ReceivableInstallmentSerializer(serializers.ModelSerializer):
    remaining_amount = serializers.ReadOnlyField()
    project_name = serializers.SerializerMethodField()
    received_this_month = serializers.SerializerMethodField()

    class Meta:
        model = ReceivableInstallment
        fields = (
            'id', 'linked_project', 'project_name', 'total_amount', 'monthly_amount',
            'total_installments', 'installments_received', 'remaining_amount',
            'start_date', 'status', 'received_this_month', 'created_at'
        )
        read_only_fields = ('installments_received', 'created_at')

    def get_project_name(self, obj):
        return obj.linked_project.name if obj.linked_project else None

    def get_received_this_month(self, obj):
        start, end = _month_range()
        return obj.transactions.filter(
            type='income', date__gte=start, date__lt=end
        ).exists()


class PayableInstallmentSerializer(serializers.ModelSerializer):
    remaining_amount = serializers.ReadOnlyField()
    account_name = serializers.SerializerMethodField()
    paid_this_month = serializers.SerializerMethodField()

    class Meta:
        model = PayableInstallment
        fields = (
            'id', 'name', 'total_amount', 'monthly_amount', 'total_installments',
            'installments_paid', 'remaining_amount', 'due_day', 'account',
            'account_name', 'status', 'paid_this_month', 'created_at'
        )
        read_only_fields = ('installments_paid', 'created_at')

    def get_account_name(self, obj):
        return obj.account.name if obj.account else None

    def get_paid_this_month(self, obj):
        start, end = _month_range()
        return obj.transactions.filter(
            type='expense', date__gte=start, date__lt=end
        ).exists()