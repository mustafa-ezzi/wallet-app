"""Household sharing API — Phase 1–5."""
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

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
    HouseholdContribution, HouseholdSettlementMark, HouseholdNotification,
    Account, Transaction,
    generate_household_invite_code, generate_invite_token,
)


INVITE_TTL_DAYS = 7


def _display_name(user):
    if not user:
        return ''
    full = f'{user.first_name} {user.last_name}'.strip()
    return full or user.username or user.email


def _expense_breakdown(rows):
    """Totals + by-member / by-category from a list of HouseholdExpense rows."""
    total = sum(float(r.amount) for r in rows)
    by_member: dict[str, float] = {}
    by_category: dict[str, float] = {}
    for r in rows:
        name = _display_name(r.paid_by) or 'Unknown'
        by_member[name] = by_member.get(name, 0) + float(r.amount)
        cat = r.category.strip() if r.category else 'Uncategorized'
        by_category[cat] = by_category.get(cat, 0) + float(r.amount)
    return {
        'total_spent': total,
        'expense_count': len(rows),
        'by_member': [
            {'name': k, 'amount': v}
            for k, v in sorted(by_member.items(), key=lambda x: -x[1])
        ],
        'by_category': [
            {'name': k, 'amount': v}
            for k, v in sorted(by_category.items(), key=lambda x: -x[1])
        ],
    }


def ledger_summary(ledger):
    """Totals + breakdowns for close screen / reports (full ledger)."""
    rows = list(ledger.expenses.select_related('paid_by').all())
    return _expense_breakdown(rows)


def ledger_report(ledger, year=None, month=None):
    """
    Complete breakdown for a period.
    year+month → filter to that calendar month (ongoing monthly view).
    Omit both → full history (events / closed / all-time).
    """
    qs = ledger.expenses.select_related('paid_by', 'linked_account').order_by('date', 'id')
    period = 'all'
    if year is not None and month is not None:
        qs = qs.filter(date__year=int(year), date__month=int(month))
        period = f'{int(year):04d}-{int(month):02d}'

    rows = list(qs)
    data = _expense_breakdown(rows)

    # Daily timeline: one group per date with line items
    by_day: dict[str, list] = {}
    day_totals: dict[str, float] = {}
    for r in rows:
        key = r.date.isoformat()
        day_totals[key] = day_totals.get(key, 0) + float(r.amount)
        by_day.setdefault(key, []).append({
            'id': r.id,
            'amount': float(r.amount),
            'category': r.category or 'Uncategorized',
            'notes': r.notes or '',
            'paid_by_name': _display_name(r.paid_by) or 'Unknown',
            'account_name': r.linked_account.name if r.linked_account_id else None,
        })

    timeline = [
        {
            'date': d,
            'total': day_totals[d],
            'count': len(by_day[d]),
            'items': by_day[d],
        }
        for d in sorted(by_day.keys(), reverse=True)
    ]

    data.update({
        'period': period,
        'year': int(year) if year is not None else None,
        'month': int(month) if month is not None else None,
        'timeline': timeline,
        'ledger': {
            'id': ledger.id,
            'name': ledger.name,
            'kind': ledger.kind,
            'status': ledger.status,
            'closed_total_expense': (
                float(ledger.closed_total_expense)
                if ledger.closed_total_expense is not None else None
            ),
        },
    })

    # Closed-event consistency: snapshot vs live full history
    if ledger.status == 'closed' and period == 'all':
        snap = float(ledger.closed_total_expense or 0)
        live = data['total_spent']
        data['snapshot_total'] = snap
        data['live_total'] = live
        data['snapshot_matches'] = abs(snap - live) < 0.01
    else:
        data['snapshot_total'] = None
        data['live_total'] = None
        data['snapshot_matches'] = None

    return data


def _money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def simplify_debts(nets: dict[int, Decimal]) -> list[tuple[int, int, Decimal]]:
    """
    Turn member nets into suggested transfers (from_id, to_id, amount).
    net > 0 → owed money; net < 0 → owes money.
    """
    debtors = [(uid, -n) for uid, n in nets.items() if n < 0]
    creditors = [(uid, n) for uid, n in nets.items() if n > 0]
    debtors.sort(key=lambda x: -x[1])
    creditors.sort(key=lambda x: -x[1])
    transfers = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        d_id, d_amt = debtors[i]
        c_id, c_amt = creditors[j]
        pay = min(d_amt, c_amt)
        if pay > 0:
            transfers.append((d_id, c_id, _money(pay)))
        d_amt -= pay
        c_amt -= pay
        debtors[i] = (d_id, d_amt)
        creditors[j] = (c_id, c_amt)
        if d_amt <= Decimal('0.001'):
            i += 1
        if c_amt <= Decimal('0.001'):
            j += 1
    return transfers


def ledger_pot_stats(ledger, exclude_expense_id=None):
    """Contributed / spent / remaining pot for a ledger."""
    contributed = ledger.contributions.aggregate(total=Sum('amount'))['total'] or 0
    spent_qs = ledger.expenses.all()
    if exclude_expense_id:
        spent_qs = spent_qs.exclude(pk=exclude_expense_id)
    spent = spent_qs.aggregate(total=Sum('pot_amount'))['total'] or 0
    contributed = _money(contributed)
    spent = _money(spent)
    return {
        'pot_contributed': float(contributed),
        'pot_spent': float(spent),
        'pot_balance': float(_money(contributed - spent)),
    }


def compute_settlement(ledger):
    """
    credit[m] = wallet-paid expenses (amount − pot_amount) + contributions by m
    fair_share = total_expenses / N
    net[m] = credit[m] - fair_share
    """
    members = list(
        ledger.household.memberships.filter(status='active', user__isnull=False)
        .select_related('user')
    )
    n = len(members)
    users = [m.user for m in members]
    user_ids = [u.id for u in users]

    expenses = list(ledger.expenses.select_related('paid_by'))
    contributions = list(ledger.contributions.select_related('contributed_by'))

    total_expenses = _money(sum((e.amount for e in expenses), Decimal('0')))
    total_contributions = _money(sum((c.amount for c in contributions), Decimal('0')))
    pot_stats = ledger_pot_stats(ledger)
    fair_share = _money(total_expenses / n) if n else Decimal('0.00')

    paid: dict[int, Decimal] = {uid: Decimal('0.00') for uid in user_ids}
    pot: dict[int, Decimal] = {uid: Decimal('0.00') for uid in user_ids}
    for e in expenses:
        if e.paid_by_id in paid:
            # Only personal outlay counts toward paid credit (pot portion already credited via contributions)
            personal = _money(e.amount) - _money(e.pot_amount or 0)
            if personal > 0:
                paid[e.paid_by_id] = _money(paid[e.paid_by_id] + personal)
    for c in contributions:
        if c.contributed_by_id in pot:
            pot[c.contributed_by_id] = _money(pot[c.contributed_by_id] + c.amount)

    credits = []
    nets: dict[int, Decimal] = {}
    for u in users:
        p = paid.get(u.id, Decimal('0.00'))
        pot_amt = pot.get(u.id, Decimal('0.00'))
        credit = _money(p + pot_amt)
        net = _money(credit - fair_share)
        nets[u.id] = net
        if net > 0:
            meaning = 'owed'
        elif net < 0:
            meaning = 'owes'
        else:
            meaning = 'settled'
        credits.append({
            'user_id': u.id,
            'name': _display_name(u),
            'expenses_paid': float(p),
            'contributions': float(pot_amt),
            'credit': float(credit),
            'fair_share': float(fair_share),
            'net': float(net),
            'meaning': meaning,
        })
    credits.sort(key=lambda x: -x['credit'])

    transfers_raw = simplify_debts(nets)
    marks = list(
        ledger.settlement_marks.select_related('from_user', 'to_user', 'marked_by').all()
    )

    member_ids = set(user_ids)
    external_paid = Decimal('0.00')
    for e in expenses:
        if e.paid_by_id not in member_ids:
            personal = _money(e.amount) - _money(e.pot_amount or 0)
            if personal > 0:
                external_paid = _money(external_paid + personal)

    is_even = all(abs(n) < Decimal('0.01') for n in nets.values())
    if n and total_expenses > 0:
        summary_line = (
            f'{float(total_expenses):,.2f} split among {n} '
            f'= {float(fair_share):,.2f} each'
        )
    elif n:
        summary_line = f'No shared expenses yet ({n} members).'
    else:
        summary_line = 'Add members to split expenses.'

    def mark_key(a, b, amount):
        return (a, b, float(_money(amount)))

    marked_set = {
        mark_key(m.from_user_id, m.to_user_id, m.amount): m
        for m in marks
    }

    transfers = []
    for from_id, to_id, amount in transfers_raw:
        key = mark_key(from_id, to_id, amount)
        mark = marked_set.get(key)
        # Also match if any mark exists for same pair with same amount (float tolerance)
        if not mark:
            for mk, mv in marked_set.items():
                if mk[0] == from_id and mk[1] == to_id and abs(mk[2] - float(amount)) < 0.02:
                    mark = mv
                    break
        from_user = next(u for u in users if u.id == from_id)
        to_user = next(u for u in users if u.id == to_id)
        transfers.append({
            'from_user_id': from_id,
            'from_name': _display_name(from_user),
            'to_user_id': to_id,
            'to_name': _display_name(to_user),
            'amount': float(amount),
            'settled': mark is not None,
            'mark_id': mark.id if mark else None,
            'mark_note': mark.note if mark else '',
        })

    return {
        'member_count': n,
        'total_expenses': float(total_expenses),
        'total_contributions': float(total_contributions),
        'pot_spent': pot_stats['pot_spent'],
        'pot_balance': pot_stats['pot_balance'],
        'fair_share': float(fair_share),
        'external_paid': float(external_paid),
        'is_even': is_even,
        'summary_line': summary_line,
        'credits': credits,
        'transfers': transfers,
        'disclaimer': 'Split equally among members. CashTrail suggests payments — you settle outside the app.',
    }


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


def notify_household_members(*, household, actor, kind, title, body='', ledger=None, expense=None, contribution=None):
    """Fan-out in-app notifications to other active members (not the actor)."""
    recipient_ids = list(
        household.memberships.filter(status='active', user__isnull=False)
        .exclude(user=actor)
        .values_list('user_id', flat=True)
    )
    if not recipient_ids:
        return
    HouseholdNotification.objects.bulk_create([
        HouseholdNotification(
            user_id=uid,
            household=household,
            ledger=ledger,
            expense=expense,
            contribution=contribution,
            actor=actor,
            kind=kind,
            title=title[:160],
            body=(body or '')[:255],
        )
        for uid in recipient_ids
    ])


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


class HouseholdNotificationSerializer(serializers.ModelSerializer):
    household_name = serializers.CharField(source='household.name', read_only=True)
    actor_name = serializers.SerializerMethodField()
    is_read = serializers.BooleanField(read_only=True)

    class Meta:
        model = HouseholdNotification
        fields = (
            'id', 'household', 'household_name', 'ledger', 'expense', 'contribution',
            'actor', 'actor_name', 'kind', 'title', 'body', 'read_at', 'is_read', 'created_at',
        )

    def get_actor_name(self, obj):
        return _display_name(obj.actor) if obj.actor_id else ''


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
    pot_contributed = serializers.ReadOnlyField()
    pot_spent = serializers.ReadOnlyField()
    pot_balance = serializers.ReadOnlyField()
    household_name = serializers.CharField(source='household.name', read_only=True)
    closed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HouseholdLedger
        fields = (
            'id', 'household', 'household_name', 'name', 'kind', 'status', 'start_date', 'end_date',
            'opening_float', 'notes', 'closed_at', 'closed_by', 'closed_by_name', 'closed_total_expense',
            'total_spent', 'month_spent', 'pot_contributed', 'pot_spent', 'pot_balance', 'created_at',
        )
        read_only_fields = (
            'household', 'closed_at', 'closed_by', 'closed_total_expense', 'created_at',
        )

    def get_closed_by_name(self, obj):
        return _display_name(obj.closed_by) if obj.closed_by_id else None

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
    personal_amount = serializers.ReadOnlyField()

    class Meta:
        model = HouseholdExpense
        fields = (
            'id', 'ledger', 'amount', 'date', 'category', 'notes', 'pot_amount', 'personal_amount',
            'created_by', 'created_by_name', 'paid_by', 'paid_by_name',
            'linked_transaction', 'linked_account', 'account_name', 'created_at',
        )
        read_only_fields = ('created_by', 'created_at', 'linked_transaction')
        extra_kwargs = {
            'ledger': {'required': False},
            'paid_by': {'required': False},
            'pot_amount': {'required': False},
        }

    def get_paid_by_name(self, obj):
        return _display_name(obj.paid_by)

    def get_created_by_name(self, obj):
        return _display_name(obj.created_by)

    def get_account_name(self, obj):
        return obj.linked_account.name if obj.linked_account_id else None


class HouseholdContributionSerializer(serializers.ModelSerializer):
    contributed_by_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    account_name = serializers.SerializerMethodField()

    class Meta:
        model = HouseholdContribution
        fields = (
            'id', 'ledger', 'amount', 'date', 'notes',
            'contributed_by', 'contributed_by_name', 'created_by', 'created_by_name',
            'linked_transaction', 'linked_account', 'account_name', 'created_at',
        )
        read_only_fields = ('created_by', 'created_at', 'linked_transaction', 'contributed_by')
        extra_kwargs = {
            'ledger': {'required': False},
        }

    def get_contributed_by_name(self, obj):
        return _display_name(obj.contributed_by)

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

    def update(self, request, *args, **kwargs):
        household = self.get_object()
        m = require_owner_or_admin(request.user, household.id)
        if not m:
            return Response({'detail': 'Only owner/admin can edit this household.'}, status=403)
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(household, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        # Only name/currency are editable
        allowed = {}
        if 'name' in serializer.validated_data:
            name = (serializer.validated_data['name'] or '').strip()
            if not name:
                return Response({'name': 'Name is required.'}, status=400)
            allowed['name'] = name[:120]
        if 'currency' in serializer.validated_data:
            allowed['currency'] = serializer.validated_data['currency']
        for k, v in allowed.items():
            setattr(household, k, v)
        if allowed:
            household.save(update_fields=list(allowed.keys()))
        return Response(HouseholdSerializer(household, context={'request': request}).data)

    @action(detail=True, methods=['get'])
    def members(self, request, pk=None):
        household = self.get_object()
        qs = household.memberships.filter(status__in=['active', 'invited']).select_related('user')
        return Response(HouseholdMemberSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        household = self.get_object()
        m = require_active_member(request.user, household.id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)
        active_count = household.memberships.filter(status='active').count()
        if m.role == 'owner':
            if active_count > 1:
                return Response(
                    {'detail': 'Owner cannot leave while others remain. Promote another owner or remove members first.'},
                    status=400,
                )
            household.delete()
            return Response({'ok': True, 'deleted': True})
        m.status = 'left'
        m.save(update_fields=['status'])
        return Response({'ok': True, 'deleted': False})

    @action(detail=True, methods=['post'], url_path=r'members/(?P<member_id>[0-9]+)/remove')
    def remove_member(self, request, pk=None, member_id=None):
        household = self.get_object()
        actor = require_owner_or_admin(request.user, household.id)
        if not actor:
            return Response({'detail': 'Only owner/admin can remove members.'}, status=403)
        target = household.memberships.filter(pk=member_id).select_related('user').first()
        if not target or target.status != 'active':
            return Response({'detail': 'Member not found.'}, status=404)
        if target.role == 'owner':
            return Response({'detail': 'Cannot remove the owner.'}, status=400)
        if target.user_id == request.user.id:
            return Response({'detail': 'Use leave to exit the household.'}, status=400)
        if actor.role == 'admin' and target.role == 'admin':
            return Response({'detail': 'Admins cannot remove other admins.'}, status=403)
        target.status = 'left'
        target.save(update_fields=['status'])
        return Response({'ok': True})

    @action(detail=True, methods=['post'], url_path=r'members/(?P<member_id>[0-9]+)/set-role')
    def set_member_role(self, request, pk=None, member_id=None):
        household = self.get_object()
        actor = require_active_member(request.user, household.id)
        if not actor or actor.role != 'owner':
            return Response({'detail': 'Only the owner can change roles.'}, status=403)
        role = (request.data.get('role') or '').strip()
        if role not in ('admin', 'member', 'owner'):
            return Response({'role': 'Must be admin, member, or owner.'}, status=400)
        target = household.memberships.filter(pk=member_id, status='active').select_related('user').first()
        if not target:
            return Response({'detail': 'Member not found.'}, status=404)
        if target.user_id == request.user.id and role != 'owner':
            return Response({'detail': 'Cannot demote yourself as owner. Transfer ownership first.'}, status=400)
        if role == 'owner':
            # Transfer ownership
            actor.role = 'admin'
            actor.save(update_fields=['role'])
            target.role = 'owner'
            target.save(update_fields=['role'])
        else:
            if target.role == 'owner':
                return Response({'detail': 'Transfer ownership instead of demoting the owner.'}, status=400)
            target.role = role
            target.save(update_fields=['role'])
        return Response(HouseholdMemberSerializer(target).data)

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


class HouseholdLedgerViewSet(viewsets.ModelViewSet):
    serializer_class = HouseholdLedgerSerializer
    permission_classes = [IsAuthenticated]
    # post required for detail actions: expenses, contributions, close, reopen, settlement/mark
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = HouseholdLedger.objects.filter(
            household__memberships__user=self.request.user,
            household__memberships__status='active',
        ).distinct().select_related('household', 'closed_by')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def create(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Create ledgers via POST /api/households/{id}/ledgers/.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def update(self, request, *args, **kwargs):
        ledger = self.get_object()
        m = require_owner_or_admin(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Only owner/admin can edit a ledger.'}, status=403)
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(ledger, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data.get('name')
        notes = serializer.validated_data.get('notes')
        fields = []
        if name is not None:
            name = name.strip()
            if not name:
                return Response({'name': 'Name is required.'}, status=400)
            ledger.name = name[:150]
            fields.append('name')
        if notes is not None:
            ledger.notes = notes
            fields.append('notes')
        if fields:
            ledger.save(update_fields=fields)
        return Response(HouseholdLedgerSerializer(ledger, context={'request': request}).data)

    def destroy(self, request, *args, **kwargs):
        ledger = self.get_object()
        m = require_owner_or_admin(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Only owner/admin can delete a ledger.'}, status=403)
        if ledger.status == 'closed':
            return Response(
                {'detail': 'Reopen the ledger before deleting, or leave it closed for history.'},
                status=400,
            )
        # Keep at least one ledger on the household
        if ledger.household.ledgers.count() <= 1:
            return Response(
                {'detail': 'Cannot delete the only ledger. Create another first, or delete the household.'},
                status=400,
            )
        ledger.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        ledger = self.get_object()
        m = require_active_member(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)
        data = ledger_summary(ledger)
        data['ledger'] = HouseholdLedgerSerializer(ledger, context={'request': request}).data
        return Response(data)

    @action(detail=True, methods=['get'])
    def report(self, request, pk=None):
        """
        GET …/report/?year=&month=
        - With year+month: that month's breakdown (ongoing ledgers).
        - Without: full history (events / closed / all-time).
        """
        ledger = self.get_object()
        m = require_active_member(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        y = int(year) if year else None
        mo = int(month) if month else None
        if (y is None) ^ (mo is None):
            return Response(
                {'detail': 'Provide both year and month, or neither for full history.'},
                status=400,
            )
        if mo is not None and not (1 <= mo <= 12):
            return Response({'detail': 'Invalid month.'}, status=400)
        return Response(ledger_report(ledger, year=y, month=mo))

    @action(detail=True, methods=['get'])
    def settlement(self, request, pk=None):
        """Split-equal credits + suggested who-owes-whom transfers."""
        ledger = self.get_object()
        m = require_active_member(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)
        data = compute_settlement(ledger)
        data['ledger'] = HouseholdLedgerSerializer(ledger, context={'request': request}).data
        return Response(data)

    @action(detail=True, methods=['post'], url_path='settlement/mark')
    def settlement_mark(self, request, pk=None):
        """Mark a suggested transfer as settled outside the app (notes only)."""
        ledger = self.get_object()
        m = require_active_member(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)
        try:
            from_user_id = int(request.data.get('from_user_id'))
            to_user_id = int(request.data.get('to_user_id'))
            amount = _money(request.data.get('amount'))
        except (TypeError, ValueError):
            return Response({'detail': 'from_user_id, to_user_id, and amount are required.'}, status=400)
        if amount <= 0:
            return Response({'amount': 'Must be positive.'}, status=400)
        active_ids = set(
            ledger.household.memberships.filter(status='active', user__isnull=False)
            .values_list('user_id', flat=True)
        )
        if from_user_id not in active_ids or to_user_id not in active_ids:
            return Response({'detail': 'Both users must be active members.'}, status=400)
        note = (request.data.get('note') or '')[:255]
        mark = HouseholdSettlementMark.objects.create(
            ledger=ledger,
            from_user_id=from_user_id,
            to_user_id=to_user_id,
            amount=amount,
            note=note,
            marked_by=request.user,
        )
        return Response({
            'id': mark.id,
            'from_user_id': from_user_id,
            'to_user_id': to_user_id,
            'amount': float(amount),
            'note': note,
            'settlement': compute_settlement(ledger),
        }, status=201)

    @action(detail=True, methods=['get', 'post'])
    def contributions(self, request, pk=None):
        ledger = self.get_object()
        m = require_active_member(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)

        if request.method == 'GET':
            qs = ledger.contributions.select_related('contributed_by', 'created_by', 'linked_account')
            total = qs.aggregate(total=Sum('amount'))['total'] or 0
            return Response({
                'results': HouseholdContributionSerializer(qs, many=True).data,
                'total': float(total),
                **ledger_pot_stats(ledger),
            })

        if ledger.status == 'closed':
            return Response({'detail': 'This ledger is closed.'}, status=400)

        ser = HouseholdContributionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        linked_account = ser.validated_data.get('linked_account')
        linked_tx = None
        if linked_account:
            if linked_account.user_id != request.user.id:
                return Response(
                    {'linked_account': 'You can only contribute from your own wallet.'},
                    status=400,
                )
            linked_tx = Transaction.objects.create(
                user=request.user,
                type='expense',
                amount=ser.validated_data['amount'],
                date=ser.validated_data['date'],
                account=linked_account,
                category='Household pot',
                notes=ser.validated_data.get('notes') or f'Pot contribution: {ledger.name}',
            )

        contrib = ser.save(
            ledger=ledger,
            created_by=request.user,
            contributed_by=request.user,
            linked_transaction=linked_tx,
            linked_account=linked_account,
        )
        notify_household_members(
            household=ledger.household,
            actor=request.user,
            kind='contribution',
            title=f'{_display_name(request.user)} contributed to the pot',
            body=f'{float(contrib.amount):,.0f} on {ledger.name}',
            ledger=ledger,
            contribution=contrib,
        )
        return Response(HouseholdContributionSerializer(contrib).data, status=201)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        ledger = self.get_object()
        m = require_owner_or_admin(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Only owner/admin can close a ledger.'}, status=403)
        if ledger.status == 'closed':
            return Response({'detail': 'Already closed.'}, status=400)
        summary = ledger_summary(ledger)
        today = timezone.localdate()
        ledger.status = 'closed'
        ledger.end_date = today
        ledger.closed_at = timezone.now()
        ledger.closed_by = request.user
        ledger.closed_total_expense = summary['total_spent']
        ledger.save(update_fields=[
            'status', 'end_date', 'closed_at', 'closed_by', 'closed_total_expense',
        ])
        return Response({
            'ledger': HouseholdLedgerSerializer(ledger, context={'request': request}).data,
            'summary': summary,
        })

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        ledger = self.get_object()
        m = require_owner_or_admin(request.user, ledger.household_id)
        if not m:
            return Response({'detail': 'Only owner/admin can reopen a ledger.'}, status=403)
        if ledger.status != 'closed':
            return Response({'detail': 'Ledger is not closed.'}, status=400)
        ledger.status = 'open'
        ledger.end_date = None
        ledger.closed_at = None
        ledger.closed_by = None
        ledger.closed_total_expense = None
        ledger.save(update_fields=[
            'status', 'end_date', 'closed_at', 'closed_by', 'closed_total_expense',
        ])
        return Response(HouseholdLedgerSerializer(ledger, context={'request': request}).data)

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
            # Closed / event ledgers: default to full history unless month explicitly requested
            if year and month:
                qs = qs.filter(date__year=int(year), date__month=int(month))
            total_amount = qs.aggregate(total=Sum('amount'))['total'] or 0
            try:
                limit = min(max(int(request.query_params.get('limit', 50)), 1), 200)
            except (TypeError, ValueError):
                limit = 50
            try:
                offset = max(int(request.query_params.get('offset', 0)), 0)
            except (TypeError, ValueError):
                offset = 0
            count = qs.count()
            page = qs[offset:offset + limit]
            return Response({
                'results': HouseholdExpenseSerializer(page, many=True).data,
                'total': float(total_amount),
                'count': count,
                'limit': limit,
                'offset': offset,
                'has_more': offset + limit < count,
                **ledger_pot_stats(ledger),
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

        amount = _money(ser.validated_data['amount'])
        pot_amount = _money(ser.validated_data.get('pot_amount') or 0)
        if pot_amount < 0:
            return Response({'pot_amount': 'Cannot be negative.'}, status=400)
        if pot_amount > amount:
            return Response({'pot_amount': 'Cannot exceed expense amount.'}, status=400)
        pot_stats = ledger_pot_stats(ledger)
        if pot_amount > _money(pot_stats['pot_balance']):
            return Response(
                {'pot_amount': f'Only {pot_stats["pot_balance"]:,.2f} left in the pot.'},
                status=400,
            )
        personal = _money(amount - pot_amount)

        linked_account = ser.validated_data.get('linked_account')
        linked_tx = None
        # Wallet link only for the personal (non-pot) portion
        if linked_account and personal > 0:
            if linked_account.user_id != request.user.id:
                return Response(
                    {'linked_account': 'You can only pay from your own wallet.'},
                    status=400,
                )
            linked_tx = Transaction.objects.create(
                user=request.user,
                type='expense',
                amount=personal,
                date=ser.validated_data['date'],
                account=linked_account,
                category=ser.validated_data.get('category') or '',
                notes=ser.validated_data.get('notes') or f'Household: {ledger.name}',
            )
        elif linked_account and personal <= 0:
            linked_account = None

        expense = ser.save(
            ledger=ledger,
            created_by=request.user,
            paid_by=paid_by,
            pot_amount=pot_amount,
            linked_transaction=linked_tx,
            linked_account=linked_account,
        )
        amt = float(expense.amount)
        cat = expense.category or 'Expense'
        notify_household_members(
            household=ledger.household,
            actor=request.user,
            kind='expense',
            title=f'{_display_name(request.user)} added {cat}',
            body=f'{amt:,.0f} on {ledger.name}',
            ledger=ledger,
            expense=expense,
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
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(expense, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        # Don't allow reassigning ledger / paid_by via casual edit
        serializer.validated_data.pop('ledger', None)
        serializer.validated_data.pop('paid_by', None)
        serializer.validated_data.pop('linked_account', None)

        amount = _money(serializer.validated_data.get('amount', expense.amount))
        pot_amount = _money(serializer.validated_data.get('pot_amount', expense.pot_amount or 0))
        if pot_amount < 0:
            return Response({'pot_amount': 'Cannot be negative.'}, status=400)
        if pot_amount > amount:
            return Response({'pot_amount': 'Cannot exceed expense amount.'}, status=400)
        pot_stats = ledger_pot_stats(expense.ledger, exclude_expense_id=expense.id)
        if pot_amount > _money(pot_stats['pot_balance']):
            return Response(
                {'pot_amount': f'Only {pot_stats["pot_balance"]:,.2f} left in the pot.'},
                status=400,
            )
        serializer.validated_data['amount'] = amount
        serializer.validated_data['pot_amount'] = pot_amount
        expense = serializer.save()
        personal = _money(amount - pot_amount)
        tx = expense.linked_transaction
        if tx:
            if personal > 0:
                tx.amount = personal
                tx.date = expense.date
                tx.category = expense.category or ''
                if expense.notes:
                    tx.notes = expense.notes
                tx.save(update_fields=['amount', 'date', 'category', 'notes'])
            else:
                # Fully covered by pot — remove wallet line
                tx_id = tx.pk
                expense.linked_transaction = None
                expense.linked_account = None
                expense.save(update_fields=['linked_transaction', 'linked_account'])
                Transaction.objects.filter(pk=tx_id).delete()
        return Response(HouseholdExpenseSerializer(expense).data)

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
        if tx:
            Transaction.objects.filter(pk=tx.pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HouseholdContributionViewSet(viewsets.ModelViewSet):
    serializer_class = HouseholdContributionSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'delete', 'head', 'options']

    def get_queryset(self):
        return HouseholdContribution.objects.filter(
            ledger__household__memberships__user=self.request.user,
            ledger__household__memberships__status='active',
        ).distinct()

    def destroy(self, request, *args, **kwargs):
        contrib = self.get_object()
        m = require_active_member(request.user, contrib.ledger.household_id)
        if not m:
            return Response({'detail': 'Not a member.'}, status=403)
        if contrib.created_by_id != request.user.id and m.role not in ('owner', 'admin'):
            return Response({'detail': 'You can only delete your own contributions.'}, status=403)
        if contrib.ledger.status == 'closed':
            return Response({'detail': 'This ledger is closed.'}, status=400)
        tx = contrib.linked_transaction
        contrib.delete()
        if tx:
            Transaction.objects.filter(pk=tx.pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HouseholdNotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HouseholdNotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return HouseholdNotification.objects.filter(user=self.request.user).select_related(
            'household', 'actor', 'ledger',
        )

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = self.get_queryset().filter(read_at__isnull=True).count()
        return Response({'count': count})

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({'updated': updated})

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        n = self.get_object()
        if not n.read_at:
            n.read_at = timezone.now()
            n.save(update_fields=['read_at'])
        return Response(HouseholdNotificationSerializer(n).data)


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
