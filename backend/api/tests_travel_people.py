"""
Phase A — Travel Mode + People (backend only).
Run:  python manage.py test api.tests_travel_people -v 2
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.fx import convert_to_pkr, get_fx_quote
from api.models import Account, FxRateCache, Transaction, TravelMode, UserProfile


class TravelPeopleBase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='travel@example.com',
            email='travel@example.com',
            password='testpass123',
            first_name='Traveler',
        )
        UserProfile.objects.get_or_create(user=self.user, defaults={'currency': 'PKR'})
        self.client = APIClient()
        token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        self.bank = Account.objects.create(
            user=self.user, name='Meezan', type='bank', opening_balance=Decimal('10000'),
        )
        self.cash = Account.objects.create(
            user=self.user, name='Cash', type='cash', opening_balance=Decimal('2000'),
        )


class PeopleDoubleEntryTests(TravelPeopleBase):
    def test_lend_updates_wallet_and_person(self):
        res = self.client.post('/api/people/', {'name': 'Hussain najmi'}, format='json')
        self.assertEqual(res.status_code, 201)
        person_id = res.data['id']
        self.assertEqual(res.data['type'], 'person')

        res = self.client.post('/api/people/actions/', {
            'action': 'lend',
            'wallet_id': self.bank.id,
            'person_id': person_id,
            'amount': '500.00',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(len(res.data['transactions']), 2)
        self.assertEqual(Decimal(str(res.data['wallet_balance'])), Decimal('9500'))
        self.assertEqual(Decimal(str(res.data['person_balance'])), Decimal('500'))

        self.bank.refresh_from_db()
        person = Account.objects.get(id=person_id)
        self.assertEqual(Decimal(str(self.bank.current_balance)), Decimal('9500'))
        self.assertEqual(Decimal(str(person.current_balance)), Decimal('500'))

    def test_borrow_then_pay_settles(self):
        person = Account.objects.create(user=self.user, name='Ali', type='person', opening_balance=0)

        self.client.post('/api/people/actions/', {
            'action': 'borrow',
            'wallet_id': self.cash.id,
            'person_id': person.id,
            'amount': '500',
        }, format='json')
        self.cash.refresh_from_db()
        person.refresh_from_db()
        self.assertEqual(Decimal(str(self.cash.current_balance)), Decimal('2500'))
        self.assertEqual(Decimal(str(person.current_balance)), Decimal('-500'))

        self.client.post('/api/people/actions/', {
            'action': 'pay',
            'wallet_id': self.cash.id,
            'person_id': person.id,
            'amount': '500',
        }, format='json')
        self.cash.refresh_from_db()
        person.refresh_from_db()
        self.assertEqual(Decimal(str(self.cash.current_balance)), Decimal('2000'))
        self.assertEqual(Decimal(str(person.current_balance)), Decimal('0'))

    def test_can_delete_person_with_balance_and_unwinds_wallet(self):
        person = Account.objects.create(user=self.user, name='Debt', type='person', opening_balance=0)
        self.client.post('/api/people/actions/', {
            'action': 'lend',
            'wallet_id': self.bank.id,
            'person_id': person.id,
            'amount': '100',
        }, format='json')
        self.bank.refresh_from_db()
        self.assertEqual(Decimal(str(self.bank.current_balance)), Decimal('9900'))
        res = self.client.delete(f'/api/people/{person.id}/')
        self.assertEqual(res.status_code, 204)
        self.bank.refresh_from_db()
        self.assertEqual(Decimal(str(self.bank.current_balance)), Decimal('10000'))
        self.assertFalse(Account.objects.filter(id=person.id).exists())
        self.assertEqual(Transaction.objects.filter(user=self.user, people_action='lend').count(), 0)

    def test_can_edit_and_delete_people_pair(self):
        person = Account.objects.create(user=self.user, name='EditMe', type='person', opening_balance=0)
        res = self.client.post('/api/people/actions/', {
            'action': 'lend',
            'wallet_id': self.bank.id,
            'person_id': person.id,
            'amount': '200',
            'notes': 'old',
        }, format='json')
        pair_id = res.data['people_pair_id']
        patched = self.client.patch(f'/api/people/pairs/{pair_id}/', {
            'amount': '50',
            'wallet_id': self.cash.id,
            'notes': 'new',
        }, format='json')
        self.assertEqual(patched.status_code, 200)
        person.refresh_from_db()
        self.bank.refresh_from_db()
        self.cash.refresh_from_db()
        self.assertEqual(Decimal(str(person.current_balance)), Decimal('50'))
        self.assertEqual(Decimal(str(self.bank.current_balance)), Decimal('10000'))
        self.assertEqual(Decimal(str(self.cash.current_balance)), Decimal('1950'))
        deleted = self.client.delete(f'/api/people/pairs/{pair_id}/')
        self.assertEqual(deleted.status_code, 204)
        person.refresh_from_db()
        self.cash.refresh_from_db()
        self.assertEqual(Decimal(str(person.current_balance)), Decimal('0'))
        self.assertEqual(Decimal(str(self.cash.current_balance)), Decimal('2000'))

    def test_dashboard_excludes_people_from_total(self):
        person = Account.objects.create(user=self.user, name='Hussain', type='person', opening_balance=0)
        self.client.post('/api/people/actions/', {
            'action': 'lend',
            'wallet_id': self.bank.id,
            'person_id': person.id,
            'amount': '500',
        }, format='json')

        res = self.client.get('/api/dashboard/')
        self.assertEqual(res.status_code, 200)
        # wallets only: 9500 + 2000 = 11500 (person +500 not included)
        self.assertEqual(Decimal(str(res.data['total_balance'])), Decimal('11500'))
        self.assertTrue(any(p['name'] == 'Hussain' for p in res.data['people']))
        self.assertFalse(any(a['type'] == 'person' for a in res.data['accounts']))
        # People legs excluded from month expense
        self.assertEqual(Decimal(str(res.data['month_expense'])), Decimal('0'))

    def test_people_action_idempotent(self):
        person = Account.objects.create(user=self.user, name='Idem', type='person', opening_balance=0)
        payload = {
            'action': 'lend',
            'wallet_id': self.bank.id,
            'person_id': person.id,
            'amount': '200',
            'client_mutation_id': 'pair-abc-1',
        }
        r1 = self.client.post('/api/people/actions/', payload, format='json')
        r2 = self.client.post('/api/people/actions/', payload, format='json')
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(Transaction.objects.filter(people_pair_id='pair-abc-1').count(), 2)


class TravelModeApiTests(TravelPeopleBase):
    def test_set_travel_mode_manual_rate(self):
        res = self.client.put('/api/travel-mode/', {
            'enabled': True,
            'travel_currency': 'AED',
            'rate': '73.26',
            'rate_source': 'manual',
            'start_date': '2026-08-12',
            'end_date': '2026-08-19',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['enabled'])
        self.assertEqual(res.data['travel_currency'], 'AED')
        self.assertEqual(Decimal(str(res.data['rate'])), Decimal('73.260000'))

        res = self.client.get('/api/travel-mode/')
        self.assertTrue(res.data['enabled'])

        res = self.client.put('/api/travel-mode/', {'enabled': False}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['enabled'])

    def test_transaction_fx_converts_to_pkr(self):
        res = self.client.post('/api/transactions/', {
            'type': 'expense',
            'amount': '1',  # will be overwritten by conversion
            'date': '2026-08-12',
            'account': self.bank.id,
            'category': 'Food & Drink',
            'original_amount': '10',
            'original_currency': 'AED',
            'fx_rate': '73.26',
            'fx_source': 'manual',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Decimal(str(res.data['amount'])), Decimal('732.60'))
        self.assertEqual(res.data['original_currency'], 'AED')
        self.bank.refresh_from_db()
        self.assertEqual(Decimal(str(self.bank.current_balance)), Decimal('9267.40'))


class FxQuoteTests(TravelPeopleBase):
    def test_convert_helper(self):
        self.assertEqual(convert_to_pkr('10', '73.26'), Decimal('732.60'))

    def test_fx_uses_fresh_cache(self):
        FxRateCache.objects.create(
            base='AED',
            quote='PKR',
            rate=Decimal('73.500000'),
            source='test-cache',
            fetched_at=timezone.now(),
        )
        with patch('api.fx._fetch_open_er_api') as mock_a, patch('api.fx._fetch_frankfurter') as mock_b:
            data = get_fx_quote('AED', 'PKR')
            mock_a.assert_not_called()
            mock_b.assert_not_called()
        self.assertEqual(Decimal(data['rate']), Decimal('73.500000'))
        self.assertFalse(data['stale'])

    def test_fx_stale_cache_when_vendors_fail(self):
        FxRateCache.objects.create(
            base='AED',
            quote='PKR',
            rate=Decimal('70.000000'),
            source='old',
            fetched_at=timezone.now() - timedelta(hours=12),
        )
        with patch('api.fx._fetch_open_er_api', side_effect=RuntimeError('down')), \
             patch('api.fx._fetch_frankfurter', side_effect=RuntimeError('down')):
            data = get_fx_quote('AED', 'PKR', force_refresh=True)
        self.assertTrue(data['stale'])
        self.assertEqual(Decimal(data['rate']), Decimal('70.000000'))

    def test_fx_endpoint(self):
        FxRateCache.objects.create(
            base='USD',
            quote='PKR',
            rate=Decimal('278.000000'),
            source='test',
            fetched_at=timezone.now(),
        )
        res = self.client.get('/api/fx/?base=USD&quote=PKR')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['base'], 'USD')
        self.assertEqual(Decimal(str(res.data['rate'])), Decimal('278.000000'))

    def test_travel_mode_use_live_rate(self):
        FxRateCache.objects.create(
            base='AED',
            quote='PKR',
            rate=Decimal('73.100000'),
            source='cache',
            fetched_at=timezone.now(),
        )
        res = self.client.put('/api/travel-mode/', {
            'enabled': True,
            'travel_currency': 'AED',
            'use_live_rate': True,
            'start_date': '2026-08-12',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Decimal(str(res.data['rate'])), Decimal('73.100000'))
        self.assertTrue(TravelMode.objects.get(user=self.user).enabled)
