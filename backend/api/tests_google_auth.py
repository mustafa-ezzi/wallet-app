from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from api.models import UserProfile


@override_settings(GOOGLE_OAUTH_CLIENT_IDS=['test-web-client.apps.googleusercontent.com'])
class GoogleAuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_missing_token(self):
        res = self.client.post('/api/auth/google/', {}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_garbage_token_is_rejected(self):
        res = self.client.post('/api/auth/google/', {'id_token': 'not-a-jwt'}, format='json')
        self.assertEqual(res.status_code, 401)

    @patch('api.google_auth_api._verify_google_id_token')
    def test_creates_user_and_returns_jwt(self, verify):
        verify.return_value = {
            'email': 'new.google@example.com',
            'email_verified': True,
            'sub': 'google-sub-1',
            'given_name': 'Ayesha',
            'family_name': 'Khan',
        }
        res = self.client.post('/api/auth/google/', {'id_token': 'fake'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data.get('created'))
        self.assertTrue(res.data.get('access'))
        user = User.objects.get(email='new.google@example.com')
        self.assertEqual(user.first_name, 'Ayesha')
        self.assertTrue(user.profile.google_sub)

    @patch('api.google_auth_api._verify_google_id_token')
    def test_existing_email_signs_in(self, verify):
        user = User.objects.create_user(
            username='old@example.com',
            email='old@example.com',
            password='testpass123',
            first_name='Old',
        )
        UserProfile.objects.create(user=user, currency='PKR')
        verify.return_value = {
            'email': 'old@example.com',
            'email_verified': True,
            'sub': 'google-sub-2',
            'given_name': 'Old',
            'family_name': '',
        }
        res = self.client.post('/api/auth/google/', {'id_token': 'fake'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(res.data.get('created'))
        user.refresh_from_db()
        self.assertEqual(user.profile.google_sub, 'google-sub-2')
        self.assertEqual(User.objects.filter(email__iexact='old@example.com').count(), 1)
