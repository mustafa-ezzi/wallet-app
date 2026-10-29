"""Roles, token encryption, and the integrations sync job."""

import json
from datetime import timedelta

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
