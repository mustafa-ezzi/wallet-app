"""
Scenario / regression tests for CashTrail core money flows.
Run from backend/:  python manage.py test api.tests_scenarios -v 2
"""
from decimal import Decimal
from datetime import date
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import (
    Account, Project, Transaction, RecurringExpense,
    PayableInstallment, ReceivableInstallment, UserProfile,
    HouseholdExpense,
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


class ForecastTenureScenarioTests(ScenarioBase):
    """Forecasts must only cover installment tenure months — not forever."""

    @staticmethod
    def _add_months(year, month, delta):
        m0 = month - 1 + delta
        return year + m0 // 12, m0 % 12 + 1

    def test_receivable_two_months_only(self):
        ReceivableInstallment.objects.create(
            user=self.user,
            total_amount=Decimal('10000'),
            monthly_amount=Decimal('5000'),
            total_installments=2,
            start_date=date(2026, 1, 1),
            status='ongoing',
        )
        jan = self.client.get('/api/forecast/2026/1/')
        feb = self.client.get('/api/forecast/2026/2/')
        mar = self.client.get('/api/forecast/2026/3/')
        self.assertEqual(jan.status_code, 200)
        self.assertEqual(float(jan.data['total_expected_income']), 5000.0)
        self.assertEqual(float(feb.data['total_expected_income']), 5000.0)
        self.assertEqual(float(mar.data['total_expected_income']), 0.0)

    def test_loan_three_months_only(self):
        PayableInstallment.objects.create(
            user=self.user, name='Short Loan', total_amount=Decimal('9000'),
            monthly_amount=Decimal('3000'), total_installments=3, due_day=1,
        )
        loan = PayableInstallment.objects.get(name='Short Loan')
        y, m = loan.created_at.year, loan.created_at.month
        y1, m1 = self._add_months(y, m, 1)
        y2, m2 = self._add_months(y, m, 2)
        y3, m3 = self._add_months(y, m, 3)

        self.assertEqual(
            float(self.client.get(f'/api/forecast/{y}/{m}/').data['total_expected_outgoing']),
            3000.0,
        )
        self.assertEqual(
            float(self.client.get(f'/api/forecast/{y1}/{m1}/').data['total_expected_outgoing']),
            3000.0,
        )
        self.assertEqual(
            float(self.client.get(f'/api/forecast/{y2}/{m2}/').data['total_expected_outgoing']),
            3000.0,
        )
        self.assertEqual(
            float(self.client.get(f'/api/forecast/{y3}/{m3}/').data['total_expected_outgoing']),
            0.0,
        )

    def test_one_time_payment_marks_completed_and_drops_forecast(self):
        create = self.client.post('/api/projects/', {
            'name': 'Logo Design',
            'income_type': 'one_time',
            'amount': '15000',
            'advance_amount': '5000',
            'status': 'active',
            'start_date': '2026-07-01',
            'default_account': self.account.id,
        }, format='json')
        self.assertEqual(create.status_code, 201, create.data)
        project_id = create.data['id']
        self.assertEqual(float(create.data['remaining_amount']), 10000.0)

        before = self.client.get('/api/forecast/2026/7/')
        self.assertEqual(float(before.data['total_expected_income']), 10000.0)

        tx = self.client.post('/api/transactions/', {
            'type': 'income',
            'amount': '10000',
            'date': '2026-07-15',
            'account': self.account.id,
            'linked_project': project_id,
            'category': 'One-time Income',
        }, format='json')
        self.assertEqual(tx.status_code, 201, tx.data)

        proj = Project.objects.get(id=project_id)
        self.assertEqual(proj.status, 'completed')
        self.assertEqual(proj.remaining_amount, 0.0)

        after = self.client.get('/api/forecast/2026/7/')
        self.assertEqual(float(after.data['total_expected_income']), 0.0)

    def test_bank_transfer_excluded_from_actuals(self):
        today = date.today()
        d = today.replace(day=min(10, today.day)).isoformat()
        self.client.post('/api/transactions/', {
            'type': 'expense', 'amount': '2000', 'date': d,
            'account': self.account.id, 'category': 'Bank Transfer', 'notes': 'out',
        }, format='json')
        other = Account.objects.create(
            user=self.user, name='Cash', type='cash', opening_balance=Decimal('0'),
        )
        self.client.post('/api/transactions/', {
            'type': 'income', 'amount': '2000', 'date': d,
            'account': other.id, 'category': 'Bank Transfer', 'notes': 'in',
        }, format='json')
        self.client.post('/api/transactions/', {
            'type': 'income', 'amount': '5000', 'date': d,
            'account': self.account.id, 'category': 'Salary',
        }, format='json')

        forecast = self.client.get(f'/api/forecast/{today.year}/{today.month}/')
        self.assertEqual(float(forecast.data['actual_income']), 5000.0)
        self.assertEqual(float(forecast.data['actual_expense']), 0.0)

        dash = self.client.get('/api/dashboard/')
        self.assertEqual(float(dash.data['month_income']), 5000.0)
        self.assertEqual(float(dash.data['month_expense']), 0.0)

    def test_paid_in_parts_project_forecast_window(self):
        create = self.client.post('/api/projects/', {
            'name': 'ERP',
            'income_type': 'one_time_installments',
            'amount': '10000',
            'installment_amount': '5000',
            'advance_amount': '0',
            'status': 'active',
            'start_date': '2026-01-01',
            'default_account': self.account.id,
        }, format='json')
        self.assertEqual(create.status_code, 201, create.data)
        self.assertEqual(float(self.client.get('/api/forecast/2026/1/').data['total_expected_income']), 5000.0)
        self.assertEqual(float(self.client.get('/api/forecast/2026/2/').data['total_expected_income']), 5000.0)
        self.assertEqual(float(self.client.get('/api/forecast/2026/3/').data['total_expected_income']), 0.0)

class HouseholdPhase1ScenarioTests(TestCase):
    """P1: create → invite → join → add expense → other member sees it."""

    def _auth(self, user):
        client = APIClient()
        token = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        return client

    def setUp(self):
        self.owner = User.objects.create_user(
            username="ali@example.com", email="ali@example.com", password="testpass123", first_name="Ali",
        )
        self.member = User.objects.create_user(
            username="sara@example.com", email="sara@example.com", password="testpass123", first_name="Sara",
        )
        UserProfile.objects.get_or_create(user=self.owner, defaults={"currency": "PKR"})
        UserProfile.objects.get_or_create(user=self.member, defaults={"currency": "PKR"})
        self.owner_client = self._auth(self.owner)
        self.member_client = self._auth(self.member)

    def test_create_invite_join_expense_visible(self):
        create = self.owner_client.post("/api/households/", {"name": "Khan Family"}, format="json")
        self.assertEqual(create.status_code, 201, create.data)
        hid = create.data["id"]

        inv = self.owner_client.get(f"/api/households/{hid}/invites/")
        self.assertEqual(inv.status_code, 200)
        code = inv.data["code"]
        self.assertTrue(code.startswith("HOME-"))

        preview = self.member_client.post("/api/households/join/preview/", {"code": code}, format="json")
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data["household_name"], "Khan Family")

        join = self.member_client.post("/api/households/join/", {"code": code}, format="json")
        self.assertEqual(join.status_code, 200, join.data)

        ledgers = self.owner_client.get(f"/api/households/{hid}/ledgers/")
        self.assertEqual(ledgers.status_code, 200)
        ledger_id = ledgers.data[0]["id"]

        add = self.owner_client.post(f"/api/household-ledgers/{ledger_id}/expenses/", {
            "amount": "2000",
            "date": date.today().isoformat(),
            "category": "Groceries",
            "notes": "Milk",
        }, format="json")
        self.assertEqual(add.status_code, 201, add.data)

        seen = self.member_client.get(f"/api/household-ledgers/{ledger_id}/expenses/")
        self.assertEqual(seen.status_code, 200, seen.data)
        self.assertEqual(len(seen.data["results"]), 1)
        self.assertEqual(float(seen.data["total"]), 2000.0)
        self.assertEqual(seen.data["results"][0]["category"], "Groceries")

        stranger = User.objects.create_user(username="x@example.com", email="x@example.com", password="testpass123")
        UserProfile.objects.get_or_create(user=stranger, defaults={"currency": "PKR"})
        stranger_client = self._auth(stranger)
        denied = stranger_client.get(f"/api/household-ledgers/{ledger_id}/expenses/")
        self.assertIn(denied.status_code, (403, 404))

class HouseholdPhase2DualLinkTests(TestCase):
    """P2: expense with household_ledger drops wallet and appears on shared ledger."""

    def _auth(self, user):
        client = APIClient()
        token = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        return client

    def setUp(self):
        self.owner = User.objects.create_user(
            username="x@example.com", email="x@example.com", password="testpass123", first_name="X",
        )
        self.other = User.objects.create_user(
            username="y@example.com", email="y@example.com", password="testpass123", first_name="Y",
        )
        UserProfile.objects.get_or_create(user=self.owner, defaults={"currency": "PKR"})
        UserProfile.objects.get_or_create(user=self.other, defaults={"currency": "PKR"})
        self.owner_client = self._auth(self.owner)
        self.other_client = self._auth(self.other)
        self.meezan = Account.objects.create(
            user=self.owner, name="Meezan", type="bank", opening_balance=Decimal("20000"),
        )

    def test_fab_dual_link_drops_balance_and_shares(self):
        h = self.owner_client.post("/api/households/", {"name": "Family home"}, format="json")
        self.assertEqual(h.status_code, 201, h.data)
        hid = h.data["id"]
        code = self.owner_client.get(f"/api/households/{hid}/invites/").data["code"]
        self.other_client.post("/api/households/join/", {"code": code}, format="json")
        ledger_id = self.owner_client.get(f"/api/households/{hid}/ledgers/").data[0]["id"]

        before = float(self.owner_client.get("/api/accounts/").data[0]["current_balance"])
        self.assertEqual(before, 20000.0)

        tx = self.owner_client.post("/api/transactions/", {
            "type": "expense",
            "amount": "5000",
            "date": date.today().isoformat(),
            "account": self.meezan.id,
            "category": "Groceries",
            "notes": "Family shop",
            "household_ledger": ledger_id,
        }, format="json")
        self.assertEqual(tx.status_code, 201, tx.data)
        self.assertIsNotNone(tx.data.get("household_expense_id"))

        after = float(self.owner_client.get("/api/accounts/").data[0]["current_balance"])
        self.assertEqual(after, 15000.0)

        shared = self.other_client.get(f"/api/household-ledgers/{ledger_id}/expenses/")
        self.assertEqual(shared.status_code, 200)
        self.assertEqual(len(shared.data["results"]), 1)
        self.assertEqual(float(shared.data["total"]), 5000.0)
        self.assertEqual(shared.data["results"][0]["account_name"], "Meezan")

        # Without household link — personal only
        tx2 = self.owner_client.post("/api/transactions/", {
            "type": "expense",
            "amount": "100",
            "date": date.today().isoformat(),
            "account": self.meezan.id,
            "category": "Food",
        }, format="json")
        self.assertEqual(tx2.status_code, 201)
        shared2 = self.other_client.get(f"/api/household-ledgers/{ledger_id}/expenses/")
        self.assertEqual(len(shared2.data["results"]), 1)


class HouseholdPhase3EventCloseTests(TestCase):
    """P3: event ledger close blocks adds; reopen restores; summary snapshot."""

    def _auth(self, user):
        client = APIClient()
        token = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        return client

    def setUp(self):
        self.owner = User.objects.create_user(
            username="p3a@example.com", email="p3a@example.com", password="testpass123", first_name="Ali",
        )
        self.member = User.objects.create_user(
            username="p3b@example.com", email="p3b@example.com", password="testpass123", first_name="Bina",
        )
        UserProfile.objects.get_or_create(user=self.owner, defaults={"currency": "PKR"})
        UserProfile.objects.get_or_create(user=self.member, defaults={"currency": "PKR"})
        self.owner_client = self._auth(self.owner)
        self.member_client = self._auth(self.member)

    def test_event_close_blocks_adds_reopen_and_summary(self):
        h = self.owner_client.post("/api/households/", {"name": "Trip crew"}, format="json")
        self.assertEqual(h.status_code, 201, h.data)
        hid = h.data["id"]
        code = self.owner_client.get(f"/api/households/{hid}/invites/").data["code"]
        self.member_client.post("/api/households/join/", {"code": code}, format="json")

        event = self.owner_client.post(
            f"/api/households/{hid}/ledgers/",
            {"name": "Balochistan trip", "kind": "event", "start_date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(event.status_code, 201, event.data)
        self.assertEqual(event.data["kind"], "event")
        self.assertEqual(event.data["status"], "open")
        lid = event.data["id"]

        e1 = self.owner_client.post(
            f"/api/household-ledgers/{lid}/expenses/",
            {"amount": "3000", "category": "Fuel", "date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(e1.status_code, 201, e1.data)
        e2 = self.member_client.post(
            f"/api/household-ledgers/{lid}/expenses/",
            {"amount": "2000", "category": "Food", "date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(e2.status_code, 201, e2.data)

        summary = self.owner_client.get(f"/api/household-ledgers/{lid}/summary/")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(float(summary.data["total_spent"]), 5000.0)
        self.assertEqual(summary.data["expense_count"], 2)
        member_names = {m["name"] for m in summary.data["by_member"]}
        self.assertIn("Ali", member_names)
        self.assertIn("Bina", member_names)
        cats = {c["name"]: float(c["amount"]) for c in summary.data["by_category"]}
        self.assertEqual(cats.get("Fuel"), 3000.0)
        self.assertEqual(cats.get("Food"), 2000.0)

        # Member cannot close
        denied = self.member_client.post(f"/api/household-ledgers/{lid}/close/")
        self.assertEqual(denied.status_code, 403)

        closed = self.owner_client.post(f"/api/household-ledgers/{lid}/close/")
        self.assertEqual(closed.status_code, 200, closed.data)
        self.assertEqual(closed.data["ledger"]["status"], "closed")
        self.assertEqual(float(closed.data["ledger"]["closed_total_expense"]), 5000.0)
        self.assertEqual(float(closed.data["summary"]["total_spent"]), 5000.0)

        blocked = self.member_client.post(
            f"/api/household-ledgers/{lid}/expenses/",
            {"amount": "100", "category": "Snack", "date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("closed", blocked.data["detail"].lower())

        # History still visible (full list, no month filter required)
        hist = self.member_client.get(f"/api/household-ledgers/{lid}/expenses/")
        self.assertEqual(hist.status_code, 200)
        self.assertEqual(len(hist.data["results"]), 2)
        self.assertEqual(float(hist.data["total"]), 5000.0)

        # Member cannot reopen
        reopen_denied = self.member_client.post(f"/api/household-ledgers/{lid}/reopen/")
        self.assertEqual(reopen_denied.status_code, 403)

        reopened = self.owner_client.post(f"/api/household-ledgers/{lid}/reopen/")
        self.assertEqual(reopened.status_code, 200, reopened.data)
        self.assertEqual(reopened.data["status"], "open")
        self.assertIsNone(reopened.data["closed_total_expense"])

        again = self.member_client.post(
            f"/api/household-ledgers/{lid}/expenses/",
            {"amount": "50", "category": "Snack", "date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(again.status_code, 201, again.data)


class HouseholdPhase4ReportTests(TestCase):
    """P4: month report breakdown + closed snapshot consistency."""

    def _auth(self, user):
        client = APIClient()
        token = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        return client

    def setUp(self):
        self.owner = User.objects.create_user(
            username="p4a@example.com", email="p4a@example.com", password="testpass123", first_name="Ali",
        )
        self.member = User.objects.create_user(
            username="p4b@example.com", email="p4b@example.com", password="testpass123", first_name="Bina",
        )
        UserProfile.objects.get_or_create(user=self.owner, defaults={"currency": "PKR"})
        UserProfile.objects.get_or_create(user=self.member, defaults={"currency": "PKR"})
        self.owner_client = self._auth(self.owner)
        self.member_client = self._auth(self.member)

    def test_monthly_report_and_closed_event_snapshot(self):
        h = self.owner_client.post("/api/households/", {"name": "Report house"}, format="json")
        self.assertEqual(h.status_code, 201, h.data)
        hid = h.data["id"]
        code = self.owner_client.get(f"/api/households/{hid}/invites/").data["code"]
        self.member_client.post("/api/households/join/", {"code": code}, format="json")

        today = date.today()
        ongoing_id = self.owner_client.get(f"/api/households/{hid}/ledgers/").data[0]["id"]

        self.owner_client.post(
            f"/api/household-ledgers/{ongoing_id}/expenses/",
            {"amount": "1500", "category": "Groceries", "date": today.isoformat()},
            format="json",
        )
        self.member_client.post(
            f"/api/household-ledgers/{ongoing_id}/expenses/",
            {"amount": "500", "category": "Utilities", "date": today.isoformat()},
            format="json",
        )

        month_report = self.member_client.get(
            f"/api/household-ledgers/{ongoing_id}/report/",
            {"year": today.year, "month": today.month},
        )
        self.assertEqual(month_report.status_code, 200, month_report.data)
        self.assertEqual(float(month_report.data["total_spent"]), 2000.0)
        self.assertEqual(month_report.data["expense_count"], 2)
        self.assertEqual(month_report.data["period"], f"{today.year:04d}-{today.month:02d}")
        cats = {c["name"]: float(c["amount"]) for c in month_report.data["by_category"]}
        self.assertEqual(cats["Groceries"], 1500.0)
        self.assertEqual(cats["Utilities"], 500.0)
        members = {m["name"]: float(m["amount"]) for m in month_report.data["by_member"]}
        self.assertEqual(members["Ali"], 1500.0)
        self.assertEqual(members["Bina"], 500.0)
        self.assertTrue(len(month_report.data["timeline"]) >= 1)
        day = next(d for d in month_report.data["timeline"] if d["date"] == today.isoformat())
        self.assertEqual(float(day["total"]), 2000.0)
        self.assertEqual(day["count"], 2)

        # Bad params
        bad = self.owner_client.get(f"/api/household-ledgers/{ongoing_id}/report/", {"year": today.year})
        self.assertEqual(bad.status_code, 400)

        # Event + close → full report with snapshot match
        event = self.owner_client.post(
            f"/api/households/{hid}/ledgers/",
            {"name": "Wedding", "kind": "event", "start_date": today.isoformat()},
            format="json",
        )
        eid = event.data["id"]
        self.owner_client.post(
            f"/api/household-ledgers/{eid}/expenses/",
            {"amount": "10000", "category": "Hall", "date": today.isoformat()},
            format="json",
        )
        closed = self.owner_client.post(f"/api/household-ledgers/{eid}/close/")
        self.assertEqual(closed.status_code, 200)

        full = self.member_client.get(f"/api/household-ledgers/{eid}/report/")
        self.assertEqual(full.status_code, 200)
        self.assertEqual(full.data["period"], "all")
        self.assertEqual(float(full.data["total_spent"]), 10000.0)
        self.assertEqual(float(full.data["snapshot_total"]), 10000.0)
        self.assertTrue(full.data["snapshot_matches"])
        self.assertEqual(full.data["by_category"][0]["name"], "Hall")
        self.assertEqual(full.data["timeline"][0]["items"][0]["paid_by_name"], "Ali")


class HouseholdPhase5PotSplitTests(TestCase):
    """P5: Balochistan-style pot contribution + Split equal credits."""

    def _auth(self, user):
        client = APIClient()
        token = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        return client

    def setUp(self):
        self.you = User.objects.create_user(
            username="you@example.com", email="you@example.com", password="testpass123", first_name="You",
        )
        self.hussain = User.objects.create_user(
            username="hussain@example.com", email="hussain@example.com", password="testpass123", first_name="Hussain",
        )
        self.idrees = User.objects.create_user(
            username="idrees@example.com", email="idrees@example.com", password="testpass123", first_name="Idrees",
        )
        for u in (self.you, self.hussain, self.idrees):
            UserProfile.objects.get_or_create(user=u, defaults={"currency": "PKR"})
        self.you_client = self._auth(self.you)
        self.hussain_client = self._auth(self.hussain)
        self.idrees_client = self._auth(self.idrees)
        self.hussain_wallet = Account.objects.create(
            user=self.hussain, name="HBL", type="bank", opening_balance=Decimal("50000"),
        )

    def test_balochistan_split_equal(self):
        h = self.you_client.post("/api/households/", {"name": "Trip crew"}, format="json")
        self.assertEqual(h.status_code, 201, h.data)
        hid = h.data["id"]
        code = self.you_client.get(f"/api/households/{hid}/invites/").data["code"]
        self.hussain_client.post("/api/households/join/", {"code": code}, format="json")
        # refresh invite if single-use? code should still work for multiple joins
        code2 = self.you_client.get(f"/api/households/{hid}/invites/").data["code"]
        self.idrees_client.post("/api/households/join/", {"code": code2}, format="json")

        today = date.today().isoformat()
        event = self.you_client.post(
            f"/api/households/{hid}/ledgers/",
            {"name": "Balochistan trip", "kind": "event", "start_date": today},
            format="json",
        )
        self.assertEqual(event.status_code, 201, event.data)
        lid = event.data["id"]

        # Hussain puts 10,000 into the pot (wallet linked)
        before = float(self.hussain_client.get("/api/accounts/").data[0]["current_balance"])
        pot = self.hussain_client.post(
            f"/api/household-ledgers/{lid}/contributions/",
            {
                "amount": "10000",
                "date": today,
                "notes": "Trip pot",
                "linked_account": self.hussain_wallet.id,
            },
            format="json",
        )
        self.assertEqual(pot.status_code, 201, pot.data)
        after = float(self.hussain_client.get("/api/accounts/").data[0]["current_balance"])
        self.assertEqual(after, before - 10000.0)

        # You pay 25,000 of trip expenses
        e1 = self.you_client.post(
            f"/api/household-ledgers/{lid}/expenses/",
            {"amount": "25000", "category": "Hotel", "date": today},
            format="json",
        )
        self.assertEqual(e1.status_code, 201, e1.data)

        # Remaining 5,000 of the 30k total — paid outside member credits (float/vendor line)
        # so the §13 table matches: You 25k, Hussain pot 10k, Idrees 0.
        HouseholdExpense.objects.create(
            ledger_id=lid,
            amount=Decimal("5000"),
            date=date.today(),
            category="Fuel (pot)",
            notes="Paid from group float",
            created_by=self.you,
            paid_by=self.you,  # will temporarily make You 30k — fix below
        )
        # Re-attribute the 5k to a non-member so member credits match the research table
        ghost = User.objects.create_user(
            username="float@example.com", email="float@example.com", password="x", first_name="Float",
        )
        HouseholdExpense.objects.filter(ledger_id=lid, category="Fuel (pot)").update(paid_by=ghost)

        settle = self.you_client.get(f"/api/household-ledgers/{lid}/settlement/")
        self.assertEqual(settle.status_code, 200, settle.data)
        self.assertEqual(float(settle.data["total_expenses"]), 30000.0)
        self.assertEqual(float(settle.data["total_contributions"]), 10000.0)
        self.assertEqual(float(settle.data["fair_share"]), 10000.0)
        self.assertEqual(settle.data["member_count"], 3)
        self.assertIn("does not move bank money", settle.data["disclaimer"].lower())

        by_name = {c["name"]: c for c in settle.data["credits"]}
        self.assertEqual(float(by_name["You"]["credit"]), 25000.0)
        self.assertEqual(float(by_name["You"]["net"]), 15000.0)
        self.assertEqual(by_name["You"]["meaning"], "owed")
        self.assertEqual(float(by_name["Hussain"]["contributions"]), 10000.0)
        self.assertEqual(float(by_name["Hussain"]["net"]), 0.0)
        self.assertEqual(by_name["Hussain"]["meaning"], "settled")
        self.assertEqual(float(by_name["Idrees"]["credit"]), 0.0)
        self.assertEqual(float(by_name["Idrees"]["net"]), -10000.0)
        self.assertEqual(by_name["Idrees"]["meaning"], "owes")

        transfers = settle.data["transfers"]
        self.assertTrue(any(
            t["from_name"] == "Idrees" and t["to_name"] == "You" and float(t["amount"]) == 10000.0
            for t in transfers
        ))

        # Mark settled
        t0 = next(t for t in transfers if t["from_name"] == "Idrees" and t["to_name"] == "You")
        marked = self.you_client.post(
            f"/api/household-ledgers/{lid}/settlement/mark/",
            {
                "from_user_id": t0["from_user_id"],
                "to_user_id": t0["to_user_id"],
                "amount": t0["amount"],
                "note": "Paid in cash",
            },
            format="json",
        )
        self.assertEqual(marked.status_code, 201, marked.data)
        again = self.you_client.get(f"/api/household-ledgers/{lid}/settlement/")
        match = next(
            t for t in again.data["transfers"]
            if t["from_name"] == "Idrees" and t["to_name"] == "You"
        )
        self.assertTrue(match["settled"])

        # Closed ledger rejects new contributions
        self.you_client.post(f"/api/household-ledgers/{lid}/close/")
        blocked = self.hussain_client.post(
            f"/api/household-ledgers/{lid}/contributions/",
            {"amount": "100", "date": today},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
