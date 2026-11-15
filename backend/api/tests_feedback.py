"""Tests for Google Form webhook ingestion and Ops tester feedback endpoints."""

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import AdminAuditLog, TesterFeedback
from integrations.models import StaffRole


def _client_for(user):
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client


class TesterFeedbackTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username='ops_admin', password='x', is_staff=True)
        StaffRole.objects.create(user=self.staff, role=StaffRole.ROLE_OWNER)
        self.staff_client = _client_for(self.staff)
        self.anon = APIClient()

    @override_settings(GOOGLE_FORM_WEBHOOK_SECRET='form-secret-123')
    def test_webhook_rejects_bad_secret(self):
        res = self.anon.post(
            '/api/webhooks/google-form/',
            {'response_id': 'r1', 'answers': {}},
            format='json',
            HTTP_X_WEBHOOK_SECRET='wrong',
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(TesterFeedback.objects.count(), 0)

    @override_settings(GOOGLE_FORM_WEBHOOK_SECRET='form-secret-123')
    def test_webhook_maps_google_form_answers_and_is_idempotent(self):
        payload = {
            'response_id': 'resp-abc-1',
            'submitted_at': '2026-11-15T15:30:00Z',
            'answers': {
                'Which platform did you test?': ['Android App', 'Web App'],
                'How easy was WalletTrails to use?': '4',
                'Did you discover all features of WalletTrails?': 'Some of them',
                'Which features did you try?': ['Wallets & Transfers', 'Trai (AI Assistant)', 'Travel Mode'],
                'How was your experience with Trai (our AI assistant)?': 'Worked great — understood me accurately',
                'What monthly price (PKR) feels fair for a Paid/Pro plan?': '500 – 1,000',
                'What was your favorite feature?': 'Trai voice entry',
                'Did you face any bugs or confusing screens?': 'None so far',
                'What one thing should we add or improve?': 'Dark mode widget',
                'Would you keep using or recommend WalletTrails?': 5,
                'Name or Email/WhatsApp (if open to a quick follow-up)': 'ali@example.com',
            },
        }
        res = self.anon.post(
            '/api/webhooks/google-form/',
            payload,
            format='json',
            HTTP_X_WEBHOOK_SECRET='form-secret-123',
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.json()['created'])

        fb = TesterFeedback.objects.get(external_id='resp-abc-1')
        self.assertEqual(fb.platform, 'Android App, Web App')
        self.assertEqual(fb.ease_score, 4)
        self.assertEqual(fb.discovery_level, 'Some of them')
        self.assertEqual(fb.features_tried, ['Wallets & Transfers', 'Trai (AI Assistant)', 'Travel Mode'])
        self.assertEqual(fb.trai_experience, 'Worked great — understood me accurately')
        self.assertEqual(fb.price_range, '500 – 1,000')
        self.assertEqual(fb.favorite_feature, 'Trai voice entry')
        self.assertEqual(fb.bugs_or_confusion, 'None so far')
        self.assertEqual(fb.improvement_idea, 'Dark mode widget')
        self.assertEqual(fb.recommend_score, 5)
        self.assertEqual(fb.contact, 'ali@example.com')

        # Resending same response_id updates instead of duplicating
        payload['answers']['How easy was WalletTrails to use?'] = '5'
        res2 = self.anon.post(
            '/api/webhooks/google-form/',
            payload,
            format='json',
            HTTP_X_WEBHOOK_SECRET='form-secret-123',
        )
        self.assertEqual(res2.status_code, 200)
        self.assertFalse(res2.json()['created'])
        self.assertEqual(TesterFeedback.objects.count(), 1)
        fb.refresh_from_db()
        self.assertEqual(fb.ease_score, 5)

    def test_ops_list_summary_and_update(self):
        TesterFeedback.objects.create(
            external_id='r1',
            platform='Android App',
            ease_score=4,
            recommend_score=5,
            price_range='500 – 1,000',
            trai_experience='Worked great',
            features_tried=['Wallets & Transfers', 'Trai (AI Assistant)'],
            favorite_feature='Trai',
        )
        TesterFeedback.objects.create(
            external_id='r2',
            platform='Web App',
            ease_score=2,
            recommend_score=3,
            price_range='500 – 1,000',
            trai_experience="I didn't notice or try Trai",
            features_tried=['Budgets & Reports'],
            bugs_or_confusion='Chart clipped on mobile',
        )

        # Non-staff blocked
        regular = User.objects.create_user(username='user1', password='x')
        self.assertEqual(_client_for(regular).get('/api/ops/feedback/').status_code, 403)

        res = self.staff_client.get('/api/ops/feedback/')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['count'], 2)
        self.assertEqual(body['summary']['total'], 2)
        self.assertEqual(body['summary']['new_count'], 2)
        self.assertEqual(body['summary']['avg_ease'], 3.0)
        self.assertEqual(body['summary']['avg_recommend'], 4.0)
        self.assertEqual(body['summary']['price_ranges'][0], {'label': '500 – 1,000', 'count': 2})

        # Viewer cannot patch
        viewer = User.objects.create_user(username='viewer', password='x', is_staff=True)
        StaffRole.objects.create(user=viewer, role=StaffRole.ROLE_VIEWER)
        fb_id = body['results'][0]['id']
        self.assertEqual(
            _client_for(viewer).patch(f'/api/ops/feedback/{fb_id}/', {'status': 'reviewed'}, format='json').status_code,
            403,
        )

        # Owner can patch status + note and it creates an audit entry
        patch_res = self.staff_client.patch(
            f'/api/ops/feedback/{fb_id}/',
            {'status': 'resolved', 'staff_note': 'Fixed in v1.0.4'},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()['status'], 'resolved')
        self.assertEqual(patch_res.json()['staff_note'], 'Fixed in v1.0.4')
        self.assertTrue(AdminAuditLog.objects.filter(action='feedback.update', target_id=str(fb_id)).exists())
