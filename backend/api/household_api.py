"""Household sharing API — Phase 1 MVP."""
from datetime import timedelta

from django.contrib.auth.models import User
from django.db.models import Sum, Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Household, HouseholdMembership, HouseholdInvite, HouseholdLedger, HouseholdExpense,
    Account, Transaction,
    generate_household_invite_code, generate_invite_token,
)


INVITE_TTL_DAYS = 7


def _display_name(user):
    if not user:
        return ''
    full = f'{user.first_name} {user.last_name}'.strip()
    return full or user.username or user.email


def user_active_membership(user, household_id):
    return HouseholdMembership.objects.filter(
        household_id=household_id, user=user, status='active',
    ).first()


def require_active_member(user, household_id):
    m = user_active_membership(user, household_id)
    if not m:
        return None
    return m


def require_owner_or_admin(user, household_id):
    m = require_active_member(user, household_id)
    if not m or m.role not in ('owner', 'admin'):
        return None
    return m


def create_invite_for(household, user):
    # Revoke previous active invites for this household (single current code)
    HouseholdInvite.objects.filter(household=household, revoked=False).update(revoked=True)
    code = generate_household_invite_code()
    while HouseholdInvite.objects.filter(code=code).exists():
        code = generate_household_invite_code()
    token = generate_invite_token()
    while HouseholdInvite.objects.filter(token=token).exists():
        token = generate_invite_token()
    return HouseholdInvite.objects.create(
        household=household,
        code=code,
        token=token,
        created_by=user,
        expires_at=timezone.now() + timedelta(days=INVITE_TTL_DAYS),
    )


# ── Serializers ──────────────────────────────────────────────────────────────

class HouseholdMemberSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    class Meta:
        model = HouseholdMembership
        fields = (
            'id', 'user', 'display_name', 'email', 'role', 'status',
            'invited_via', 'invited_email', 'joined_at', 'created_at',
        )

    def get_display_name(self, obj):
        return _display_name(obj.user) if obj.user_id else (obj.invited_email or 'Pending')

    def get_email(self, obj):
        return obj.user.email if obj.user_id else obj.invited_email


class HouseholdSerializer(serializers.ModelSerializer):
    my_role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    ledger_count = serializers.SerializerMethodField()

    class Meta:
        model = Household
        fields = (
            'id', 'name', 'currency', 'created_by', 'created_at',
            'my_role', 'member_count', 'ledger_count',
        )
        read_only_fields = ('created_by', 'created_at')

    def get_my_role(self, obj):
        req = self.context.get('request')
        if not req or not req.user.is_authenticated:
            return None
        m = user_active_membership(req.user, obj.id)
        return m.role if m else None

    def get_member_count(self, obj):
        return obj.memberships.filter(status='active').count()

    def get_ledger_count(self, obj):
        return obj.ledgers.count()


class HouseholdInviteSerializer(serializers.ModelSerializer):
    is_valid = serializers.BooleanField(read_only=True)
    join_path = serializers.SerializerMethodField()

    class Meta:
        model = HouseholdInvite
        fields = (
            'id', 'code', 'token', 'expires_at', 'max_uses', 'use_count',
            'revoked', 'is_valid', 'join_path', 'created_at',
        )

    def get_join_path(self, obj):
        return f'/household/join?code={obj.code}'


class HouseholdLedgerSerializer(serializers.ModelSerializer):
    total_spent = serializers.ReadOnlyField()
    month_spent = serializers.SerializerMethodField()
    household_name = serializers.CharField(source='household.name', read_only=True)

    class Meta:
        model = HouseholdLedger
        fields = (
            'id', 'household', 'household_name', 'name', 'kind', 'status', 'start_date', 'end_date',
            'opening_float', 'notes', 'closed_at', 'closed_by', 'closed_total_expense',
            'total_spent', 'month_spent', 'created_at',
        )
        read_only_fields = (
            'household', 'closed_at', 'closed_by', 'closed_total_expense', 'created_at',
        )

    def get_month_spent(self, obj):
        req = self.context.get('request')
        year = month = None
        if req:
            year = req.query_params.get('year')
            month = req.query_params.get('month')
        today = timezone.localdate()
        y = int(year) if year else today.year
        m = int(month) if month else today.month
        total = obj.expenses.filter(date__year=y, date__month=m).aggregate(
            total=Sum('amount'))['total'] or 0
        return float(total)


class HouseholdExpenseSerializer(serializers.ModelSerializer):
    paid_by_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    account_name = serializers.SerializerMethodField()

    class Meta:
        model = HouseholdExpense
        fields = (
            'id', 'ledger', 'amount', 'date', 'category', 'notes',
            'created_by', 'created_by_name', 'paid_by', 'paid_by_name',
            'linked_transaction', 'linked_account', 'account_name', 'created_at',
        )
        read_only_fields = ('created_by', 'created_at', 'linked_transaction')
        extra_kwargs = {
            'ledger': {'required': False},
            'paid_by': {'required': False},
        }

    def get_paid_by_name(self, obj):
        return _display_name(obj.paid_by)

    def get_created_by_name(self, obj):
        return _display_name(obj.created_by)

    def get_account_name(self, obj):
        return obj.linked_account.name if obj.linked_account_id else None


class PendingInviteSerializer(serializers.ModelSerializer):
    household_id = serializers.IntegerField(source='household.id')
    household_name = serializers.CharField(source='household.name')
    invited_by_name = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = HouseholdMembership
        fields = (
            'id', 'household_id', 'household_name', 'status', 'invited_via',
            'invited_by_name', 'member_count', 'created_at',
        )

    def get_invited_by_name(self, obj):
        return _display_name(obj.invited_by)

    def get_member_count(self, obj):
        return obj.household.memberships.filter(status='active').count()


# ── ViewSets ─────────────────────────────────────────────────────────────────

class HouseholdViewSet(viewsets.ModelViewSet):
    serializer_class = HouseholdSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Household.objects.filter(
            memberships__user=self.request.user,
            memberships__status='active',
        ).distinct()

    def perform_create(self, serializer):
        user = self.request.user
        currency = 'PKR'
        try:
            currency = user.profile.currency or 'PKR'
        except Exception:
            pass
        household = serializer.save(created_by=user, currency=currency)
        HouseholdMembership.objects.create(
            household=household,
            user=user,
            role='owner',
            status='active',
            invited_via='create',
            joined_at=timezone.now(),
        )
        # Default ongoing ledger
        HouseholdLedger.objects.create(
            household=household,
            name='Home monthly',
            kind='ongoing',
            status='open',
            start_date=timezone.localdate(),
        )
        create_invite_for(household, user)

    def destroy(self, request, *args, **kwargs):
        household = self.get_object()
        m = require_active_member(request.user, household.id)
        if not m or m.role != 'owner':
            return Response({'detail': 'Only the owner can delete a household.'}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def members(self, request, pk=None):
        household = self.get_object()
        qs = household.memberships.filter(status__in=['active', 'invited']).select_related('user')
        return Response(HouseholdMemberSerializer(qs, many=True).data)

    @action(detail=True, methods=['get', 'post'])
    def invites(self, request, pk=None):
        household = self.get_object()
        m = require_owner_or_admin(request.user, household.id)
        if not m:
            return Response({'detail': 'Only owner/admin can manage invites.'}, status=403)
        if request.method == 'GET':
            inv = household.invites.filter(revoked=False).order_by('-created_at').first()
            if not inv:
                return Response(None)
            return Response(HouseholdInviteSerializer(inv).data)
        # POST = create / regenerate
        inv = create_invite_for(household, request.user)
        return Response(HouseholdInviteSerializer(inv).data, status=201)

    @action(detail=True, methods=['post'], url_path='invites/revoke')
    def revoke_invite(self, request, pk=None):
        household = self.get_object()
        m = require_owner_or_admin(request.user, household.id)
        if not m:
            return Response({'detail': 'Only owner/admin can revoke invites.'}, status=403)
        household.invites.filter(revoked=False).update(revoked=True)
        return Response({'ok': True})

    @action(detail=True, methods=['post'], url_path='invite-by-email')
    def invite_by_email(self, request, pk=None):
        household = self.get_object()
        m = require_owner_or_admin(request.user, household.id)
        if not m:
            return Response({'detail': 'Only owner/admin can invite.'}, status=403)
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return Response({'email': 'Required.'}, status=400)

        existing_user = User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).first()
        if existing_user:
            if HouseholdMembership.objects.filter(
                household=household, user=existing_user, status='active',
            ).exists():
                return Response({'detail': 'User is already a member.'}, status=400)
            mem, created = HouseholdMembership.objects.update_or_create(
                household=household,
                user=existing_user,
                defaults={
                    'status': 'invited',
                    'role': 'member',
                    'invited_via': 'email',
                    'invited_by': request.user,
                    'invited_email': email,
                    'joined_at': None,
                },
            )
            return Response(PendingInviteSerializer(mem).data, status=201 if created else 200)

        # Invite to register — hold pending by email
        mem = HouseholdMembership.objects.filter(
            household=household, user__isnull=True, invited_email__iexact=email,
        ).first()
        if mem:
            mem.status = 'invited'
            mem.invited_by = request.user
            mem.invited_via = 'email'
            mem.save()
            created = False
        else:
            mem = HouseholdMembership.objects.create(
                household=household,
                user=None,
                invited_email=email,
                status='invited',
                role='member',
                invited_via='email',
                invited_by=request.user,
            )
            created = True
        return Response({
            **PendingInviteSerializer(mem).data,
            'invite_to_register': True,
            'detail': 'No account yet — invite held until they sign up with this email.',
        }, status=201 if created else 200)

    @action(detail=True, methods=['get', 'post'])
    def ledgers(self, request, pk=None):
        household = self.get_object()
        if request.method == 'GET':
            qs = household.ledgers.all()
            return Response(HouseholdLedgerSerializer(qs, many=True, context={'request': request}).data)
        m = require_active_member(request.user, household.id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)
        if m.role == 'member' and not require_owner_or_admin(request.user, household.id):
            # members can create ledgers in P1 for simplicity — research said optional
            pass
        ser = HouseholdLedgerSerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)
        kind = ser.validated_data.get('kind', 'ongoing')
        ledger = ser.save(
            household=household,
            kind=kind if kind in ('ongoing', 'event') else 'ongoing',
            status='open',
        )
        return Response(
            HouseholdLedgerSerializer(ledger, context={'request': request}).data,
            status=201,
        )


class HouseholdLedgerViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HouseholdLedgerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = HouseholdLedger.objects.filter(
            household__memberships__user=self.request.user,
            household__memberships__status='active',
        ).distinct().select_related('household')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @action(detail=True, methods=['get', 'post'])
    def expenses(self, request, pk=None):
        ledger = self.get_object()
        m = require_active_member(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)

        if request.method == 'GET':
            qs = ledger.expenses.select_related('paid_by', 'created_by', 'linked_account')
            year = request.query_params.get('year')
            month = request.query_params.get('month')
            if year and month:
                qs = qs.filter(date__year=int(year), date__month=int(month))
            total = qs.aggregate(total=Sum('amount'))['total'] or 0
            return Response({
                'results': HouseholdExpenseSerializer(qs, many=True).data,
                'total': float(total),
            })

        if ledger.status == 'closed':
            return Response({'detail': 'This ledger is closed.'}, status=400)

        ser = HouseholdExpenseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        paid_by = ser.validated_data.get('paid_by') or request.user
        if not HouseholdMembership.objects.filter(
            household=ledger.household, user=paid_by, status='active',
        ).exists():
            return Response({'paid_by': 'Must be an active household member.'}, status=400)

        linked_account = ser.validated_data.get('linked_account')
        linked_tx = None
        # Dual-link from household hub: wallet selected → personal expense + shared line
        if linked_account:
            if linked_account.user_id != request.user.id:
                return Response(
                    {'linked_account': 'You can only pay from your own wallet.'},
                    status=400,
                )
            linked_tx = Transaction.objects.create(
                user=request.user,
                type='expense',
                amount=ser.validated_data['amount'],
                date=ser.validated_data['date'],
                account=linked_account,
                category=ser.validated_data.get('category') or '',
                notes=ser.validated_data.get('notes') or f'Household: {ledger.name}',
            )

        expense = ser.save(
            ledger=ledger,
            created_by=request.user,
            paid_by=paid_by,
            linked_transaction=linked_tx,
            linked_account=linked_account,
        )
        return Response(HouseholdExpenseSerializer(expense).data, status=201)


class HouseholdExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = HouseholdExpenseSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return HouseholdExpense.objects.filter(
            ledger__household__memberships__user=self.request.user,
            ledger__household__memberships__status='active',
        ).distinct()

    def update(self, request, *args, **kwargs):
        expense = self.get_object()
        m = require_active_member(request.user, expense.ledger.household_id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)
        if expense.created_by_id != request.user.id and m.role not in ('owner', 'admin'):
            return Response({'detail': 'You can only edit your own expenses.'}, status=403)
        if expense.ledger.status == 'closed':
            return Response({'detail': 'This ledger is closed.'}, status=400)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        expense = self.get_object()
        m = require_active_member(request.user, expense.ledger.household_id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)
        if expense.created_by_id != request.user.id and m.role not in ('owner', 'admin'):
            return Response({'detail': 'You can only delete your own expenses.'}, status=403)
        if expense.ledger.status == 'closed':
            return Response({'detail': 'This ledger is closed.'}, status=400)
        # Dual-link: also remove personal wallet transaction
        tx = expense.linked_transaction
        expense.delete()
        if tx and tx.user_id == request.user.id:
            # Avoid recursion through Transaction.perform_destroy household cascade
            Transaction.objects.filter(pk=tx.pk).delete()
        elif tx:
            # Expense created by member but somehow linked to another's tx — leave wallet alone
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class JoinPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = (request.data.get('code') or '').strip().upper()
        token = (request.data.get('token') or '').strip()
        inv = None
        if code:
            inv = HouseholdInvite.objects.filter(code__iexact=code).select_related('household').first()
        elif token:
            inv = HouseholdInvite.objects.filter(token=token).select_related('household').first()
        if not inv or not inv.is_valid:
            return Response({'detail': 'Invalid or expired invite code.'}, status=400)
        h = inv.household
        if user_active_membership(request.user, h.id):
            return Response({'detail': 'You are already a member.', 'already_member': True}, status=400)
        return Response({
            'household_id': h.id,
            'household_name': h.name,
            'member_count': h.memberships.filter(status='active').count(),
            'code': inv.code,
            'expires_at': inv.expires_at,
        })


class JoinAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = (request.data.get('code') or '').strip().upper()
        token = (request.data.get('token') or '').strip()
        inv = None
        if code:
            inv = HouseholdInvite.objects.filter(code__iexact=code).select_related('household').first()
        elif token:
            inv = HouseholdInvite.objects.filter(token=token).select_related('household').first()
        if not inv or not inv.is_valid:
            return Response({'detail': 'Invalid or expired invite code.'}, status=400)
        h = inv.household
        if user_active_membership(request.user, h.id):
            return Response({'detail': 'You are already a member.', 'already_member': True}, status=400)

        mem, _ = HouseholdMembership.objects.update_or_create(
            household=h,
            user=request.user,
            defaults={
                'status': 'active',
                'role': 'member',
                'invited_via': 'code' if code else 'link',
                'invited_by': inv.created_by,
                'joined_at': timezone.now(),
                'invited_email': request.user.email or '',
            },
        )
        inv.use_count += 1
        inv.save(update_fields=['use_count'])
        return Response(HouseholdSerializer(h, context={'request': request}).data, status=200)


class PendingInvitationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        email = (request.user.email or '').lower()
        qs = HouseholdMembership.objects.filter(status='invited').filter(
            Q(user=request.user) | Q(user__isnull=True, invited_email__iexact=email)
        ).select_related('household', 'invited_by')
        return Response(PendingInviteSerializer(qs, many=True).data)


class PendingInvitationActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, action_name):
        try:
            mem = HouseholdMembership.objects.select_related('household').get(pk=pk, status='invited')
        except HouseholdMembership.DoesNotExist:
            return Response({'detail': 'Invite not found.'}, status=404)

        email = (request.user.email or '').lower()
        allowed = (
            mem.user_id == request.user.id
            or (not mem.user_id and mem.invited_email.lower() == email)
        )
        if not allowed:
            return Response({'detail': 'Not your invitation.'}, status=403)

        if action_name == 'accept':
            mem.user = request.user
            mem.status = 'active'
            mem.joined_at = timezone.now()
            mem.invited_email = request.user.email or mem.invited_email
            mem.save()
            return Response(HouseholdSerializer(mem.household, context={'request': request}).data)
        if action_name == 'decline':
            mem.status = 'declined'
            mem.save(update_fields=['status'])
            return Response({'ok': True})
        return Response({'detail': 'Unknown action.'}, status=400)
