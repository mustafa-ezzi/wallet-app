"""
Budget feature tests — personal monthly category limits vs live spend.
Run: py manage.py test api.tests_budgets -v 2
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import Account, CategoryBudget, Transaction, UserProfile


class BudgetApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='budget@example.com',
            email='budget@example.com',
            password='testpass123',
            first_name='Budget',
        )
        UserProfile.objects.get_or_create(user=self.user, defaults={'currency': 'PKR'})
        self.client = APIClient()
        token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        self.account = Account.objects.create(
            user=self.user, name='Meezan', type='bank', opening_balance=Decimal('100000'),
        )
        self.year = date.today().year
        self.month = date.today().month

    def _tx(self, amount, category, *, type_='expense', day=1, people_action=''):
        return Transaction.objects.create(
            user=self.user,
            type=type_,
            amount=Decimal(str(amount)),
            date=date(self.year, self.month, day),
            account=self.account,
            category=category,
            notes='',
            people_action=people_action,
        )

    def test_empty_month_returns_all_categories_unset(self):
        res = self.client.get('/api/budgets/', {'year': self.year, 'month': self.month})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['year'], self.year)
        self.assertEqual(res.data['month'], self.month)
        self.assertEqual(float(res.data['total_spent']), 0.0)
        self.assertIsNone(res.data['total_limit'])
        cats = [r['category'] for r in res.data['rows']]
        self.assertEqual(cats[0], '__all__')
        self.assertIn('Food & Drink', cats)
        self.assertTrue(all(r['status'] == 'unset' for r in res.data['rows']))

    def test_spent_aggregates_and_excludes_transfers_and_people(self):
        self._tx(1000, 'Food & Drink')
        self._tx(500, 'Food & Drink', day=5)
        self._tx(2000, 'Transport')
        self._tx(999, 'Bank Transfer')  # excluded
        self._tx(3000, 'Salary', type_='income')  # excluded
        self._tx(400, 'Food & Drink', people_action='lend')  # excluded

        res = self.client.get('/api/budgets/', {'year': self.year, 'month': self.month})
        self.assertEqual(res.status_code, 200)
        by_cat = {r['category']: r for r in res.data['rows']}
        self.assertEqual(float(by_cat['Food & Drink']['spent']), 1500.0)
        self.assertEqual(float(by_cat['Transport']['spent']), 2000.0)
        self.assertEqual(float(res.data['total_spent']), 3500.0)
        self.assertNotIn('Bank Transfer', by_cat)

    def test_set_limit_and_status_ok_warning_over(self):
        self._tx(5000, 'Food & Drink')
        # ok at 50%
        put = self.client.put('/api/budgets/', {
            'year': self.year, 'month': self.month,
            'category': 'Food & Drink', 'limit_amount': '10000',
        }, format='json')
        self.assertEqual(put.status_code, 200, put.data)
        food = next(r for r in put.data['rows'] if r['category'] == 'Food & Drink')
        self.assertTrue(food['has_limit'])
        self.assertEqual(float(food['limit']), 10000.0)
        self.assertEqual(float(food['remaining']), 5000.0)
        self.assertEqual(food['status'], 'ok')
        self.assertEqual(float(food['percent']), 50.0)

        # warning at 90%
        put2 = self.client.put('/api/budgets/', {
            'year': self.year, 'month': self.month,
            'category': 'Food & Drink', 'limit_amount': '5555.56',
        }, format='json')
        food2 = next(r for r in put2.data['rows'] if r['category'] == 'Food & Drink')
        self.assertEqual(food2['status'], 'warning')

        # over
        put3 = self.client.put('/api/budgets/', {
            'year': self.year, 'month': self.month,
            'category': 'Food & Drink', 'limit_amount': '4000',
        }, format='json')
        food3 = next(r for r in put3.data['rows'] if r['category'] == 'Food & Drink')
        self.assertEqual(food3['status'], 'over')
        self.assertEqual(float(food3['over']), 1000.0)
        self.assertEqual(float(food3['remaining']), 0.0)

    def test_overall_all_budget(self):
        self._tx(8000, 'Shopping')
        res = self.client.put('/api/budgets/', {
            'year': self.year, 'month': self.month,
            'category': '__all__', 'limit_amount': '10000',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        all_row = res.data['rows'][0]
        self.assertEqual(all_row['category'], '__all__')
        self.assertEqual(float(all_row['spent']), 8000.0)
        self.assertEqual(float(all_row['limit']), 10000.0)
        self.assertEqual(float(res.data['overall_limit']), 10000.0)
        self.assertEqual(float(res.data['total_limit']), 10000.0)

    def test_clear_limit_via_put_null_and_delete(self):
        put = self.client.put('/api/budgets/', {
            'year': self.year, 'month': self.month,
            'category': 'Rent', 'limit_amount': '25000',
        }, format='json')
        self.assertEqual(put.status_code, 200)
        budget_id = next(r['id'] for r in put.data['rows'] if r['category'] == 'Rent')
        self.assertIsNotNone(budget_id)

        clear = self.client.put('/api/budgets/', {
            'year': self.year, 'month': self.month,
            'category': 'Rent', 'limit_amount': None,
        }, format='json')
        self.assertEqual(clear.status_code, 200)
        rent = next(r for r in clear.data['rows'] if r['category'] == 'Rent')
        self.assertFalse(rent['has_limit'])
        self.assertFalse(CategoryBudget.objects.filter(user=self.user, category='Rent').exists())

        # re-set then DELETE by id
        put2 = self.client.put('/api/budgets/', {
            'year': self.year, 'month': self.month,
            'category': 'Health', 'limit_amount': '3000',
        }, format='json')
        hid = next(r['id'] for r in put2.data['rows'] if r['category'] == 'Health')
        deleted = self.client.delete(
            f'/api/budgets/{hid}/?year={self.year}&month={self.month}',
        )
        self.assertEqual(deleted.status_code, 200)
        health = next(r for r in deleted.data['rows'] if r['category'] == 'Health')
        self.assertFalse(health['has_limit'])

    def test_copy_from_previous_month(self):
        if self.month == 1:
            prev_year, prev_month = self.year - 1, 12
        else:
            prev_year, prev_month = self.year, self.month - 1

        CategoryBudget.objects.create(
            user=self.user, year=prev_year, month=prev_month,
            category='Grocery', limit_amount=Decimal('12000'),
        )
        CategoryBudget.objects.create(
            user=self.user, year=prev_year, month=prev_month,
            category='__all__', limit_amount=Decimal('50000'),
        )
        res = self.client.post('/api/budgets/copy-from-previous/', {
            'year': self.year, 'month': self.month,
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['copied'], 2)
        self.assertTrue(CategoryBudget.objects.filter(
            user=self.user, year=self.year, month=self.month, category='Grocery',
        ).exists())
        self.assertEqual(float(res.data['overall_limit']), 50000.0)

    def test_copy_fails_when_previous_empty(self):
        res = self.client.post('/api/budgets/copy-from-previous/', {
            'year': self.year, 'month': self.month,
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_invalid_month_rejected(self):
        res = self.client.get('/api/budgets/', {'year': self.year, 'month': 13})
        self.assertEqual(res.status_code, 400)

    def test_other_user_cannot_see_budgets(self):
        other = User.objects.create_user(
            username='other@example.com', email='other@example.com', password='x',
        )
        CategoryBudget.objects.create(
            user=other, year=self.year, month=self.month,
            category='Shopping', limit_amount=Decimal('1000'),
        )
        res = self.client.get('/api/budgets/', {'year': self.year, 'month': self.month})
        shopping = next(r for r in res.data['rows'] if r['category'] == 'Shopping')
        self.assertFalse(shopping['has_limit'])

    def test_legacy_category_with_spend_appears(self):
        self._tx(750, 'Server Charges')
        res = self.client.get('/api/budgets/', {'year': self.year, 'month': self.month})
        cats = [r['category'] for r in res.data['rows']]
        self.assertIn('Server Charges', cats)
        row = next(r for r in res.data['rows'] if r['category'] == 'Server Charges')
        self.assertEqual(float(row['spent']), 750.0)
