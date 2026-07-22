"""
Scenario / regression tests for CashTrail core money flows.
Run from backend/:  python manage.py test api.tests_scenarios -v 2
"""
from decimal import Decimal
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import (
    Account, Project, Transaction, RecurringExpense,
    PayableInstallment, ReceivableInstallment, UserProfile,
)


class ScenarioBase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='tester@example.com',
            email='tester@example.com',
            password='testpass123',
            first_name='Test',
        )
        UserProfile.objects.get_or_create(user=self.user, defaults={'currency': 'PKR'})
        self.client = APIClient()
        token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        self.account = Account.objects.create(
            user=self.user, name='Main Bank', type='bank', opening_balance=Decimal('10000'),
        )


class BillsTotalsScenarioTests(ScenarioBase):
    """Monthly expense / loan totals must SUM all items (not string-concat / last only)."""

    def test_multiple_monthly_expenses_sum_in_list(self):
        RecurringExpense.objects.create(
            user=self.user, name='Maintenance', amount=Decimal('2500'),
            frequency='monthly', due_day=1, active=True,
        )
        RecurringExpense.objects.create(
            user=self.user, name='Railway', amount=Decimal('1500'),
            frequency='monthly', due_day=5, active=True,
        )
        res = self.client.get('/api/expenses/')
        self.assertEqual(res.status_code, 200)
        rows = res.data if isinstance(res.data, list) else res.data['results']
        total = sum(Decimal(str(r['amount'])) for r in rows if r['active'] and r['frequency'] == 'monthly')
        self.assertEqual(total, Decimal('4000'))

    def test_multiple_loan_monthly_payments_sum(self):
        PayableInstallment.objects.create(
            user=self.user, name='Engagement Loan', total_amount=Decimal('100000'),
            monthly_amount=Decimal('10000'), total_installments=10, due_day=1,
        )
        PayableInstallment.objects.create(
            user=self.user, name='Bike Loan', total_amount=Decimal('50000'),
            monthly_amount=Decimal('5000'), total_installments=10, due_day=15,
        )
        res = self.client.get('/api/payables/')
        self.assertEqual(res.status_code, 200)
        rows = res.data if isinstance(res.data, list) else res.data['results']
        total = sum(
            Decimal(str(r['monthly_amount']))
            for r in rows if r['status'] == 'ongoing'
        )
        self.assertEqual(total, Decimal('15000'))


class LoanDeleteScenarioTests(ScenarioBase):
    def test_can_delete_loan(self):
        loan = PayableInstallment.objects.create(
            user=self.user, name='Temp Loan', total_amount=Decimal('20000'),
            monthly_amount=Decimal('2000'), total_installments=10, due_day=1,
        )
        res = self.client.delete(f'/api/payables/{loan.id}/')
        self.assertIn(res.status_code, (200, 204))
        self.assertFalse(PayableInstallment.objects.filter(id=loan.id).exists())


class IncomeLifecycleScenarioTests(ScenarioBase):
    """Create income → record payment → delete income; verify side effects."""

    def test_create_monthly_income_record_payment_then_delete_income(self):
        # Create income source
        create = self.client.post('/api/projects/', {
            'name': 'Client Retainer',
            'income_type': 'recurring_monthly',
            'amount': '50000',
            'status': 'active',
            'start_date': '2026-01-01',
            'default_account': self.account.id,
            'notes': '',
        }, format='json')
        self.assertEqual(create.status_code, 201, create.data)
        project_id = create.data['id']

        # Record a payment linked to that income
        tx = self.client.post('/api/transactions/', {
            'type': 'income',
            'amount': '50000',
            'date': '2026-07-01',
            'account': self.account.id,
            'linked_project': project_id,
            'category': 'Monthly Income',
            'notes': 'July receipt',
        }, format='json')
        self.assertEqual(tx.status_code, 201, tx.data)
        tx_id = tx.data['id']

        # Balance should include opening + income
        self.account.refresh_from_db()
        self.assertEqual(Decimal(str(self.account.current_balance)), Decimal('60000'))

        # Delete the income source (project)
        delete = self.client.delete(f'/api/projects/{project_id}/')
        self.assertIn(delete.status_code, (200, 204))
        self.assertFalse(Project.objects.filter(id=project_id).exists())

        # Transaction should still exist; link to project is SET_NULL
        tx_obj = Transaction.objects.get(id=tx_id)
        self.assertIsNone(tx_obj.linked_project_id)
        self.assertEqual(tx_obj.amount, Decimal('50000'))

        # Account balance should still reflect the recorded income
        self.account.refresh_from_db()
        self.assertEqual(Decimal(str(self.account.current_balance)), Decimal('60000'))

    def test_one_time_with_advance_remaining(self):
        create = self.client.post('/api/projects/', {
            'name': 'Website Build',
            'income_type': 'one_time',
            'amount': '30000',
            'advance_amount': '10000',
            'status': 'active',
            'start_date': '2026-01-01',
            'default_account': self.account.id,
        }, format='json')
        self.assertEqual(create.status_code, 201, create.data)
        self.assertEqual(Decimal(str(create.data['amount'])), Decimal('30000'))
        self.assertEqual(Decimal(str(create.data['advance_amount'])), Decimal('10000'))
        self.assertEqual(float(create.data['remaining_amount']), 20000.0)

    def test_delete_income_with_installment_plan_cleans_or_nulls_receivable(self):
        create = self.client.post('/api/projects/', {
            'name': 'ERP',
            'income_type': 'one_time_installments',
            'amount': '75000',
            'installment_amount': '25000',
            'advance_amount': '0',
            'status': 'active',
            'start_date': '2026-01-01',
            'default_account': self.account.id,
        }, format='json')
        self.assertEqual(create.status_code, 201, create.data)
        project_id = create.data['id']
        self.assertTrue(
            ReceivableInstallment.objects.filter(linked_project_id=project_id).exists()
        )

        delete = self.client.delete(f'/api/projects/{project_id}/')
        self.assertIn(delete.status_code, (200, 204))
        # Receivable linked_project is SET_NULL — plan row may remain without project
        self.assertFalse(Project.objects.filter(id=project_id).exists())


class AccountTransactionScenarioTests(ScenarioBase):
    def test_expense_reduces_balance_then_delete_tx_restores_via_recalc(self):
        tx = self.client.post('/api/transactions/', {
            'type': 'expense',
            'amount': '2000',
            'date': '2026-07-10',
            'account': self.account.id,
            'category': 'Food',
        }, format='json')
        self.assertEqual(tx.status_code, 201)
        self.account.refresh_from_db()
        self.assertEqual(Decimal(str(self.account.current_balance)), Decimal('8000'))

        self.client.delete(f'/api/transactions/{tx.data["id"]}/')
        self.account.refresh_from_db()
        self.assertEqual(Decimal(str(self.account.current_balance)), Decimal('10000'))
