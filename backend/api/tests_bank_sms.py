"""
Bank SMS Import Phase 2 — pending queue + approve/reject.
Run:  python manage.py test api.tests_bank_sms -v 2
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import Account, BankSmsImport, Transaction, UserProfile


class BankSmsImportTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='banksms@example.com',
            email='banksms@example.com',
            password='testpass123',
        )
        UserProfile.objects.get_or_create(user=self.user, defaults={'currency': 'PKR'})
        self.client = APIClient()
        token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        self.bank = Account.objects.create(
            user=self.user, name='Meezan', type='bank', opening_balance=Decimal('100000'),
        )
        self.cash = Account.objects.create(
            user=self.user, name='Cash', type='cash', opening_balance=Decimal('1000'),
        )

    def test_create_and_list_pending(self):
        res = self.client.post('/api/bank-sms-imports/', {
            'kind': 'expense',
            'amount': '2041.00',
            'tx_date': '2026-08-25',
            'fingerprint': 'fp_card_1',
            'raw_snippet': 'PKR 2,041.00 has been debited',
            'suggested_account_id': self.bank.id,
            'source': 'paste',
            'confidence': '0.650',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'pending')

        listed = self.client.get('/api/bank-sms-imports/', {'status': 'pending'})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 1)

    def test_dedupe_pending_fingerprint(self):
        payload = {
            'kind': 'expense',
            'amount': '100',
            'fingerprint': 'same_fp',
            'suggested_account_id': self.bank.id,
        }
        a = self.client.post('/api/bank-sms-imports/', payload, format='json')
        b = self.client.post('/api/bank-sms-imports/', payload, format='json')
        self.assertEqual(a.status_code, 201)
        self.assertEqual(b.status_code, 200)
        self.assertEqual(a.data['id'], b.data['id'])
        self.assertEqual(BankSmsImport.objects.filter(user=self.user).count(), 1)

    def test_approve_expense(self):
        created = self.client.post('/api/bank-sms-imports/', {
            'kind': 'expense',
            'amount': '2041',
            'tx_date': '2026-08-25',
            'fingerprint': 'fp_exp',
            'suggested_account_id': self.bank.id,
            'category': 'Miscellaneous',
            'notes': 'card spend',
        }, format='json')
        pk = created.data['id']
        res = self.client.post(f'/api/bank-sms-imports/{pk}/approve/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'approved')
        self.assertEqual(len(res.data['created_transaction_ids']), 1)
        tx = Transaction.objects.get(id=res.data['created_transaction_ids'][0])
        self.assertEqual(tx.type, 'expense')
        self.assertEqual(tx.amount, Decimal('2041'))
        self.assertEqual(tx.account_id, self.bank.id)

    def test_approve_atm_transfer(self):
        created = self.client.post('/api/bank-sms-imports/', {
            'kind': 'atm',
            'amount': '50000',
            'tx_date': '2026-08-20',
            'fingerprint': 'fp_atm',
            'suggested_account_id': self.bank.id,
            'cash_account_id': self.cash.id,
            'tid': '302750',
        }, format='json')
        pk = created.data['id']
        res = self.client.post(f'/api/bank-sms-imports/{pk}/approve/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(res.data['created_transaction_ids']), 2)
        txs = list(Transaction.objects.filter(id__in=res.data['created_transaction_ids']).order_by('id'))
        self.assertEqual(txs[0].type, 'expense')
        self.assertEqual(txs[0].category, 'Bank Transfer')
        self.assertEqual(txs[0].account_id, self.bank.id)
        self.assertEqual(txs[1].type, 'income')
        self.assertEqual(txs[1].account_id, self.cash.id)

    def test_approve_atm_creates_cash_when_missing(self):
        self.cash.delete()
        created = self.client.post('/api/bank-sms-imports/', {
            'kind': 'atm',
            'amount': '5000',
            'fingerprint': 'fp_atm_nocash',
            'suggested_account_id': self.bank.id,
        }, format='json')
        pk = created.data['id']
        res = self.client.post(
            f'/api/bank-sms-imports/{pk}/approve/',
            {'create_cash': True, 'create_cash_name': 'Cash'},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(Account.objects.filter(user=self.user, type='cash', name='Cash').exists())
        self.assertEqual(len(res.data['created_transaction_ids']), 2)

    def test_reject(self):
        created = self.client.post('/api/bank-sms-imports/', {
            'kind': 'income',
            'amount': '100',
            'fingerprint': 'fp_rej',
            'suggested_account_id': self.bank.id,
        }, format='json')
        pk = created.data['id']
        res = self.client.post(f'/api/bank-sms-imports/{pk}/reject/', {}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'rejected')

    def test_settings_get_patch(self):
        res = self.client.get('/api/bank-sms-import-settings/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['sms_import_enabled'])
        patched = self.client.patch('/api/bank-sms-import-settings/', {
            'sms_import_enabled': False,
            'auto_create_cash_on_atm': False,
        }, format='json')
        self.assertEqual(patched.status_code, 200)
        self.assertFalse(patched.data['sms_import_enabled'])
        self.assertFalse(patched.data['auto_create_cash_on_atm'])

    def test_approve_remember_wallet_alias(self):
        created = self.client.post('/api/bank-sms-imports/', {
            'kind': 'expense',
            'amount': '99',
            'fingerprint': 'fp_alias',
            'suggested_account_id': self.bank.id,
            'account_mask': 'xxx2554',
            'bank_hint': 'meezan',
        }, format='json')
        pk = created.data['id']
        res = self.client.post(f'/api/bank-sms-imports/{pk}/approve/', {
            'resolved_account_id': self.bank.id,
            'remember_wallet': True,
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        settings = self.client.get('/api/bank-sms-import-settings/')
        aliases = settings.data['wallet_aliases']
        self.assertTrue(any(a.get('mask') == '2554' and a.get('account_id') == self.bank.id for a in aliases))
        self.assertTrue(any(a.get('hint') == 'meezan' and a.get('account_id') == self.bank.id for a in aliases))

    def test_settings_sanitize_aliases(self):
        res = self.client.patch('/api/bank-sms-import-settings/', {
            'wallet_aliases': [
                {'account_id': self.bank.id, 'mask': 'xx9910', 'hint': 'HBL'},
                {'account_id': 99999, 'mask': '1111'},
                {'junk': True},
            ],
        }, format='json')
        self.assertEqual(res.status_code, 200)
        aliases = res.data['wallet_aliases']
        self.assertEqual(len(aliases), 1)
        self.assertEqual(aliases[0]['account_id'], self.bank.id)
        self.assertEqual(aliases[0]['mask'], '9910')
        self.assertEqual(aliases[0]['hint'], 'hbl')
