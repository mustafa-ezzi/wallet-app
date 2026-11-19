"""
Payment slip history endpoints (Phase 1 of docs/research/payment-slips-for-bills-loans-and-installments.md).
Run: py manage.py test api.tests_payment_slips -v 2
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import (
    Account,
    AppRemoteConfig,
    Entitlement,
    PayableInstallment,
    Project,
    ReceivableInstallment,
    Transaction,
)


def _client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


def _d(value):
    return Decimal(str(value))


class PaymentSlipTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='mustafa', password='x')
        self.other = User.objects.create_user(username='other', password='x')
        self.client = _client_for(self.user)
        self.bank = Account.objects.create(user=self.user, name='Meezan', type='bank', opening_balance=500000)

    def _tx(self, tx_type, amount, day, **links):
        return Transaction.objects.create(
            user=self.user,
            type=tx_type,
            amount=_d(amount),
            date=day,
            account=self.bank,
            category='Test',
            **links,
        )

    def _assert_adds_up(self, body):
        total = _d(body['total_amount'])
        paid = sum((_d(p['amount']) for p in body['payments']), Decimal('0'))
        self.assertEqual(_d(body['total_paid']), paid)
        self.assertEqual(total - paid, _d(body['remaining_amount']))

    # Money you owe

    def test_payable_lists_payments_oldest_first_and_adds_up(self):
        loan = PayableInstallment.objects.create(
            user=self.user, name='Bike loan', total_amount=120000, monthly_amount=10000,
            total_installments=12, due_day=5, account=self.bank,
        )
        self._tx('expense', 10000, date(2026, 10, 5), linked_payable=loan)
        self._tx('expense', 10000, date(2026, 9, 5), linked_payable=loan)
        self._tx('expense', 10000, date(2026, 11, 5), linked_payable=loan)
        self._tx('expense', 999, date(2026, 11, 6))

        res = self.client.get(f'/api/payables/{loan.id}/payments/')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['kind'], 'payable')
        self.assertEqual(body['direction'], 'owe')
        self.assertEqual(body['name'], 'Bike loan')
        self.assertEqual([p['date'] for p in body['payments']], ['2026-09-05', '2026-10-05', '2026-11-05'])
        self.assertEqual([p['index'] for p in body['payments']], [1, 2, 3])
        self.assertEqual(body['payment_count'], 3)
        self.assertEqual(body['total_paid'], '30000.00')
        self.assertEqual(body['remaining_amount'], '90000.00')
        self.assertEqual(body['installments_done'], 3)
        self.assertFalse(body['paid_in_full'])
        self.assertFalse(body['closed_without_full_payment'])
        self._assert_adds_up(body)

    def test_payable_paid_in_full(self):
        loan = PayableInstallment.objects.create(
            user=self.user, name='Phone', total_amount=20000, monthly_amount=10000,
            total_installments=2, account=self.bank,
        )
        self._tx('expense', 10000, date(2026, 10, 1), linked_payable=loan)
        self._tx('expense', 10000, date(2026, 11, 1), linked_payable=loan)

        body = self.client.get(f'/api/payables/{loan.id}/payments/').json()
        self.assertEqual(body['status'], 'completed')
        self.assertEqual(body['remaining_amount'], '0.00')
        self.assertTrue(body['paid_in_full'])
        self.assertFalse(body['closed_without_full_payment'])

    def test_payable_closed_by_old_mark_complete_shows_real_remaining(self):
        loan = PayableInstallment.objects.create(
            user=self.user, name='Old loan', total_amount=50000, monthly_amount=10000,
            total_installments=5, account=self.bank,
        )
        self._tx('expense', 10000, date(2026, 10, 1), linked_payable=loan)
        PayableInstallment.objects.filter(pk=loan.pk).update(status='completed')

        body = self.client.get(f'/api/payables/{loan.id}/payments/').json()
        self.assertEqual(body['status'], 'completed')
        self.assertEqual(body['remaining_amount'], '40000.00')
        self.assertFalse(body['paid_in_full'])
        self.assertTrue(body['closed_without_full_payment'])
        self._assert_adds_up(body)

    def test_payable_with_no_payments(self):
        loan = PayableInstallment.objects.create(
            user=self.user, name='New loan', total_amount=30000, monthly_amount=10000,
            total_installments=3, account=self.bank,
        )
        body = self.client.get(f'/api/payables/{loan.id}/payments/').json()
        self.assertEqual(body['payments'], [])
        self.assertEqual(body['total_paid'], '0.00')
        self.assertEqual(body['remaining_amount'], '30000.00')

    def test_deleted_payment_disappears(self):
        loan = PayableInstallment.objects.create(
            user=self.user, name='Bike loan', total_amount=30000, monthly_amount=10000,
            total_installments=3, account=self.bank,
        )
        self._tx('expense', 10000, date(2026, 10, 1), linked_payable=loan)
        second = self._tx('expense', 10000, date(2026, 11, 1), linked_payable=loan)
        second.delete()

        body = self.client.get(f'/api/payables/{loan.id}/payments/').json()
        self.assertEqual(len(body['payments']), 1)
        self.assertEqual(body['remaining_amount'], '20000.00')
        self._assert_adds_up(body)

    # Owed to you

    def test_receivable_includes_income_linked_through_project(self):
        project = Project.objects.create(
            user=self.user, name='Ali — laptop sale', income_type='one_time_installments',
            amount=60000, installment_amount=20000, start_date=date(2026, 9, 1),
        )
        plan = ReceivableInstallment.objects.create(
            user=self.user, linked_project=project, total_amount=60000, monthly_amount=20000,
            total_installments=3, start_date=date(2026, 9, 1),
        )
        self._tx('income', 20000, date(2026, 9, 10), linked_receivable=plan)
        self._tx('income', 15000, date(2026, 10, 10), linked_project=project)

        body = self.client.get(f'/api/receivables/{plan.id}/payments/').json()
        self.assertEqual(body['kind'], 'receivable')
        self.assertEqual(body['direction'], 'owed')
        self.assertEqual(body['name'], 'Ali — laptop sale')
        self.assertEqual(len(body['payments']), 2)
        self.assertEqual(body['total_paid'], '35000.00')
        self.assertEqual(body['remaining_amount'], '25000.00')
        plan.refresh_from_db()
        self.assertEqual(_d(body['remaining_amount']), _d(plan.remaining_amount))
        self._assert_adds_up(body)

    def test_one_time_project_shows_advance_as_first_row(self):
        project = Project.objects.create(
            user=self.user, name='Website for Ahmed', income_type='one_time',
            amount=100000, advance_amount=30000, start_date=date(2026, 8, 1),
        )
        self._tx('income', 20000, date(2026, 9, 15), linked_project=project)
        self._tx('income', 10000, date(2026, 10, 15), linked_project=project)

        body = self.client.get(f'/api/projects/{project.id}/payments/').json()
        self.assertEqual(body['kind'], 'project')
        first = body['payments'][0]
        self.assertTrue(first['is_advance'])
        self.assertIsNone(first['transaction_id'])
        self.assertEqual(first['amount'], '30000.00')
        self.assertEqual(first['date'], '2026-08-01')
        self.assertEqual([p['index'] for p in body['payments']], [1, 2, 3])
        self.assertEqual(body['payment_count'], 2)
        self.assertEqual(body['advance_amount'], '30000.00')
        self.assertEqual(body['total_paid'], '60000.00')
        self.assertEqual(body['remaining_amount'], '40000.00')
        self._assert_adds_up(body)

    def test_project_endpoint_rejects_non_one_time_projects(self):
        project = Project.objects.create(
            user=self.user, name='Salary', income_type='recurring_monthly',
            amount=150000, start_date=date(2026, 1, 1),
        )
        self.assertEqual(self.client.get(f'/api/projects/{project.id}/payments/').status_code, 400)

    # Access

    def test_other_users_records_return_404(self):
        loan = PayableInstallment.objects.create(
            user=self.other, name='Not yours', total_amount=1000, monthly_amount=100,
            total_installments=10,
        )
        project = Project.objects.create(
            user=self.other, name='Not yours', income_type='one_time',
            amount=1000, start_date=date(2026, 1, 1),
        )
        plan = ReceivableInstallment.objects.create(
            user=self.other, linked_project=project, total_amount=1000, monthly_amount=100,
            total_installments=10, start_date=date(2026, 1, 1),
        )
        self.assertEqual(self.client.get(f'/api/payables/{loan.id}/payments/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/receivables/{plan.id}/payments/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/projects/{project.id}/payments/').status_code, 404)

    def test_requires_login(self):
        loan = PayableInstallment.objects.create(
            user=self.user, name='Bike loan', total_amount=1000, monthly_amount=100,
            total_installments=10,
        )
        self.assertEqual(APIClient().get(f'/api/payables/{loan.id}/payments/').status_code, 401)

    def test_pro_flag_blocks_free_users_and_allows_pro(self):
        loan = PayableInstallment.objects.create(
            user=self.user, name='Bike loan', total_amount=1000, monthly_amount=100,
            total_installments=10,
        )
        url = f'/api/payables/{loan.id}/payments/'
        self.assertEqual(self.client.get(url).status_code, 200)

        cfg = AppRemoteConfig.get_solo()
        cfg.feature_flags = {'enforce_pro_slips': True}
        cfg.save()

        blocked = self.client.get(url)
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()['code'], 'pro_required')

        Entitlement.objects.create(user=self.user, started_at=timezone.now(), expires_at=None)
        self.assertEqual(self.client.get(url).status_code, 200)
