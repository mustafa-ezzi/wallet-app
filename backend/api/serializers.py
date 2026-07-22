from datetime import date
from django.contrib.auth.models import User
from rest_framework import serializers
from .models import (
    UserProfile, Account, Project, Transaction,
    RecurringExpense, ReceivableInstallment, PayableInstallment
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

    class Meta:
        model = Transaction
        fields = (
            'id', 'type', 'amount', 'date', 'account', 'account_name',
            'linked_project', 'project_name', 'linked_receivable', 'linked_payable',
            'category', 'notes', 'created_at'
        )
        read_only_fields = ('created_at',)

    def get_account_name(self, obj):
        return obj.account.name if obj.account else None

    def get_project_name(self, obj):
        return obj.linked_project.name if obj.linked_project else None


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