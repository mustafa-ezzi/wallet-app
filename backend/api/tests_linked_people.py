"""
Phase G — Linked People API tests.
Run:  py -3 manage.py test api.tests_linked_people -v 2
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import Account, PeopleInvitation, PeopleLink, PeopleProposal, UserProfile


class LinkedPeopleBase(TestCase):
    def setUp(self):
        self.mustafa = User.objects.create_user(
            username='mustafa@example.com',
            email='mustafa@example.com',
            password='testpass123',
            first_name='Mustafa',
        )
        self.hussain = User.objects.create_user(
            username='hussain@example.com',
            email='hussain@example.com',
            password='testpass123',
            first_name='Hussain',
        )
        UserProfile.objects.get_or_create(user=self.mustafa, defaults={'currency': 'PKR'})
        UserProfile.objects.get_or_create(user=self.hussain, defaults={'currency': 'PKR'})

        self.m_client = APIClient()
        self.h_client = APIClient()
        self.m_client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.mustafa).access_token}',
        )
        self.h_client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.hussain).access_token}',
        )

        self.m_bank = Account.objects.create(
            user=self.mustafa, name='Meezan', type='bank', opening_balance=Decimal('10000'),
        )
        self.h_bank = Account.objects.create(
            user=self.hussain, name='HBL', type='bank', opening_balance=Decimal('8000'),
        )


class LinkedPeopleInviteTests(LinkedPeopleBase):
    def test_invite_by_email_accept_creates_link(self):
        res = self.m_client.post('/api/people/invitations/', {
            'query': 'hussain@example.com',
            'display_name': 'Hussain',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        invite_id = res.data['id']

        pending = self.h_client.get('/api/people/invitations/pending/')
        self.assertEqual(pending.status_code, 200)
        self.assertEqual(len(pending.data['incoming']), 1)

        res = self.h_client.post(f'/api/people/invitations/{invite_id}/accept/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['invitation']['status'], 'accepted')
        self.assertIn('link', res.data)

        links = self.m_client.get('/api/people/links/')
        self.assertEqual(len(links.data), 1)
        self.assertEqual(links.data[0]['status'], 'active')

        # Each side has a person account
        m_people = self.m_client.get('/api/people/')
        h_people = self.h_client.get('/api/people/')
        m_list = m_people.data if isinstance(m_people.data, list) else m_people.data.get('results', [])
        h_list = h_people.data if isinstance(h_people.data, list) else h_people.data.get('results', [])
        self.assertEqual(len(m_list), 1)
        self.assertEqual(len(h_list), 1)

    def test_invite_by_username(self):
        res = self.m_client.post('/api/people/invitations/', {
            'query': 'hussain@example.com',
        }, format='json')
        self.assertEqual(res.status_code, 201)

    def test_unknown_query(self):
        res = self.m_client.post('/api/people/invitations/', {
            'query': 'nobody@missing.com',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('local person', res.data['detail'].lower())

    def test_self_invite_rejected(self):
        res = self.m_client.post('/api/people/invitations/', {
            'query': 'mustafa@example.com',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_join_by_code(self):
        code_res = self.h_client.get('/api/people/link-code/')
        self.assertEqual(code_res.status_code, 200)
        code = code_res.data['code']
        self.assertTrue(code.startswith('PEEP-'))

        res = self.m_client.post('/api/people/invitations/join/', {'code': code}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        invite_id = res.data['id']

        res = self.h_client.post(f'/api/people/invitations/{invite_id}/accept/', {}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(PeopleLink.objects.filter(status='active').count(), 1)


class LinkedPeopleProposalTests(LinkedPeopleBase):
    def _link(self):
        res = self.m_client.post('/api/people/invitations/', {
            'query': 'hussain@example.com',
            'display_name': 'Hussain',
        }, format='json')
        invite_id = res.data['id']
        res = self.h_client.post(f'/api/people/invitations/{invite_id}/accept/', {}, format='json')
        return res.data['link']['id']

    def test_lend_proposal_accept_mirrors_nets(self):
        link_id = self._link()

        # Hussain proposes lend 500 to Mustafa
        h_links = self.h_client.get('/api/people/links/')
        self.assertEqual(h_links.data[0]['id'], link_id)

        res = self.h_client.post('/api/people/proposals/', {
            'link_id': link_id,
            'action': 'lend',
            'wallet_id': self.h_bank.id,
            'amount': '500.00',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        proposal_id = res.data['proposal']['id']

        self.h_bank.refresh_from_db()
        self.assertEqual(Decimal(str(self.h_bank.current_balance)), Decimal('7500'))
        h_person = Account.objects.get(user=self.hussain, type='person')
        self.assertEqual(Decimal(str(h_person.current_balance)), Decimal('500'))

        # Mustafa accepts with mirror borrow into Meezan
        res = self.m_client.post(f'/api/people/proposals/{proposal_id}/accept/', {
            'wallet_id': self.m_bank.id,
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['mirror_action'], 'borrow')

        self.m_bank.refresh_from_db()
        self.assertEqual(Decimal(str(self.m_bank.current_balance)), Decimal('10500'))
        m_person = Account.objects.get(user=self.mustafa, type='person')
        self.assertEqual(Decimal(str(m_person.current_balance)), Decimal('-500'))

        # Nets invert: Hussain +500 (Mustafa owes him), Mustafa -500 (owes Hussain)
        self.assertEqual(
            Decimal(str(h_person.current_balance)),
            -Decimal(str(m_person.current_balance)),
        )

    def test_decline_proposal_no_counterparty_txs(self):
        link_id = self._link()
        res = self.h_client.post('/api/people/proposals/', {
            'link_id': link_id,
            'action': 'lend',
            'wallet_id': self.h_bank.id,
            'amount': '200',
        }, format='json')
        proposal_id = res.data['proposal']['id']
        self.h_bank.refresh_from_db()
        self.assertEqual(Decimal(str(self.h_bank.current_balance)), Decimal('7800'))

        res = self.m_client.post(f'/api/people/proposals/{proposal_id}/decline/', {}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'declined')
        self.assertTrue(res.data.get('reversed'))

        m_person = Account.objects.get(user=self.mustafa, type='person')
        self.assertEqual(Decimal(str(m_person.current_balance)), Decimal('0'))

        # Proposer legs reversed
        self.h_bank.refresh_from_db()
        self.assertEqual(Decimal(str(self.h_bank.current_balance)), Decimal('8000'))
        h_person = Account.objects.get(user=self.hussain, type='person')
        self.assertEqual(Decimal(str(h_person.current_balance)), Decimal('0'))

    def test_idempotent_proposal_client_mutation_id(self):
        link_id = self._link()
        payload = {
            'link_id': link_id,
            'action': 'lend',
            'wallet_id': self.h_bank.id,
            'amount': '100',
            'client_mutation_id': 'mut-abc-1',
        }
        r1 = self.h_client.post('/api/people/proposals/', payload, format='json')
        r2 = self.h_client.post('/api/people/proposals/', payload, format='json')
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 200)
        id1 = r1.data['proposal']['id']
        id2 = r2.data.get('id') or r2.data.get('proposal', {}).get('id')
        self.assertEqual(id1, id2)
        self.assertEqual(PeopleProposal.objects.filter(client_mutation_id='mut-abc-1').count(), 1)

    def test_local_person_still_works(self):
        res = self.m_client.post('/api/people/', {'name': 'Idrees'}, format='json')
        self.assertEqual(res.status_code, 201)
        person_id = res.data['id']
        res = self.m_client.post('/api/people/actions/', {
            'action': 'borrow',
            'wallet_id': self.m_bank.id,
            'person_id': person_id,
            'amount': '300',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(PeopleLink.objects.count(), 0)

    def test_unlink_blocked_when_net_nonzero(self):
        link_id = self._link()
        res = self.h_client.post('/api/people/proposals/', {
            'link_id': link_id,
            'action': 'lend',
            'wallet_id': self.h_bank.id,
            'amount': '150',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        # Accept so both sides non-zero
        proposal_id = res.data['proposal']['id']
        self.m_client.post(f'/api/people/proposals/{proposal_id}/accept/', {
            'wallet_id': self.m_bank.id,
        }, format='json')
        res = self.m_client.post(f'/api/people/links/{link_id}/unlink/', {}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('settle', res.data['detail'].lower())

    def test_unlink_ok_when_settled(self):
        link_id = self._link()
        res = self.m_client.post(f'/api/people/links/{link_id}/unlink/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'unlinked')
        self.assertEqual(PeopleLink.objects.filter(status='active').count(), 0)


class LinkedPeopleConvertTests(LinkedPeopleBase):
    def test_convert_local_person_keeps_history(self):
        # Local lend creates history on person
        res = self.m_client.post('/api/people/', {'name': 'Hussain local'}, format='json')
        self.assertEqual(res.status_code, 201)
        person_id = res.data['id']
        res = self.m_client.post('/api/people/actions/', {
            'action': 'lend',
            'wallet_id': self.m_bank.id,
            'person_id': person_id,
            'amount': '400',
        }, format='json')
        self.assertEqual(res.status_code, 201)

        res = self.m_client.post('/api/people/invitations/', {
            'query': 'hussain@example.com',
            'display_name': 'Hussain',
            'existing_person_id': person_id,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        invite_id = res.data['id']
        self.assertEqual(res.data.get('existing_person'), person_id)

        res = self.h_client.post(f'/api/people/invitations/{invite_id}/accept/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.data)

        # Same person id on Mustafa's side
        links = self.m_client.get('/api/people/links/')
        self.assertEqual(links.data[0]['my_person']['id'], person_id)
        person = Account.objects.get(id=person_id)
        self.assertEqual(Decimal(str(person.current_balance)), Decimal('400'))

        # Hussain's person opening mirrors
        h_person = Account.objects.get(user=self.hussain, type='person')
        self.assertEqual(Decimal(str(h_person.current_balance)), Decimal('-400'))

        # Only one person on Mustafa (no duplicate)
        m_people = self.m_client.get('/api/people/')
        m_list = m_people.data if isinstance(m_people.data, list) else m_people.data.get('results', [])
        self.assertEqual(len(m_list), 1)
