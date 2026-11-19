"""Payment history for payment slips (loans you owe, installment plans, one-time payments owed to you)."""

from decimal import ROUND_HALF_UP, Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .entitlements import user_is_premium
from .models import AppRemoteConfig, PayableInstallment, Project, ReceivableInstallment

PRO_FLAG = 'enforce_pro_slips'
CENT = Decimal('0.01')


def _money(value) -> str:
    return str(Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP))


def _pro_required_response(user):
    """Slips are Pro only, enforced once Ops turns on the enforce_pro_slips feature flag."""
    flags = AppRemoteConfig.get_solo().feature_flags
    if isinstance(flags, dict) and flags.get(PRO_FLAG) and not user_is_premium(user):
        return Response(
            {'detail': 'Payment slips are a Pro feature.', 'code': 'pro_required'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _payment_rows(qs, start_index=1):
    rows = []
    for offset, tx in enumerate(qs.order_by('date', 'created_at', 'id')):
        rows.append({
            'index': start_index + offset,
            'transaction_id': tx.id,
            'date': tx.date.isoformat(),
            'amount': _money(tx.amount),
            'is_advance': False,
        })
    return rows


def _slip_payload(*, kind, direction, record, name, total, payments, remaining, extra):
    total_paid = sum((Decimal(p['amount']) for p in payments), Decimal('0'))
    remaining_dec = Decimal(str(remaining)).quantize(CENT, rounding=ROUND_HALF_UP)
    paid_in_full = remaining_dec <= CENT
    return {
        'kind': kind,
        'direction': direction,
        'id': record.id,
        'name': name,
        'status': record.status,
        'total_amount': _money(total),
        'payments': payments,
        'payment_count': sum(1 for p in payments if not p['is_advance']),
        'total_paid': _money(total_paid),
        'remaining_amount': _money(remaining_dec),
        'paid_in_full': paid_in_full,
        'closed_without_full_payment': record.status == 'completed' and not paid_in_full,
        'generated_at': timezone.now().isoformat(),
        **extra,
    }


class PayablePaymentsView(APIView):
    """GET /api/payables/<id>/payments/ — money you owe."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        blocked = _pro_required_response(request.user)
        if blocked:
            return blocked
        payable = get_object_or_404(PayableInstallment, pk=pk, user=request.user)
        return Response(_slip_payload(
            kind='payable',
            direction='owe',
            record=payable,
            name=payable.name,
            total=payable.total_amount,
            payments=_payment_rows(payable.payment_transactions()),
            remaining=payable.remaining_amount,
            extra={
                'monthly_amount': _money(payable.monthly_amount),
                'total_installments': payable.total_installments,
                'installments_done': payable.installments_paid,
                'advance_amount': _money(0),
            },
        ))


class ReceivablePaymentsView(APIView):
    """GET /api/receivables/<id>/payments/ — installment plan owed to you."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        blocked = _pro_required_response(request.user)
        if blocked:
            return blocked
        receivable = get_object_or_404(
            ReceivableInstallment.objects.select_related('linked_project'),
            pk=pk,
            user=request.user,
        )
        name = receivable.linked_project.name if receivable.linked_project_id else 'Installment plan'
        return Response(_slip_payload(
            kind='receivable',
            direction='owed',
            record=receivable,
            name=name,
            total=receivable.total_amount,
            payments=_payment_rows(receivable.payment_transactions()),
            remaining=receivable.remaining_amount,
            extra={
                'monthly_amount': _money(receivable.monthly_amount),
                'total_installments': receivable.total_installments,
                'installments_done': receivable.installments_received,
                'advance_amount': _money(0),
            },
        ))


class ProjectPaymentsView(APIView):
    """GET /api/projects/<id>/payments/ — one-time payment owed to you."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        blocked = _pro_required_response(request.user)
        if blocked:
            return blocked
        project = get_object_or_404(Project, pk=pk, user=request.user)
        if project.income_type != 'one_time':
            return Response(
                {'detail': 'Slips here are for one-time payments. Use the installment plan instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        advance = Decimal(str(project.advance_amount or 0))
        payments = []
        if advance > 0:
            payments.append({
                'index': 1,
                'transaction_id': None,
                'date': project.start_date.isoformat(),
                'amount': _money(advance),
                'is_advance': True,
            })
        payments += _payment_rows(project._linked_income_qs(), start_index=len(payments) + 1)
        return Response(_slip_payload(
            kind='project',
            direction='owed',
            record=project,
            name=project.name,
            total=project.amount,
            payments=payments,
            remaining=project.remaining_amount,
            extra={
                'monthly_amount': None,
                'total_installments': None,
                'installments_done': None,
                'advance_amount': _money(advance),
            },
        ))
