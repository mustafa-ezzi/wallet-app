"""One-user push campaigns stay limited to that account."""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import DeviceToken, PushCampaign


def _client_for(user):
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client


class OneUserCampaignTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username='ops', password='x', is_staff=True)
        self.alice = User.objects.create_user(username='alice', password='x', email='alice@example.com')
        self.bob = User.objects.create_user(username='bob', password='x', email='bob@example.com')
        DeviceToken.objects.create(user=self.alice, token='token-alice', platform='android')
        DeviceToken.objects.create(user=self.bob, token='token-bob', platform='android')
        self.client = _client_for(self.staff)

    def test_one_user_estimate_and_draft_ignore_everyone_else(self):
        missing = self.client.post('/api/ops/campaigns/', {'title': 'Hi', 'body': 'Just you', 'audience': 'user'}, format='json')
        self.assertEqual(missing.status_code, 400)

        estimate = self.client.get('/api/ops/campaigns/estimate/', {'audience': 'user', 'user_id': self.alice.id})
        self.assertEqual(estimate.status_code, 200)
        self.assertEqual(estimate.data['users'], 1)
        self.assertEqual(estimate.data['tokens'], 1)

        created = self.client.post(
            '/api/ops/campaigns/',
            {'title': 'Hi', 'body': 'Just you', 'audience': 'user', 'user_id': self.alice.id},
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['target_username'], 'alice')
        self.assertEqual(created.data['recipient_estimate'], 1)
        self.assertNotIn('balance', str(created.data))

        campaign = PushCampaign.objects.get(pk=created.data['id'])
        dry = self.client.post(f'/api/ops/campaigns/{campaign.id}/send/', {'dry_run': True}, format='json')
        self.assertEqual(dry.status_code, 200)
        self.assertEqual(dry.data['users'], 1)
        self.assertEqual(dry.data['tokens'], 1)

        found = self.client.get('/api/ops/campaigns/recipients/', {'q': 'ali'})
        self.assertEqual(found.status_code, 200)
        self.assertEqual([row['username'] for row in found.data['results']], ['alice'])
        self.assertTrue(found.data['results'][0]['has_push'])
        self.assertNotIn('balance', str(found.data))
