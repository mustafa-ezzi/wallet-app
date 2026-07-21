from datetime import date, timedelta
from decimal import Decimal
import calendar

from django.contrib.auth.models import User
from django.db.models import Sum, Q
from rest_framework import generics, viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Account, Project, Transaction,
    RecurringExpense, ReceivableInstallment, PayableInstallment
)
from .serializers import (
    RegisterSerializer, UserSerializer,
    AccountSerializer, ProjectSerializer, TransactionSerializer,
    RecurringExpenseSerializer, ReceivableInstallmentSerializer, PayableInstallmentSerializer
)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        user = request.user
        data = request.data
        if 'first_name' in data:
            user.first_name = data['first_name']
        if 'last_name' in data:
            user.last_name = data['last_name']
        if 'email' in data:
            user.email = data['email']
        if 'password' in data and data['password']:
            user.set_password(data['password'])
        user.save()
        if 'currency' in data:
            user.profile.currency = data['currency']
            user.profile.save()
        return Response(UserSerializer(user).data)


class AccountViewSet(viewsets.ModelViewSet):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Account.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Project.objects.filter(user=self.request.user)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        import math as _math
        project = serializer.save(user=self.request.user)
        # Auto-create a ReceivableInstallment plan when income_type is installments
        if (project.income_type == 'one_time_installments'
                and project.installment_amount
                and not project.receivable_installments.exists()):
            total_inst = _math.ceil(float(project.amount) / float(project.installment_amount))
            ReceivableInstallment.objects.create(
                user=self.request.user,
                linked_project=project,
                total_amount=project.amount,
                monthly_amount=project.installment_amount,
                total_installments=total_inst,
                start_date=project.start_date,
            )


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Transaction.objects.filter(user=self.request.user)
        tx_type = self.request.query_params.get('type')
        account_id = self.request.query_params.get('account')
        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        if tx_type:
            qs = qs.filter(type=tx_type)
        if account_id:
            qs = qs.filter(account_id=account_id)
        if year and month:
            qs = qs.filter(date__year=year, date__month=month)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class RecurringExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = RecurringExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return RecurringExpense.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ReceivableViewSet(viewsets.ModelViewSet):
    serializer_class = ReceivableInstallmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ReceivableInstallment.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        project = serializer.validated_data['linked_project']
        if project.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied
        serializer.save(user=self.request.user)


class PayableViewSet(viewsets.ModelViewSet):
    serializer_class = PayableInstallmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PayableInstallment.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        accounts = Account.objects.filter(user=user)
        account_data = []
        total_balance = Decimal('0')
        for acc in accounts:
            bal = Decimal(str(acc.current_balance))
            total_balance += bal
            account_data.append({
                'id': acc.id,
                'name': acc.name,
                'type': acc.type,
                'balance': float(bal),
            })

        today = date.today()
        month_start = today.replace(day=1)
        month_end = today.replace(day=calendar.monthrange(today.year, today.month)[1])

        month_income = Transaction.objects.filter(
            user=user, type='income',
            date__gte=month_start, date__lte=month_end
        ).aggregate(total=Sum('amount'))['total'] or 0

        month_expense = Transaction.objects.filter(
            user=user, type='expense',
            date__gte=month_start, date__lte=month_end
        ).aggregate(total=Sum('amount'))['total'] or 0

        recent_transactions = Transaction.objects.filter(user=user)[:8]
        tx_data = TransactionSerializer(recent_transactions, many=True).data

        return Response({
            'total_balance': float(total_balance),
            'accounts': account_data,
            'month_income': float(month_income),
            'month_expense': float(month_expense),
            'month_net': float(month_income) - float(month_expense),
            'recent_transactions': tx_data,
        })


class ForecastView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, year, month):
        user = request.user
        year, month = int(year), int(month)

        forecast_income = []
        forecast_outgoing = []

        for project in Project.objects.filter(user=user, status='active'):
            if project.income_type in ('recurring_monthly', 'contract_monthly'):
                if project.start_date.year < year or (
                    project.start_date.year == year and project.start_date.month <= month
                ):
                    forecast_income.append({
                        'label': project.name,
                        'amount': float(project.amount),
                        'type': project.income_type,
                    })
            elif project.income_type == 'one_time_installments':
                for rec in project.receivable_installments.filter(status='ongoing'):
                    if (rec.start_date.year < year or
                            (rec.start_date.year == year and rec.start_date.month <= month)):
                        forecast_income.append({
                            'label': f"{project.name} (installment)",
                            'amount': float(rec.monthly_amount),
                            'type': 'one_time_installments',
                        })

        for expense in RecurringExpense.objects.filter(user=user, active=True):
            if expense.frequency == 'monthly':
                forecast_outgoing.append({
                    'label': expense.name,
                    'amount': float(expense.amount),
                    'type': 'recurring',
                    'due_day': expense.due_day,
                })

        for payable in PayableInstallment.objects.filter(user=user, status='ongoing'):
            forecast_outgoing.append({
                'label': payable.name,
                'amount': float(payable.monthly_amount),
                'type': 'payable_installment',
                'due_day': payable.due_day,
            })

        total_expected_income = sum(i['amount'] for i in forecast_income)
        total_expected_outgoing = sum(o['amount'] for o in forecast_outgoing)
        net = total_expected_income - total_expected_outgoing

        month_start = date(year, month, 1)
        month_end = date(year, month, calendar.monthrange(year, month)[1])

        actual_income = Transaction.objects.filter(
            user=user, type='income',
            date__gte=month_start, date__lte=month_end
        ).aggregate(total=Sum('amount'))['total'] or 0

        actual_expense = Transaction.objects.filter(
            user=user, type='expense',
            date__gte=month_start, date__lte=month_end
        ).aggregate(total=Sum('amount'))['total'] or 0

        return Response({
            'year': year,
            'month': month,
            'forecast_income': forecast_income,
            'forecast_outgoing': forecast_outgoing,
            'total_expected_income': total_expected_income,
            'total_expected_outgoing': total_expected_outgoing,
            'net_forecast': net,
            'actual_income': float(actual_income),
            'actual_expense': float(actual_expense),
            'actual_net': float(actual_income) - float(actual_expense),
        })
