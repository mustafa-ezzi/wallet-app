"""Roles, token encryption, and the integrations sync job."""

import json
import os
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import signing
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from integrations.adapters import FakeAdapter, register_adapter
from integrations.crypto import decrypt_token, encrypt_token, issue_oauth_state, read_oauth_state
from integrations.models import IntegrationAccount, MetricSnapshot, StaffRole, SyncRun


def _client_for(user):
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client


class OpsRoleTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', password='x', is_staff=True)
        self.marketing = User.objects.create_user(username='market', password='x', is_staff=True)
        self.target = User.objects.create_user(username='member', password='x')
        StaffRole.objects.create(user=self.owner, role=StaffRole.ROLE_OWNER)
        StaffRole.objects.create(user=self.marketing, role=StaffRole.ROLE_MARKETING)
        self.owner_client = _client_for(self.owner)
        self.marketing_client = _client_for(self.marketing)

    def test_marketing_cannot_delete_a_user(self):
        denied = self.marketing_client.post(f'/api/ops/users/{self.target.id}/delete/')
        self.assertEqual(denied.status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.target.id).exists())

    def test_marketing_can_read_the_dashboard_but_not_the_user_list(self):
        dashboard = self.marketing_client.get('/api/ops/dashboard/summary/')
        self.assertEqual(dashboard.status_code, 200)
        users = self.marketing_client.get('/api/ops/users/')
        self.assertEqual(users.status_code, 403)

    def test_admin_cannot_open_team(self):
        admin = User.objects.create_user(username='admin', password='x', is_staff=True)
        StaffRole.objects.create(user=admin, role=StaffRole.ROLE_ADMIN)
        response = _client_for(admin).get('/api/ops/team/')
        self.assertEqual(response.status_code, 403)
        allowed = self.owner_client.get('/api/ops/team/')
        self.assertEqual(allowed.status_code, 200)
        usernames = {row['username'] for row in allowed.data['results']}
        self.assertIn('owner', usernames)

    def test_owner_can_assign_a_role(self):
        created = self.owner_client.post(
            '/api/ops/team/',
            {'username': 'newhire', 'password': 'temporary1', 'role': 'support', 'email': 'new@example.com'},
            format='json',
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data['role'], 'support')
        self.assertNotIn('password', created.data)
        user = User.objects.get(username='newhire')
        self.assertTrue(user.is_staff)
        self.assertEqual(user.ops_staff_role.role, StaffRole.ROLE_SUPPORT)


class OpsTokenTests(TestCase):
    def test_ciphertext_is_not_the_token(self):
        blob = encrypt_token('super-secret-token')
        self.assertNotIn('super-secret-token', blob)
        self.assertEqual(decrypt_token(blob), 'super-secret-token')

    def test_oauth_state_rejects_a_tampered_value(self):
        state = issue_oauth_state(4, 'ga4')
        self.assertEqual(read_oauth_state(state, 'ga4'), 4)
        with self.assertRaises(signing.BadSignature):
            read_oauth_state(state + 'x', 'ga4')
        with self.assertRaises(signing.BadSignature):
            read_oauth_state(state, 'facebook')

    def test_ops_login_uses_a_short_access_token(self):
        User.objects.create_user(username='ops', password='correct-horse', is_staff=True)
        client = APIClient()
        denied = client.post('/api/ops/auth/login/', {'username': 'ops', 'password': 'nope'}, format='json')
        self.assertEqual(denied.status_code, 401)
        ok = client.post('/api/ops/auth/login/', {'username': 'ops', 'password': 'correct-horse'}, format='json')
        self.assertEqual(ok.status_code, 200)
        access = AccessToken(ok.data['access'])
        lifetime = access['exp'] - access['iat']
        self.assertLess(lifetime, int(timedelta(hours=3).total_seconds()))
        self.assertGreater(lifetime, int(timedelta(minutes=30).total_seconds()))
        me = client.get('/api/ops/me/', HTTP_AUTHORIZATION=f"Bearer {ok.data['access']}")
        self.assertEqual(me.status_code, 200)
        self.assertIn('dashboard.read', me.data['capabilities'])


@override_settings(CRON_SECRET='test-cron')
class IntegrationSyncTests(TestCase):
    def setUp(self):
        register_adapter(FakeAdapter())
        self._ga4_env = patch.dict(os.environ, {'GA4_PROPERTY_ID': '', 'GA4_SERVICE_ACCOUNT_JSON': ''})
        self._ga4_env.start()
        self.staff = User.objects.create_user(username='ops', password='x', is_staff=True)
        self.client = _client_for(self.staff)
        self.account = IntegrationAccount.objects.create(
            provider='fake',
            external_id='lab',
            display_name='Fake',
            status=IntegrationAccount.STATUS_CONNECTED,
            encrypted_token=encrypt_token('super-secret-token'),
            connected_by=self.staff,
            connected_at=timezone.now(),
        )

    def test_sync_job_writes_a_snapshot_and_hides_the_token(self):
        response = APIClient().post(
            '/api/jobs/sync-integrations/',
            HTTP_X_CRON_SECRET='test-cron',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['accounts'], 1)
        self.assertTrue(response.data['runs'][0]['ok'])
        self.assertEqual(MetricSnapshot.objects.filter(account=self.account, metric='fake_count').count(), 1)
        self.assertEqual(SyncRun.objects.filter(account=self.account, ok=True).count(), 1)
        blob = json.dumps(response.data)
        self.assertNotIn('super-secret-token', blob)

        listing = self.client.get('/api/ops/integrations/')
        self.assertEqual(listing.status_code, 200)
        providers = {row['provider']: row['status'] for row in listing.data['results']}
        self.assertEqual(providers['ga4'], 'not_setup')
        self.assertEqual(providers['instagram'], 'not_setup')
        self.assertEqual(providers['facebook'], 'not_setup')
        self.assertEqual(providers['linkedin'], 'not_setup')
        self.assertNotIn('super-secret-token', json.dumps(listing.data))
        self.assertNotIn('encrypted_token', json.dumps(listing.data))

    def test_callback_rejects_a_bad_state(self):
        bad = self.client.get('/api/ops/integrations/ga4/callback/?state=nope')
        self.assertEqual(bad.status_code, 400)
        state = issue_oauth_state(self.staff.id, 'ga4')
        pending = self.client.get(f'/api/ops/integrations/ga4/callback/?state={state}')
        self.assertEqual(pending.status_code, 400)
        self.assertIn('Not set up', pending.data['detail'])

    def test_job_rejects_a_missing_secret(self):
        response = APIClient().post('/api/jobs/sync-integrations/')
        self.assertEqual(response.status_code, 403)

    def tearDown(self):
        self._ga4_env.stop()


class Ga4GrowthTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', password='x', is_staff=True)
        self.marketing = User.objects.create_user(username='market', password='x', is_staff=True)
        self.viewer = User.objects.create_user(username='viewer', password='x', is_staff=True)
        self.support = User.objects.create_user(username='support', password='x', is_staff=True)
        StaffRole.objects.create(user=self.owner, role=StaffRole.ROLE_OWNER)
        StaffRole.objects.create(user=self.marketing, role=StaffRole.ROLE_MARKETING)
        StaffRole.objects.create(user=self.viewer, role=StaffRole.ROLE_VIEWER)
        StaffRole.objects.create(user=self.support, role=StaffRole.ROLE_SUPPORT)
        self.env = {
            'GA4_PROPERTY_ID': '123456789',
            'GA4_SERVICE_ACCOUNT_JSON': json.dumps({
                'client_email': 'ga@example.iam.gserviceaccount.com',
                'private_key': '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n',
            }),
        }

    def test_sync_stores_visitors_and_get_app_clicks_without_the_key(self):
        from integrations.ga4 import connect_ga4
        from integrations.sync import run_sync

        yesterday = (timezone.localdate() - timedelta(days=1)).isoformat()
        rows = [
            {'metric': 'users', 'date': yesterday, 'dimension_key': '', 'dimension_value': '', 'value': 42},
            {'metric': 'sessions', 'date': yesterday, 'dimension_key': '', 'dimension_value': '', 'value': 50},
            {'metric': 'event_count', 'date': yesterday, 'dimension_key': 'event', 'dimension_value': 'get_app_click', 'value': 7},
            {'metric': 'page_views', 'date': yesterday, 'dimension_key': 'page', 'dimension_value': '/', 'value': 11},
        ]
        with patch.dict(os.environ, self.env):
            with patch('integrations.ga4.fetch_ga4_rows', return_value=rows):
                account = connect_ga4(self.owner)
                run = run_sync(account)
            response = _client_for(self.owner).get(f'/api/ops/growth/website/?from={yesterday}&to={yesterday}&compare=1')
            listing = _client_for(self.owner).get('/api/ops/integrations/')
        self.assertTrue(run.ok)
        self.assertEqual(run.rows_written, 4)
        self.assertEqual(account.encrypted_token, '')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['configured'])
        self.assertEqual(response.data['totals']['users'], 42)
        self.assertEqual(response.data['totals']['get_app_clicks'], 7)
        self.assertEqual(response.data['series'][-1]['users'], 42)
        self.assertEqual(response.data['pages'][0], {'label': '/', 'value': 11})
        self.assertEqual(response.data['previous']['users'], 0)
        for blob in (json.dumps(response.data), json.dumps(listing.data)):
            self.assertNotIn('not-a-real-key', blob)
            self.assertNotIn('private_key', blob)
            self.assertNotIn('BEGIN PRIVATE KEY', blob)
        self.assertNotIn('encrypted_token', json.dumps(listing.data))

    def test_unconfigured_website_does_not_call_google(self):
        with patch.dict(os.environ, {'GA4_PROPERTY_ID': '', 'GA4_SERVICE_ACCOUNT_JSON': ''}):
            with patch('integrations.ga4.fetch_ga4_rows') as fetch:
                response = _client_for(self.owner).get('/api/ops/growth/website/')
                realtime = _client_for(self.owner).get('/api/ops/growth/website/realtime/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['configured'])
        self.assertEqual(response.data['totals']['users'], 0)
        self.assertEqual(response.data['events'][0]['label'], 'get_app_click')
        self.assertEqual(realtime.status_code, 200)
        self.assertIsNone(realtime.data['active_users'])
        fetch.assert_not_called()

    def test_support_cannot_read_the_website(self):
        denied = _client_for(self.support).get('/api/ops/growth/website/')
        self.assertEqual(denied.status_code, 403)

    def test_disconnect_is_not_revived_by_the_nightly_job(self):
        from integrations.ga4 import connect_ga4
        from integrations.sync import run_all_syncs

        with patch.dict(os.environ, self.env):
            account = connect_ga4(self.owner)
            account.status = IntegrationAccount.STATUS_NOT_SETUP
            account.save(update_fields=['status'])
            with patch('integrations.ga4.fetch_ga4_rows', return_value=[]) as fetch:
                run_all_syncs()
        account.refresh_from_db()
        self.assertEqual(account.status, IntegrationAccount.STATUS_NOT_SETUP)
        fetch.assert_not_called()

    def test_a_measurement_id_is_not_the_property_id(self):
        env = {**self.env, 'GA4_PROPERTY_ID': 'G-ABC123'}
        with patch.dict(os.environ, env):
            response = _client_for(self.owner).post('/api/ops/integrations/ga4/connect/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('numeric', response.data['detail'])
        self.assertNotIn('not-a-real-key', json.dumps(response.data))

    def test_marketing_can_build_a_link_and_a_viewer_cannot(self):
        payload = {
            'label': 'Instagram bio',
            'destination': 'https://wallettrails.app/#download',
            'utm_source': 'instagram',
            'utm_medium': 'bio',
            'utm_campaign': 'launch',
        }
        denied = _client_for(self.viewer).post('/api/ops/links/', payload, format='json')
        self.assertEqual(denied.status_code, 403)
        created = _client_for(self.marketing).post('/api/ops/links/', payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(
            created.data['url'],
            'https://wallettrails.app/?utm_source=instagram&utm_medium=bio&utm_campaign=launch#download',
        )
        listed = _client_for(self.viewer).get('/api/ops/links/')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data['results'][0]['label'], 'Instagram bio')
        rejected = _client_for(self.marketing).post(
            '/api/ops/links/',
            {'label': 'Bad', 'destination': 'javascript:alert(1)'},
            format='json',
        )
        self.assertEqual(rejected.status_code, 400)
