"""
Linked People APIs — Phase G (invite, join-by-code, proposals, notifications).
Local /api/people/ CRUD + actions stay unchanged.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import transaction as db_transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .expo_push import send_expo_push
from .models import (
    Account,
    DeviceToken,
    PeopleInvitation,
    PeopleLink,
    PeopleNotification,
    PeopleProposal,
    Transaction,
    UserProfile,
    generate_people_link_code,
)
from .serializers import AccountSerializer, TransactionSerializer
from .travel_people_api import MIRROR_PEOPLE_ACTION, post_people_double_entry


# ── Helpers ───────────────────────────────────────────────────────────────────

def _display_name_for(user: User, override: str = '') -> str:
    override = (override or '').strip()
    if override:
        return override[:100]
    full = f'{user.first_name or ""} {user.last_name or ""}'.strip()
    if full:
        return full[:100]
    email = (user.email or user.username or 'Friend').strip()
    return email.split('@')[0][:100] or 'Friend'


def _resolve_user_query(query: str) -> User | None:
    q = (query or '').strip()
    if not q:
        return None
    return User.objects.filter(Q(email__iexact=q) | Q(username__iexact=q)).first()


def _ordered_users(u1: User, u2: User) -> tuple[User, User]:
    return (u1, u2) if u1.id < u2.id else (u2, u1)


def _active_link_between(u1: User, u2: User) -> PeopleLink | None:
    a, b = _ordered_users(u1, u2)
    return PeopleLink.objects.filter(user_a=a, user_b=b, status='active').first()


def _ensure_people_link_code(profile: UserProfile) -> str:
    if profile.people_link_code:
        return profile.people_link_code
    for _ in range(12):
        code = generate_people_link_code()
        if not UserProfile.objects.filter(people_link_code=code).exists():
            profile.people_link_code = code
            profile.save(update_fields=['people_link_code'])
            return code
    raise RuntimeError('Could not allocate people link code.')


def _notify_people_user(
    *,
    user: User,
    actor: User | None,
    kind: str,
    title: str,
    body: str = '',
    invitation: PeopleInvitation | None = None,
    proposal: PeopleProposal | None = None,
    data: dict | None = None,
):
    PeopleNotification.objects.create(
        user=user,
        actor=actor,
        kind=kind,
        title=title[:160],
        body=(body or '')[:255],
        invitation=invitation,
        proposal=proposal,
    )
    tokens = list(DeviceToken.objects.filter(user_id=user.id).values_list('token', flat=True))
    if not tokens:
        return
    payload = {
        'type': 'people',
        'kind': kind,
        **(data or {}),
    }
    if invitation is not None:
        payload['invitation_id'] = invitation.id
    if proposal is not None:
        payload['proposal_id'] = proposal.id
        payload['route'] = 'people'
    try:
        send_expo_push(
            tokens,
            title=title[:160],
            body=(body or '')[:255],
            data=payload,
            channel_id='cashtrail-updates',
        )
    except Exception:
        pass


def _create_link_from_users(
    *,
    from_user: User,
    to_user: User,
    display_name: str,
    invitation: PeopleInvitation | None,
    person_from: Account | None = None,
) -> PeopleLink:
    existing = _active_link_between(from_user, to_user)
    if existing:
        return existing

    name_for_to_on_from = _display_name_for(to_user, display_name)
    name_for_from_on_to = _display_name_for(from_user)

    with db_transaction.atomic():
        if person_from is not None:
            if person_from.user_id != from_user.id or person_from.type != 'person':
                raise ValueError('existing_person must be a person account owned by the inviter.')
            already = PeopleLink.objects.filter(
                status='active',
            ).filter(
                Q(person_a=person_from) | Q(person_b=person_from),
            ).exists()
            if already:
                raise ValueError('That person is already linked.')
            # Keep history; optionally refresh display name
            if name_for_to_on_from and person_from.name != name_for_to_on_from:
                person_from.name = name_for_to_on_from
                person_from.save(update_fields=['name'])
            # Mirror opening so counterparty net inverts when convert has a balance
            mirror_opening = -Decimal(str(person_from.current_balance))
        else:
            person_from = Account.objects.create(
                user=from_user, name=name_for_to_on_from, type='person', opening_balance=Decimal('0'),
            )
            mirror_opening = Decimal('0')

        person_to = Account.objects.create(
            user=to_user,
            name=name_for_from_on_to,
            type='person',
            opening_balance=mirror_opening,
        )
        user_a, user_b = _ordered_users(from_user, to_user)
        if user_a.id == from_user.id:
            person_a, person_b = person_from, person_to
        else:
            person_a, person_b = person_to, person_from
        link = PeopleLink.objects.create(
            user_a=user_a,
            user_b=user_b,
            person_a=person_a,
            person_b=person_b,
            invitation=invitation,
            status='active',
        )
    return link


def _validate_existing_person(user: User, person_id: int | None) -> Account | None:
    if person_id is None:
        return None
    try:
        person = Account.objects.get(id=person_id, user=user, type='person')
    except Account.DoesNotExist:
        raise serializers.ValidationError({'existing_person_id': 'Person not found.'})
    if PeopleLink.objects.filter(status='active').filter(Q(person_a=person) | Q(person_b=person)).exists():
        raise serializers.ValidationError({'existing_person_id': 'That person is already linked.'})
    return person


def _reverse_proposer_proposal_txs(proposal: PeopleProposal) -> int:
    """Delete proposer's posted legs for this proposal. Returns deleted count."""
    deleted, _ = Transaction.objects.filter(
        user_id=proposal.proposer_id,
        people_pair_id=proposal.people_pair_id,
    ).delete()
    return deleted


def _fx_from_data(data: dict) -> dict:
    if data.get('original_amount') is None:
        return {}
    return {
        'original_amount': data['original_amount'],
        'original_currency': data.get('original_currency') or '',
        'fx_rate': data.get('fx_rate'),
        'fx_source': data.get('fx_source') or '',
    }


# ── Serializers ───────────────────────────────────────────────────────────────

class PeopleInvitationSerializer(serializers.ModelSerializer):
    from_user_email = serializers.EmailField(source='from_user.email', read_only=True)
    from_user_name = serializers.SerializerMethodField()
    to_user_email = serializers.EmailField(source='to_user.email', read_only=True)
    to_user_name = serializers.SerializerMethodField()

    class Meta:
        model = PeopleInvitation
        fields = (
            'id', 'from_user', 'to_user', 'from_user_email', 'from_user_name',
            'to_user_email', 'to_user_name', 'display_name', 'status',
            'invited_via', 'query_snapshot', 'existing_person',
            'created_at', 'responded_at',
        )
        read_only_fields = fields

    def get_from_user_name(self, obj):
        return _display_name_for(obj.from_user)

    def get_to_user_name(self, obj):
        return _display_name_for(obj.to_user, obj.display_name)


class PeopleLinkSerializer(serializers.ModelSerializer):
    my_person = serializers.SerializerMethodField()
    other_user = serializers.SerializerMethodField()

    class Meta:
        model = PeopleLink
        fields = (
            'id', 'status', 'created_at', 'unlinked_at',
            'user_a', 'user_b', 'person_a', 'person_b',
            'my_person', 'other_user',
        )
        read_only_fields = fields

    def get_my_person(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        person = obj.person_for(request.user)
        return AccountSerializer(person).data if person else None

    def get_other_user(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        other = obj.other_user(request.user)
        if not other:
            return None
        return {
            'id': other.id,
            'email': other.email,
            'username': other.username,
            'name': _display_name_for(other),
        }


class PeopleProposalSerializer(serializers.ModelSerializer):
    proposer_name = serializers.SerializerMethodField()
    counterparty_person_id = serializers.SerializerMethodField()
    mirror_action = serializers.SerializerMethodField()

    class Meta:
        model = PeopleProposal
        fields = (
            'id', 'link', 'proposer', 'counterparty', 'proposer_name',
            'counterparty_person_id', 'mirror_action',
            'action', 'amount', 'date', 'notes',
            'proposer_wallet', 'counterparty_wallet', 'status', 'people_pair_id',
            'client_mutation_id', 'original_amount', 'original_currency', 'fx_rate', 'fx_source',
            'created_at', 'responded_at',
        )
        read_only_fields = fields

    def get_proposer_name(self, obj):
        return _display_name_for(obj.proposer)

    def get_counterparty_person_id(self, obj):
        request = self.context.get('request')
        user = request.user if request else obj.counterparty
        person = obj.link.person_for(user) if obj.link_id else None
        return person.id if person else None

    def get_mirror_action(self, obj):
        return MIRROR_PEOPLE_ACTION.get(obj.action)


class PeopleNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PeopleNotification
        fields = (
            'id', 'kind', 'title', 'body', 'read', 'invitation', 'proposal',
            'actor', 'created_at',
        )
        read_only_fields = fields


class InviteCreateSerializer(serializers.Serializer):
    query = serializers.CharField(max_length=255)
    display_name = serializers.CharField(required=False, allow_blank=True, max_length=100)
    existing_person_id = serializers.IntegerField(required=False, allow_null=True)


class JoinByCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    display_name = serializers.CharField(required=False, allow_blank=True, max_length=100)
    existing_person_id = serializers.IntegerField(required=False, allow_null=True)


class ProposeSerializer(serializers.Serializer):
    link_id = serializers.IntegerField()
    action = serializers.ChoiceField(choices=['lend', 'borrow', 'pay', 'receive'])
    wallet_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    client_mutation_id = serializers.CharField(required=False, allow_blank=True, max_length=64)
    original_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True,
    )
    original_currency = serializers.CharField(required=False, allow_blank=True, max_length=10)
    fx_rate = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True,
    )
    fx_source = serializers.ChoiceField(
        choices=['live', 'manual', 'cached', 'offline'],
        required=False, allow_blank=True, default='',
    )

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return value


class ProposalAcceptSerializer(serializers.Serializer):
    wallet_id = serializers.IntegerField()


# ── Views ─────────────────────────────────────────────────────────────────────

class PeopleLinkCodeView(APIView):
    """GET current code (auto-create). POST regenerates."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        code = _ensure_people_link_code(profile)
        return Response({'code': code})

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.people_link_code = None
        profile.save(update_fields=['people_link_code'])
        code = _ensure_people_link_code(profile)
        return Response({'code': code})


class PeopleInvitationCreateView(APIView):
    """POST { query, display_name?, existing_person_id? } — invite by email or username."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = InviteCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        query = ser.validated_data['query'].strip()
        display_name = (ser.validated_data.get('display_name') or '').strip()
        try:
            existing_person = _validate_existing_person(
                request.user, ser.validated_data.get('existing_person_id'),
            )
        except serializers.ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        target = _resolve_user_query(query)
        if not target:
            return Response(
                {
                    'detail': (
                        'No CashTrail account with that email or username. '
                        'Add them as a local person instead, or share your link code.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.id == request.user.id:
            return Response({'detail': 'You cannot link with yourself.'}, status=status.HTTP_400_BAD_REQUEST)

        if _active_link_between(request.user, target):
            return Response({'detail': 'You are already linked with this user.'}, status=status.HTTP_400_BAD_REQUEST)

        pending = PeopleInvitation.objects.filter(
            status='pending',
        ).filter(
            Q(from_user=request.user, to_user=target) | Q(from_user=target, to_user=request.user),
        ).first()
        if pending:
            return Response(
                {
                    'detail': 'A pending link invitation already exists.',
                    'invitation': PeopleInvitationSerializer(pending).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        invite = PeopleInvitation.objects.create(
            from_user=request.user,
            to_user=target,
            display_name=display_name or (existing_person.name if existing_person else _display_name_for(target)),
            status='pending',
            invited_via='query',
            query_snapshot=query,
            existing_person=existing_person,
        )
        _notify_people_user(
            user=target,
            actor=request.user,
            kind='link_invite',
            title=f'{_display_name_for(request.user)} wants to link for lend/borrow',
            body='Open CashTrail to accept or decline.',
            invitation=invite,
            data={'route': 'people-invites'},
        )
        return Response(PeopleInvitationSerializer(invite).data, status=status.HTTP_201_CREATED)


class PeopleInvitationPendingView(APIView):
    """Incoming + outgoing pending invitations."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        incoming = PeopleInvitation.objects.filter(to_user=request.user, status='pending')
        outgoing = PeopleInvitation.objects.filter(from_user=request.user, status='pending')
        return Response({
            'incoming': PeopleInvitationSerializer(incoming, many=True).data,
            'outgoing': PeopleInvitationSerializer(outgoing, many=True).data,
        })


class PeopleInvitationActionView(APIView):
    """POST /people/invitations/<id>/accept|decline/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, action_name):
        action_name = (action_name or '').lower()
        if action_name not in ('accept', 'decline', 'cancel'):
            return Response({'detail': 'Unknown action.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invite = PeopleInvitation.objects.select_related('from_user', 'to_user').get(pk=pk)
        except PeopleInvitation.DoesNotExist:
            return Response({'detail': 'Invitation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if invite.status != 'pending':
            return Response({'detail': f'Invitation is already {invite.status}.'}, status=status.HTTP_400_BAD_REQUEST)

        if action_name == 'cancel':
            if invite.from_user_id != request.user.id:
                return Response({'detail': 'Only the sender can cancel.'}, status=status.HTTP_403_FORBIDDEN)
            invite.status = 'cancelled'
            invite.responded_at = timezone.now()
            invite.save(update_fields=['status', 'responded_at'])
            return Response(PeopleInvitationSerializer(invite).data)

        if invite.to_user_id != request.user.id:
            return Response({'detail': 'Only the recipient can accept or decline.'}, status=status.HTTP_403_FORBIDDEN)

        if action_name == 'decline':
            invite.status = 'declined'
            invite.responded_at = timezone.now()
            invite.save(update_fields=['status', 'responded_at'])
            _notify_people_user(
                user=invite.from_user,
                actor=request.user,
                kind='link_declined',
                title=f'{_display_name_for(request.user)} declined your people link',
                invitation=invite,
            )
            return Response(PeopleInvitationSerializer(invite).data)

        # accept
        try:
            link = _create_link_from_users(
                from_user=invite.from_user,
                to_user=invite.to_user,
                display_name=invite.display_name,
                invitation=invite,
                person_from=invite.existing_person,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        invite.status = 'accepted'
        invite.responded_at = timezone.now()
        invite.save(update_fields=['status', 'responded_at'])
        person_id = None
        my_person = link.person_for(invite.from_user)
        if my_person:
            person_id = my_person.id
        _notify_people_user(
            user=invite.from_user,
            actor=request.user,
            kind='link_accepted',
            title=f'{_display_name_for(request.user)} accepted your people link',
            invitation=invite,
            data={'link_id': link.id, 'route': 'people', 'person_id': person_id},
        )
        return Response({
            'invitation': PeopleInvitationSerializer(invite).data,
            'link': PeopleLinkSerializer(link, context={'request': request}).data,
        })


class PeopleJoinByCodeView(APIView):
    """
    POST { code, display_name? } — request a link using someone's PEEP-XXXXXX code.
    Creates a pending invitation from the joiner to the code owner (they must accept),
    or if you own reciprocal pending, returns that.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = JoinByCodeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        code = ser.validated_data['code'].strip().upper()
        display_name = (ser.validated_data.get('display_name') or '').strip()
        try:
            existing_person = _validate_existing_person(
                request.user, ser.validated_data.get('existing_person_id'),
            )
        except serializers.ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        profile = UserProfile.objects.filter(people_link_code__iexact=code).select_related('user').first()
        if not profile:
            return Response({'detail': 'Invalid people link code.'}, status=status.HTTP_400_BAD_REQUEST)

        target = profile.user
        if target.id == request.user.id:
            return Response({'detail': 'That is your own code.'}, status=status.HTTP_400_BAD_REQUEST)

        if _active_link_between(request.user, target):
            return Response({'detail': 'You are already linked with this user.'}, status=status.HTTP_400_BAD_REQUEST)

        pending = PeopleInvitation.objects.filter(
            status='pending',
        ).filter(
            Q(from_user=request.user, to_user=target) | Q(from_user=target, to_user=request.user),
        ).first()
        if pending:
            return Response({
                'detail': 'A pending link invitation already exists.',
                'invitation': PeopleInvitationSerializer(pending).data,
            }, status=status.HTTP_400_BAD_REQUEST)

        # Joiner sends invite TO the code owner (they accept)
        invite = PeopleInvitation.objects.create(
            from_user=request.user,
            to_user=target,
            display_name=display_name or (existing_person.name if existing_person else _display_name_for(target)),
            status='pending',
            invited_via='code',
            query_snapshot=code,
            existing_person=existing_person,
        )
        _notify_people_user(
            user=target,
            actor=request.user,
            kind='link_invite',
            title=f'{_display_name_for(request.user)} used your code to request a people link',
            body='Open CashTrail to accept or decline.',
            invitation=invite,
            data={'route': 'people-invites'},
        )
        return Response(PeopleInvitationSerializer(invite).data, status=status.HTTP_201_CREATED)


class PeopleLinkListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        links = PeopleLink.objects.filter(
            status='active',
        ).filter(
            Q(user_a=request.user) | Q(user_b=request.user),
        ).select_related('user_a', 'user_b', 'person_a', 'person_b')
        return Response(PeopleLinkSerializer(links, many=True, context={'request': request}).data)


class PeopleLinkUnlinkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            link = PeopleLink.objects.select_related('person_a', 'person_b').get(pk=pk, status='active')
        except PeopleLink.DoesNotExist:
            return Response({'detail': 'Link not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.id not in (link.user_a_id, link.user_b_id):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        for person in (link.person_a, link.person_b):
            bal = Decimal(str(person.current_balance))
            if abs(bal) > Decimal('0.01'):
                return Response(
                    {
                        'detail': 'Settle both sides to zero before unlinking.',
                        'person_id': person.id,
                        'balance': float(bal),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Cancel any leftover pending proposals (should be none when settled)
        PeopleProposal.objects.filter(link=link, status='pending').update(
            status='cancelled',
            responded_at=timezone.now(),
        )

        link.status = 'unlinked'
        link.unlinked_at = timezone.now()
        link.save(update_fields=['status', 'unlinked_at'])
        return Response(PeopleLinkSerializer(link, context={'request': request}).data)


class PeopleProposalCreateView(APIView):
    """
    Propose a movement on a linked person.
    Proposer posts their legs immediately; counterparty posts mirror on accept.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ProposeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        user = request.user

        try:
            link = PeopleLink.objects.select_related('person_a', 'person_b', 'user_a', 'user_b').get(
                pk=data['link_id'], status='active',
            )
        except PeopleLink.DoesNotExist:
            return Response({'detail': 'Active link not found.'}, status=status.HTTP_404_NOT_FOUND)
        if user.id not in (link.user_a_id, link.user_b_id):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            wallet = Account.objects.get(id=data['wallet_id'], user=user)
        except Account.DoesNotExist:
            return Response({'wallet_id': 'Wallet not found.'}, status=status.HTTP_400_BAD_REQUEST)
        if wallet.type == 'person':
            return Response({'wallet_id': 'Must be a bank or cash wallet.'}, status=status.HTTP_400_BAD_REQUEST)

        person = link.person_for(user)
        other = link.other_user(user)
        if not person or not other:
            return Response({'detail': 'Invalid link.'}, status=status.HTTP_400_BAD_REQUEST)

        client_mutation_id = (data.get('client_mutation_id') or '').strip()
        if client_mutation_id:
            existing = PeopleProposal.objects.filter(
                proposer=user, client_mutation_id=client_mutation_id,
            ).first()
            if existing:
                return Response(
                    PeopleProposalSerializer(existing).data,
                    status=status.HTTP_200_OK,
                )

        pair_id = client_mutation_id or str(uuid.uuid4())
        amount = data['amount']
        action_name = data['action']
        tx_date = data.get('date') or date.today()
        notes = (data.get('notes') or '').strip()
        fx_kwargs = _fx_from_data(data)

        pair_id, wallet_tx, person_tx, _created = post_people_double_entry(
            user=user,
            action_name=action_name,
            wallet=wallet,
            person=person,
            amount=amount,
            tx_date=tx_date,
            notes=notes,
            pair_id=pair_id,
            client_mutation_id=client_mutation_id or None,
            fx_kwargs=fx_kwargs,
        )

        proposal = PeopleProposal.objects.create(
            link=link,
            proposer=user,
            counterparty=other,
            action=action_name,
            amount=amount,
            date=tx_date,
            notes=notes,
            proposer_wallet=wallet,
            status='pending',
            people_pair_id=pair_id,
            client_mutation_id=client_mutation_id,
            original_amount=data.get('original_amount'),
            original_currency=data.get('original_currency') or '',
            fx_rate=data.get('fx_rate'),
            fx_source=data.get('fx_source') or '',
        )

        action_label = action_name.capitalize()
        _notify_people_user(
            user=other,
            actor=user,
            kind='proposal',
            title=f'{_display_name_for(user)}: {action_label} PKR {amount}',
            body='Accept to post the matching entry on your side.',
            proposal=proposal,
            data={
                'link_id': link.id,
                'person_id': link.person_for(other).id if link.person_for(other) else None,
                'route': 'people',
            },
        )

        wallet.refresh_from_db()
        person.refresh_from_db()
        return Response(
            {
                'proposal': PeopleProposalSerializer(proposal).data,
                'people_pair_id': pair_id,
                'transactions': TransactionSerializer([wallet_tx, person_tx], many=True).data,
                'wallet_balance': float(wallet.current_balance),
                'person_balance': float(person.current_balance),
            },
            status=status.HTTP_201_CREATED,
        )


class PeopleProposalPendingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        incoming = PeopleProposal.objects.filter(counterparty=request.user, status='pending')
        outgoing = PeopleProposal.objects.filter(proposer=request.user, status='pending')
        return Response({
            'incoming': PeopleProposalSerializer(incoming, many=True, context={'request': request}).data,
            'outgoing': PeopleProposalSerializer(outgoing, many=True, context={'request': request}).data,
        })


class PeopleProposalActionView(APIView):
    """POST /people/proposals/<id>/accept|decline/  (accept body: { wallet_id })"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, action_name):
        action_name = (action_name or '').lower()
        if action_name not in ('accept', 'decline'):
            return Response({'detail': 'Unknown action.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            proposal = PeopleProposal.objects.select_related(
                'link', 'link__person_a', 'link__person_b', 'proposer', 'counterparty',
            ).get(pk=pk)
        except PeopleProposal.DoesNotExist:
            return Response({'detail': 'Proposal not found.'}, status=status.HTTP_404_NOT_FOUND)

        if proposal.status != 'pending':
            return Response({'detail': f'Proposal is already {proposal.status}.'}, status=status.HTTP_400_BAD_REQUEST)
        if proposal.counterparty_id != request.user.id:
            return Response({'detail': 'Only the counterparty can respond.'}, status=status.HTTP_403_FORBIDDEN)

        if action_name == 'decline':
            with db_transaction.atomic():
                reversed_count = _reverse_proposer_proposal_txs(proposal)
                proposal.status = 'declined'
                proposal.responded_at = timezone.now()
                proposal.save(update_fields=['status', 'responded_at'])
            person = proposal.link.person_for(proposal.proposer)
            _notify_people_user(
                user=proposal.proposer,
                actor=request.user,
                kind='proposal_declined',
                title=f'{_display_name_for(request.user)} declined your {proposal.action}',
                body='Your entry was reversed on your books.' if reversed_count else '',
                proposal=proposal,
                data={
                    'route': 'people',
                    'person_id': person.id if person else None,
                    'reversed': bool(reversed_count),
                },
            )
            return Response({
                **PeopleProposalSerializer(proposal).data,
                'reversed': bool(reversed_count),
                'reversed_tx_count': reversed_count,
            })

        ser = ProposalAcceptSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            wallet = Account.objects.get(id=ser.validated_data['wallet_id'], user=request.user)
        except Account.DoesNotExist:
            return Response({'wallet_id': 'Wallet not found.'}, status=status.HTTP_400_BAD_REQUEST)
        if wallet.type == 'person':
            return Response({'wallet_id': 'Must be a bank or cash wallet.'}, status=status.HTTP_400_BAD_REQUEST)

        link = proposal.link
        if link.status != 'active':
            return Response({'detail': 'Link is no longer active.'}, status=status.HTTP_400_BAD_REQUEST)

        person = link.person_for(request.user)
        if not person:
            return Response({'detail': 'Person account missing.'}, status=status.HTTP_400_BAD_REQUEST)

        mirror_action = MIRROR_PEOPLE_ACTION[proposal.action]
        mirror_pair_id = f'{proposal.people_pair_id}:mirror'
        fx_kwargs = {}
        if proposal.original_amount is not None:
            fx_kwargs = {
                'original_amount': proposal.original_amount,
                'original_currency': proposal.original_currency or '',
                'fx_rate': proposal.fx_rate,
                'fx_source': proposal.fx_source or '',
            }

        pair_id, wallet_tx, person_tx, created = post_people_double_entry(
            user=request.user,
            action_name=mirror_action,
            wallet=wallet,
            person=person,
            amount=proposal.amount,
            tx_date=proposal.date,
            notes=proposal.notes,
            pair_id=mirror_pair_id,
            client_mutation_id=mirror_pair_id,
            fx_kwargs=fx_kwargs,
        )

        proposal.status = 'accepted'
        proposal.counterparty_wallet = wallet
        proposal.responded_at = timezone.now()
        proposal.save(update_fields=['status', 'counterparty_wallet', 'responded_at'])

        _notify_people_user(
            user=proposal.proposer,
            actor=request.user,
            kind='proposal_accepted',
            title=f'{_display_name_for(request.user)} accepted your {proposal.action}',
            proposal=proposal,
        )

        wallet.refresh_from_db()
        person.refresh_from_db()
        return Response(
            {
                'proposal': PeopleProposalSerializer(proposal).data,
                'mirror_action': mirror_action,
                'people_pair_id': pair_id,
                'transactions': TransactionSerializer([wallet_tx, person_tx], many=True).data,
                'wallet_balance': float(wallet.current_balance),
                'person_balance': float(person.current_balance),
                'created': created,
            },
            status=status.HTTP_200_OK,
        )


class PeopleNotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = PeopleNotification.objects.filter(user=request.user)[:50]
        unread = PeopleNotification.objects.filter(user=request.user, read=False).count()
        return Response({
            'unread_count': unread,
            'results': PeopleNotificationSerializer(qs, many=True).data,
        })


class PeopleNotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk=None):
        if pk is None:
            PeopleNotification.objects.filter(user=request.user, read=False).update(read=True)
            return Response({'ok': True})
        updated = PeopleNotification.objects.filter(user=request.user, pk=pk).update(read=True)
        if not updated:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'ok': True})
