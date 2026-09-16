from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.test import TestCase

from api.models import UserCategory, UserProfile


class UserCategoryApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cat@example.com',
            email='cat@example.com',
            password='testpass123',
        )
        UserProfile.objects.get_or_create(user=self.user, defaults={'currency': 'PKR'})
        self.client = APIClient()
        token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    def test_create_list_delete(self):
        res = self.client.post('/api/categories/', {'kind': 'expense', 'name': '  Pet Care  '}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['name'], 'Pet Care')
        cat_id = res.data['id']

        listed = self.client.get('/api/categories/')
        self.assertEqual(listed.status_code, 200)
        names = [row['name'] for row in listed.data]
        self.assertIn('Pet Care', names)

        dup = self.client.post('/api/categories/', {'kind': 'expense', 'name': 'pet care'}, format='json')
        self.assertEqual(dup.status_code, 400)

        deleted = self.client.delete(f'/api/categories/{cat_id}/')
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(UserCategory.objects.filter(id=cat_id).exists())
