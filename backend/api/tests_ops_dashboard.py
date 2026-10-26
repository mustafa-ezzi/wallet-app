"""
Ops Command Center summary + counts-only analytics report.
Run: py manage.py test api.tests_ops_dashboard -v 2
"""
import json
import os
import tempfile
from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import Account, SupportThread, Transaction
from api.ops_dashboard_api import counts_only_report


def _at(day, hour=12):
    return timezone.make_aware(datetime.combine(day, time(hour)), timezone.get_current_timezone())


class OpsDashboardSummaryTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.staff = User.objects.create_user(username='ops', password='x', is_staff=True)
        self.client = APIClient()
        token = RefreshToken.for_user(self.staff)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        User.objects.filter(pk=self.staff.pk).update(date_joined=_at(self.today - timedelta(days=400)))

    def _user(self, name, joined_days_ago):
        user = User.objects.create_user(username=name, password='x')
        User.objects.filter(pk=user.pk).update(date_joined=_at(self.today - timedelta(days=joined_days_ago)))
        return user

    def _tx(self, user, days_ago, amount='999999'):
        account, _ = Account.objects.get_or_create(user=user, name='Cash', defaults={'type': 'cash'})
        tx = Transaction.objects.create(
            user=user, type='expense', amount=Decimal(amount), date=self.today,
            account=account, category='Food',
        )
        Transaction.objects.filter(pk=tx.pk).update(created_at=_at(self.today - timedelta(days=days_ago)))
        return tx

    def test_requires_staff(self):
        regular = User.objects.create_user(username='member', password='x')
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(regular).access_token}')
        self.assertEqual(client.get('/api/ops/dashboard/summary/').status_code, 403)

    def test_counts_current_and_previous_windows(self):
        alice = self._user('alice', 2)
        bob = self._user('bob', 9)
        self._user('carol', 30)
        self._tx(alice, 1)
        self._tx(alice, 3)
        self._tx(bob, 10)
        SupportThread.objects.create(user=alice, subject='Help')

        start = self.today - timedelta(days=6)
        res = self.client.get('/api/ops/dashboard/summary/', {
            'from': start.isoformat(), 'to': self.today.isoformat(), 'compare': '1',
        })
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['range']['days'], 7)
        self.assertEqual(body['range']['previous_to'], (start - timedelta(days=1)).isoformat())
        self.assertEqual(body['current']['signups'], 1)
        self.assertEqual(body['previous']['signups'], 1)
        self.assertEqual(body['current']['records_created'], 2)
        self.assertEqual(body['current']['active_users'], 1)
        self.assertEqual(body['previous']['records_created'], 1)
        self.assertEqual(body['current']['support_opened'], 1)
        self.assertEqual(len(body['series']), 7)
        by_day = {row['date']: row for row in body['series']}
        self.assertEqual(by_day[(self.today - timedelta(days=2)).isoformat()]['signups'], 1)
        self.assertEqual(body['snapshot']['support_waiting_ops'], 1)
        self.assertEqual(body['needs_attention']['counts']['support'], 1)
        self.assertEqual(body['needs_attention']['items'][0]['to'].startswith('/support/'), True)

    def test_no_money_in_summary(self):
        alice = self._user('alice', 1)
        self._tx(alice, 0, amount='424242')
        res = self.client.get('/api/ops/dashboard/summary/')
        self.assertEqual(res.status_code, 200)
        raw = res.content.decode()
        self.assertNotIn('424242', raw)
        self.assertNotIn('Food', raw)
        self.assertNotIn('amount', raw)
        self.assertIsNone(res.json()['previous'])

    def test_rejects_bad_ranges(self):
        url = '/api/ops/dashboard/summary/'
        self.assertEqual(self.client.get(url, {'from': 'nope'}).status_code, 400)
        self.assertEqual(self.client.get(url, {'from': '2026-02-10', 'to': '2026-02-01'}).status_code, 400)
        self.assertEqual(self.client.get(url, {'from': '2024-01-01', 'to': '2026-01-01'}).status_code, 400)


SAMPLE_REPORT = {
    'schema_version': 1,
    'metrics': {
        'records': {'users': {'total': 24, 'new': 1, 'previous_new': 3}},
        'money': {'current': {'income_pkr': 509528.0}},
        'growth': {
            'signups': {'current': 1, 'previous': 3},
            'income_pkr': {'current': 509528.0},
            'expense_pkr': {'current': 383468.89},
        },
        'activity': {'daily': [{'date': '2026-09-11', 'transactions': 9, 'signups': 0,
                                'income_pkr': 0.0, 'expense_pkr': 17260.0}],
                     'weekly': [], 'monthly': []},
        'breakdowns': {'device_platform': {'android': 5},
                       'expense_categories': [{'category': 'Miscellaneous', 'count': 40, 'amount_pkr': 266469.0}],
                       'income_categories': []},
    },
    'trends': {
        'direction': {'users_new': 'down', 'income_pkr': 'down', 'expense_pkr': 'down'},
        'anomalies': [
            {'date': '2026-09-15', 'metric': 'transactions', 'value': 24},
            {'date': '2026-09-28', 'metric': 'expense_pkr', 'value': 206080.0},
        ],
    },
    'insights': {
        'source': 'rules',
        'summary': '1 new users in the trailing 30 days. Personal cash flow was PKR 509528.00 income. '
                   'Largest expense category was Miscellaneous at PKR 266469.00 across 40 transactions.',
        'highlights': [
            '1 new users in the trailing 30 days.',
            'Personal cash flow was PKR 509528.00 income and PKR 383468.89 expense (net PKR 126059.11).',
            '2 daily anomalies flagged at |z| >= 2.',
        ],
    },
    'status': {'state': 'ok', 'read_only': True, 'warnings': []},
}


class OpsAnalyticsReportTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username='ops', password='x', is_staff=True)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.staff).access_token}')

    def test_strips_every_money_figure(self):
        cleaned = counts_only_report(SAMPLE_REPORT)
        raw = json.dumps(cleaned)
        for needle in ('pkr', 'PKR', '509528', '266469', 'Miscellaneous', 'expense', 'income'):
            self.assertNotIn(needle, raw)
        self.assertEqual(cleaned['metrics']['records']['users']['total'], 24)
        self.assertEqual(cleaned['metrics']['activity']['daily'][0]['transactions'], 9)
        self.assertEqual([a['metric'] for a in cleaned['trends']['anomalies']], ['transactions'])
        self.assertEqual(cleaned['insights']['highlights'], ['1 new users in the trailing 30 days.'])
        self.assertEqual(cleaned['insights']['summary'], '1 new users in the trailing 30 days.')
        self.assertIn('expense_pkr', SAMPLE_REPORT['trends']['direction'])

    def test_serves_cleaned_report_and_404_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'analytics.json')
            with mock.patch.dict(os.environ, {'OPS_ANALYTICS_REPORT_PATH': path}):
                self.assertEqual(self.client.get('/api/ops/reports/analytics/').status_code, 404)
                with open(path, 'w', encoding='utf-8') as fh:
                    json.dump(SAMPLE_REPORT, fh)
                res = self.client.get('/api/ops/reports/analytics/')
        self.assertEqual(res.status_code, 200)
        self.assertNotIn('PKR', res.content.decode())
        self.assertNotIn('pkr', res.content.decode())
