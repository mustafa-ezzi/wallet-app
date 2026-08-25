from django.db import models
from django.contrib.auth.models import User
from django.db.models import Sum
from django.utils import timezone



class UserProfile(models.Model):
    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
        ('other', 'Other'),
        ('prefer_not', 'Prefer not to say'),
    ]
    USER_TYPE_CHOICES = [
        ('student', 'Student'),
        ('professional', 'Professional'),
        ('self_employed', 'Self Employed'),
        ('retired', 'Retired'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    currency = models.CharField(max_length=10, default='PKR')
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, blank=True, default='', choices=GENDER_CHOICES)
    user_type = models.CharField(max_length=32, blank=True, default='', choices=USER_TYPE_CHOICES)
    country = models.CharField(max_length=64, blank=True, default='')
    onboarding_complete = models.BooleanField(default=False)
    # Phase G — shareable code so others can request a People link (PEEP-XXXXXX)
    people_link_code = models.CharField(max_length=16, blank=True, null=True, unique=True)

    def __str__(self):
        return f"Profile({self.user.username})"


class Account(models.Model):
    ACCOUNT_TYPES = [
        ('bank', 'Bank'),
        ('cash', 'Cash'),
        ('person', 'Person'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='accounts')
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=ACCOUNT_TYPES, default='bank')
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.user.username})"

    @property
    def is_person(self):
        return self.type == 'person'

    @property
    def current_balance(self):
        income = self.transactions.filter(type='income').aggregate(
            total=Sum('amount'))['total'] or 0
        expense = self.transactions.filter(type='expense').aggregate(
            total=Sum('amount'))['total'] or 0
        return float(self.opening_balance) + float(income) - float(expense)


class Project(models.Model):
    INCOME_TYPES = [
        ('recurring_monthly', 'Recurring Monthly'),
        ('contract_monthly', 'Contract Monthly'),
        ('one_time', 'One-Time'),
        ('one_time_installments', 'One-Time (Installments)'),
    ]
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('paused', 'Paused'),
        ('stuck', 'Stuck'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects')
    name = models.CharField(max_length=150)
    income_type = models.CharField(max_length=30, choices=INCOME_TYPES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    # Used only when income_type == 'one_time_installments'
    installment_amount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        help_text="Monthly installment amount for one_time_installments projects")
    # Advance already received — reduces remaining for one-time / installment income
    advance_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0, blank=True,
        help_text='Advance already received (subtracted from total remaining)')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='active')
    start_date = models.DateField()
    default_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name='projects')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.user.username})"

    @property
    def months_to_complete(self):
        if self.income_type == 'one_time_installments' and self.installment_amount:
            import math
            remaining = max(0.0, float(self.amount) - float(self.advance_amount or 0))
            if float(self.installment_amount) <= 0:
                return None
            return math.ceil(remaining / float(self.installment_amount))
        return None

    @property
    def remaining_amount(self):
        base = max(0.0, float(self.amount) - float(self.advance_amount or 0))
        if self.income_type == 'one_time':
            received = self.transactions.filter(type='income').aggregate(
                total=Sum('amount'))['total'] or 0
            return max(0.0, base - float(received))
        return base


class Transaction(models.Model):
    TYPES = [('income', 'Income'), ('expense', 'Expense')]
    PEOPLE_ACTIONS = [
        ('lend', 'Lend'),
        ('borrow', 'Borrow'),
        ('pay', 'Pay'),
        ('receive', 'Receive'),
    ]
    FX_SOURCES = [
        ('live', 'Live'),
        ('manual', 'Manual'),
        ('cached', 'Cached'),
        ('offline', 'Offline'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=10, choices=TYPES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    date = models.DateField()
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='transactions')
    linked_project = models.ForeignKey(
        Project, null=True, blank=True, on_delete=models.SET_NULL, related_name='transactions')
    linked_receivable = models.ForeignKey(
        'ReceivableInstallment', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='transactions')
    linked_payable = models.ForeignKey(
        'PayableInstallment', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='transactions')
    category = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    # Client-generated UUID for offline sync retries (unique per user when set)
    client_mutation_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    # Travel Mode — amount is always PKR; optional foreign snapshot for display
    original_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    original_currency = models.CharField(max_length=10, blank=True, default='')
    fx_rate = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    fx_source = models.CharField(max_length=16, blank=True, default='', choices=FX_SOURCES)
    # People double-entry: shared pair id + action label
    people_pair_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    people_action = models.CharField(max_length=16, blank=True, default='', choices=PEOPLE_ACTIONS)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'client_mutation_id'],
                name='uniq_tx_user_client_mutation_id',
                condition=models.Q(client_mutation_id__isnull=False)
                & ~models.Q(client_mutation_id=''),
            ),
        ]

    def __str__(self):
        return f"{self.type} {self.amount} on {self.date}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self._update_installments()

    def _update_installments(self):
        if self.linked_receivable and self.type == 'income':
            rec = self.linked_receivable
            paid_count = rec.transactions.filter(type='income').count()
            rec.installments_received = paid_count
            if paid_count >= rec.total_installments:
                rec.status = 'completed'
                if rec.linked_project_id:
                    Project.objects.filter(
                        id=rec.linked_project_id, status='active'
                    ).update(status='completed')
            rec.save(update_fields=['installments_received', 'status'])

        if self.linked_payable and self.type == 'expense':
            pay = self.linked_payable
            paid_count = pay.transactions.filter(type='expense').count()
            pay.installments_paid = paid_count
            if paid_count >= pay.total_installments:
                pay.status = 'completed'
            pay.save(update_fields=['installments_paid', 'status'])

        # One-time income: mark project completed when remaining is fully received
        if self.linked_project_id and self.type == 'income':
            proj = self.linked_project
            if proj and proj.income_type == 'one_time' and proj.status == 'active':
                if proj.remaining_amount <= 0.01:
                    proj.status = 'completed'
                    proj.save(update_fields=['status'])


class TravelMode(models.Model):
    """One active travel session per user. Books stay PKR; rate is PKR per 1 travel unit."""

    RATE_SOURCES = [
        ('live', 'Live'),
        ('manual', 'Manual'),
        ('cached', 'Cached'),
        ('offline', 'Offline'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='travel_mode')
    enabled = models.BooleanField(default=False)
    travel_currency = models.CharField(max_length=10, blank=True, default='')
    rate = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    rate_as_of = models.DateTimeField(null=True, blank=True)
    rate_source = models.CharField(max_length=16, blank=True, default='', choices=RATE_SOURCES)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Travel mode'
        verbose_name_plural = 'Travel modes'

    def __str__(self):
        state = f'{self.travel_currency}@{self.rate}' if self.enabled else 'off'
        return f'TravelMode({self.user_id}, {state})'


class FxRateCache(models.Model):
    """Cached mid-market quote: quote currency units per 1 base unit (e.g. PKR per 1 AED)."""

    base = models.CharField(max_length=10)
    quote = models.CharField(max_length=10)
    rate = models.DecimalField(max_digits=18, decimal_places=6)
    source = models.CharField(max_length=64, blank=True, default='')
    fetched_at = models.DateTimeField()

    class Meta:
        verbose_name = 'FX rate cache'
        verbose_name_plural = 'FX rate cache'
        constraints = [
            models.UniqueConstraint(fields=['base', 'quote'], name='uniq_fx_base_quote'),
        ]
        indexes = [
            models.Index(fields=['base', 'quote'], name='fx_base_quote_idx'),
        ]

    def __str__(self):
        return f'1 {self.base} = {self.rate} {self.quote} ({self.source})'


class RecurringExpense(models.Model):
    FREQUENCY = [('monthly', 'Monthly'), ('one_time', 'One-Time')]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recurring_expenses')
    name = models.CharField(max_length=150)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    frequency = models.CharField(max_length=15, choices=FREQUENCY, default='monthly')
    due_day = models.IntegerField(null=True, blank=True)
    account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name='recurring_expenses')
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.user.username})"


class ReceivableInstallment(models.Model):
    STATUS = [('ongoing', 'Ongoing'), ('completed', 'Completed'), ('stuck', 'Stuck')]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='receivables')
    linked_project = models.ForeignKey(
        Project, null=True, blank=True, on_delete=models.SET_NULL, related_name='receivable_installments')
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    monthly_amount = models.DecimalField(max_digits=14, decimal_places=2)
    total_installments = models.IntegerField()
    installments_received = models.IntegerField(default=0)
    start_date = models.DateField()
    status = models.CharField(max_length=15, choices=STATUS, default='ongoing')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def remaining_amount(self):
        return float(self.total_amount) - (self.installments_received * float(self.monthly_amount))

    def __str__(self):
        return f"Receivable: {self.linked_project.name}"


class PayableInstallment(models.Model):
    STATUS = [('ongoing', 'Ongoing'), ('completed', 'Completed'), ('stuck', 'Stuck')]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payables')
    name = models.CharField(max_length=150)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    monthly_amount = models.DecimalField(max_digits=14, decimal_places=2)
    total_installments = models.IntegerField()
    installments_paid = models.IntegerField(default=0)
    due_day = models.IntegerField(default=1)
    account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name='payables')
    status = models.CharField(max_length=15, choices=STATUS, default='ongoing')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def remaining_amount(self):
        return float(self.total_amount) - (self.installments_paid * float(self.monthly_amount))

    def __str__(self):
        return f"Payable: {self.name}"


# ── Household sharing (see HOUSEHOLD_SHARED_EXPENSE_RESEARCH.md) ─────────────

def generate_household_invite_code():
    """Human-friendly code without ambiguous 0/O/1/I characters."""
    import secrets
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    body = ''.join(secrets.choice(alphabet) for _ in range(6))
    return f'HOME-{body}'


def generate_invite_token():
    import secrets
    return secrets.token_urlsafe(32)


class Household(models.Model):
    name = models.CharField(max_length=120)
    currency = models.CharField(max_length=10, default='PKR')
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='households_created')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def active_members(self):
        return self.memberships.filter(status='active')


class HouseholdMembership(models.Model):
    ROLES = [('owner', 'Owner'), ('admin', 'Admin'), ('member', 'Member')]
    STATUSES = [
        ('invited', 'Invited'),
        ('active', 'Active'),
        ('left', 'Left'),
        ('declined', 'Declined'),
    ]
    VIA = [
        ('create', 'Created'),
        ('code', 'Invite code'),
        ('email', 'Email'),
        ('link', 'Invite link'),
    ]

    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.CASCADE, related_name='household_memberships')
    role = models.CharField(max_length=10, choices=ROLES, default='member')
    status = models.CharField(max_length=10, choices=STATUSES, default='invited')
    invited_via = models.CharField(max_length=10, choices=VIA, default='code')
    invited_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='household_invites_sent')
    invited_email = models.EmailField(blank=True, default='')
    joined_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['household', 'user'],
                condition=models.Q(user__isnull=False),
                name='uniq_household_user_membership',
            ),
        ]

    def __str__(self):
        who = self.user.username if self.user_id else self.invited_email
        return f"{who} @ {self.household.name} ({self.status})"


class HouseholdInvite(models.Model):
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='invites')
    code = models.CharField(max_length=16, unique=True)
    token = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='household_invites_created')
    expires_at = models.DateTimeField()
    max_uses = models.PositiveIntegerField(null=True, blank=True)
    use_count = models.PositiveIntegerField(default=0)
    revoked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.code} → {self.household.name}"

    @property
    def is_valid(self):
        from django.utils import timezone
        if self.revoked:
            return False
        if self.expires_at and timezone.now() >= self.expires_at:
            return False
        if self.max_uses is not None and self.use_count >= self.max_uses:
            return False
        return True


class HouseholdLedger(models.Model):
    KINDS = [('ongoing', 'Ongoing'), ('event', 'Event')]
    STATUSES = [('open', 'Open'), ('closed', 'Closed')]

    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='ledgers')
    name = models.CharField(max_length=150)
    kind = models.CharField(max_length=10, choices=KINDS, default='ongoing')
    status = models.CharField(max_length=10, choices=STATUSES, default='open')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    opening_float = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default='')
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='household_ledgers_closed')
    closed_total_expense = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.household.name})"

    @property
    def total_spent(self):
        total = self.expenses.aggregate(total=Sum('amount'))['total'] or 0
        return float(total)

    @property
    def pot_contributed(self):
        total = self.contributions.aggregate(total=Sum('amount'))['total'] or 0
        return float(total)

    @property
    def pot_spent(self):
        total = self.expenses.aggregate(total=Sum('pot_amount'))['total'] or 0
        return float(total)

    @property
    def pot_balance(self):
        return round(self.pot_contributed - self.pot_spent, 2)


class HouseholdExpense(models.Model):
    ledger = models.ForeignKey(HouseholdLedger, on_delete=models.CASCADE, related_name='expenses')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    date = models.DateField()
    category = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='household_expenses_created')
    paid_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='household_expenses_paid')
    # Portion of this expense funded from the shared pot (reduces pot balance)
    pot_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    linked_transaction = models.ForeignKey(
        'Transaction', null=True, blank=True, on_delete=models.SET_NULL, related_name='household_expenses')
    linked_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name='household_expenses')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        indexes = [
            models.Index(fields=['ledger', '-date'], name='hh_exp_ledger_date_idx'),
        ]

    def __str__(self):
        return f"{self.amount} on {self.date} ({self.ledger.name})"

    @property
    def personal_amount(self):
        """Amount paid from someone's wallet (not the pot)."""
        from decimal import Decimal
        pot = self.pot_amount or Decimal('0')
        return float(self.amount) - float(pot)


class HouseholdContribution(models.Model):
    """Money a member puts into the event/household pot (counts as credit on Split equal)."""
    ledger = models.ForeignKey(HouseholdLedger, on_delete=models.CASCADE, related_name='contributions')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    date = models.DateField()
    notes = models.TextField(blank=True, default='')
    contributed_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='household_contributions')
    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='household_contributions_created')
    linked_transaction = models.ForeignKey(
        'Transaction', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='household_contributions')
    linked_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='household_contributions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        return f"+{self.amount} pot ({self.ledger.name})"


class HouseholdSettlementMark(models.Model):
    """Optional note that a suggested settlement pair was settled outside CashTrail."""
    ledger = models.ForeignKey(HouseholdLedger, on_delete=models.CASCADE, related_name='settlement_marks')
    from_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='settlement_marks_from')
    to_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='settlement_marks_to')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    note = models.CharField(max_length=255, blank=True, default='')
    marked_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='settlement_marks_created')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.from_user_id} → {self.to_user_id}: {self.amount}"


class HouseholdNotification(models.Model):
    """In-app alert when another member posts to a shared ledger."""
    KINDS = [
        ('expense', 'Expense'),
        ('contribution', 'Contribution'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='household_notifications')
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='notifications')
    ledger = models.ForeignKey(
        HouseholdLedger, null=True, blank=True, on_delete=models.CASCADE, related_name='notifications')
    expense = models.ForeignKey(
        HouseholdExpense, null=True, blank=True, on_delete=models.CASCADE, related_name='notifications')
    contribution = models.ForeignKey(
        HouseholdContribution, null=True, blank=True, on_delete=models.CASCADE,
        related_name='notifications')
    actor = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='household_notifications_sent')
    kind = models.CharField(max_length=20, choices=KINDS, default='expense')
    title = models.CharField(max_length=160)
    body = models.CharField(max_length=255, blank=True, default='')
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='hh_notif_user_created_idx'),
            models.Index(fields=['user', 'read_at'], name='hh_notif_user_read_idx'),
        ]

    def __str__(self):
        return f"{self.title} → {self.user_id}"

    @property
    def is_read(self):
        return self.read_at is not None


# ── Mobile push (Phase 6) ─────────────────────────────────────────────────────

class DeviceToken(models.Model):
    PLATFORMS = [
        ('android', 'Android'),
        ('ios', 'iOS'),
        ('web', 'Web'),
        ('unknown', 'Unknown'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='device_tokens')
    token = models.CharField(max_length=255)
    platform = models.CharField(max_length=16, choices=PLATFORMS, default='unknown')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        constraints = [
            models.UniqueConstraint(fields=['token'], name='uniq_device_push_token'),
        ]
        indexes = [
            models.Index(fields=['user', '-updated_at'], name='device_token_user_idx'),
        ]

    def __str__(self):
        return f"{self.platform} token for {self.user_id}"


class NotificationPreference(models.Model):
    """Per-user push prefs (optional; defaults applied when missing)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='notification_pref')
    enabled = models.BooleanField(default=True)
    remind_payables = models.BooleanField(default=True)
    remind_receivables = models.BooleanField(default=True)
    lead_3 = models.BooleanField(default=True)
    lead_1 = models.BooleanField(default=True)
    lead_due = models.BooleanField(default=True)
    # Ops / product updates (broadcast campaigns). Default on; user can opt out in Settings.
    marketing_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"NotifPref({self.user_id})"

    def lead_days(self):
        days = []
        if self.lead_3:
            days.append(3)
        if self.lead_1:
            days.append(1)
        if self.lead_due:
            days.append(0)
        return days


class PushDeliveryLog(models.Model):
    """Idempotent guard: one push per user/kind/object/lead/day."""

    KINDS = [
        ('payable', 'Payable'),
        ('receivable', 'Receivable'),
        ('expense', 'Expense'),
        ('people_proposal', 'People proposal'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_delivery_logs')
    kind = models.CharField(max_length=16, choices=KINDS)
    object_id = models.PositiveIntegerField()
    lead_days = models.PositiveSmallIntegerField(default=0)
    notify_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'kind', 'object_id', 'lead_days', 'notify_date'],
                name='uniq_push_delivery_day',
            ),
        ]
        indexes = [
            models.Index(fields=['notify_date'], name='push_log_date_idx'),
        ]

    def __str__(self):
        return f"{self.kind}:{self.object_id} lead={self.lead_days} @ {self.notify_date}"


class PasswordResetOTP(models.Model):
    """Short-lived email OTP for forgot-password flow."""

    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', '-created_at'], name='pwd_otp_email_idx'),
        ]

    def __str__(self):
        return f'OTP({self.email}, used={self.used})'

    @staticmethod
    def hash_code(code: str) -> str:
        import hashlib
        return hashlib.sha256(code.strip().encode('utf-8')).hexdigest()

    @classmethod
    def create_for_email(cls, email: str, ttl_minutes: int = 10):
        """Invalidate prior unused codes, create a new one. Returns (row, plain_code)."""
        import secrets
        from datetime import timedelta
        from django.utils import timezone

        email_n = email.strip().lower()
        cls.objects.filter(email=email_n, used=False).update(used=True)
        code = f'{secrets.randbelow(1_000_000):06d}'
        row = cls.objects.create(
            email=email_n,
            code_hash=cls.hash_code(code),
            expires_at=timezone.now() + timedelta(minutes=ttl_minutes),
        )
        return row, code

    def verify(self, code: str, max_attempts: int = 5) -> bool:
        import secrets
        from django.utils import timezone

        if self.used:
            return False
        if timezone.now() > self.expires_at:
            return False
        if self.attempts >= max_attempts:
            return False
        self.attempts += 1
        self.save(update_fields=['attempts'])
        return secrets.compare_digest(self.code_hash, self.hash_code(code))


# ── Ops panel (Phase 0–1) — no finance row access via these models ────────────

class UserOpsMeta(models.Model):
    """Staff-facing ops metadata. Never store balances or transaction data here."""

    INACTIVITY_NONE = 'none'
    INACTIVITY_7D = '7d'
    INACTIVITY_30D = '30d'
    INACTIVITY_90D = '90d'
    INACTIVITY_TIERS = [
        (INACTIVITY_NONE, 'Active'),
        (INACTIVITY_7D, 'Inactive 7d'),
        (INACTIVITY_30D, 'Inactive 30d'),
        (INACTIVITY_90D, 'Inactive 90d'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='ops_meta')
    suspended_at = models.DateTimeField(null=True, blank=True)
    internal_notes = models.TextField(blank=True, default='')
    marketing_opt_out = models.BooleanField(default=False)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    inactivity_tier = models.CharField(
        max_length=8, choices=INACTIVITY_TIERS, default=INACTIVITY_NONE, db_index=True,
    )
    last_reengagement_push_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'User ops meta'
        verbose_name_plural = 'User ops meta'

    def __str__(self):
        return f'OpsMeta({self.user_id})'

    @property
    def is_suspended(self):
        return self.suspended_at is not None


class AdminAuditLog(models.Model):
    """Immutable-ish trail of staff actions in the Ops panel / Django admin."""

    actor = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='ops_audit_logs',
    )
    action = models.CharField(max_length=64, db_index=True)
    target_type = models.CharField(max_length=64, blank=True, default='')
    target_id = models.CharField(max_length=64, blank=True, default='')
    meta = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['action', '-created_at'], name='ops_audit_action_idx'),
        ]

    def __str__(self):
        return f'{self.action} by {self.actor_id} @ {self.created_at}'


# ── Ops broadcast campaigns (Phase 2) ─────────────────────────────────────────

class PushCampaign(models.Model):
    AUDIENCE_ALL = 'all'
    AUDIENCE_ANDROID = 'android'
    AUDIENCE_INACTIVE_7D = 'inactive_7d'
    AUDIENCE_INACTIVE_30D = 'inactive_30d'
    AUDIENCE_INACTIVE_90D = 'inactive_90d'
    AUDIENCE_CHOICES = [
        (AUDIENCE_ALL, 'All opted-in users with a device'),
        (AUDIENCE_ANDROID, 'Android only'),
        (AUDIENCE_INACTIVE_7D, 'Inactive 7d+'),
        (AUDIENCE_INACTIVE_30D, 'Inactive 30d+'),
        (AUDIENCE_INACTIVE_90D, 'Inactive 90d+'),
    ]

    STATUS_DRAFT = 'draft'
    STATUS_SCHEDULED = 'scheduled'
    STATUS_SENDING = 'sending'
    STATUS_SENT = 'sent'
    STATUS_FAILED = 'failed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_SCHEDULED, 'Scheduled'),
        (STATUS_SENDING, 'Sending'),
        (STATUS_SENT, 'Sent'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    title = models.CharField(max_length=120)
    body = models.CharField(max_length=400)
    data = models.JSONField(default=dict, blank=True)  # e.g. {"route": "/(tabs)/settings"}
    audience = models.CharField(max_length=32, choices=AUDIENCE_CHOICES, default=AUDIENCE_ALL)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='push_campaigns_created',
    )
    scheduled_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    recipient_estimate = models.PositiveIntegerField(default=0)
    sent_ok = models.PositiveIntegerField(default=0)
    sent_failed = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'scheduled_at'], name='push_camp_sched_idx'),
        ]

    def __str__(self):
        return f'Campaign({self.id}, {self.status}): {self.title}'


class PushCampaignDelivery(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_OK = 'ok'
    STATUS_FAILED = 'failed'
    STATUS_SKIPPED = 'skipped'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_OK, 'Ok'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_SKIPPED, 'Skipped'),
    ]

    campaign = models.ForeignKey(PushCampaign, on_delete=models.CASCADE, related_name='deliveries')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='campaign_deliveries')
    device_token = models.ForeignKey(
        DeviceToken, null=True, blank=True, on_delete=models.SET_NULL, related_name='campaign_deliveries',
    )
    token_snapshot = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    expo_ticket_id = models.CharField(max_length=128, blank=True, default='')
    error = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['campaign', 'status'], name='push_deliv_camp_status_idx'),
        ]

    def __str__(self):
        return f'Delivery({self.campaign_id} → user {self.user_id}: {self.status})'


# ── Support tickets (Phase 3) ─────────────────────────────────────────────────

class SupportThread(models.Model):
    STATUS_OPEN = 'open'
    STATUS_WAITING_USER = 'waiting_user'
    STATUS_WAITING_OPS = 'waiting_ops'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_WAITING_USER, 'Waiting on user'),
        (STATUS_WAITING_OPS, 'Waiting on ops'),
        (STATUS_CLOSED, 'Closed'),
    ]

    CATEGORY_BILLING = 'billing'
    CATEGORY_BUG = 'bug'
    CATEGORY_ACCOUNT = 'account'
    CATEGORY_OTHER = 'other'
    CATEGORY_CHOICES = [
        (CATEGORY_BILLING, 'Billing / Premium'),
        (CATEGORY_BUG, 'Bug'),
        (CATEGORY_ACCOUNT, 'Account'),
        (CATEGORY_OTHER, 'Other'),
    ]

    PRIORITY_NORMAL = 'normal'
    PRIORITY_HIGH = 'high'
    PRIORITY_CHOICES = [
        (PRIORITY_NORMAL, 'Normal'),
        (PRIORITY_HIGH, 'High'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='support_threads')
    subject = models.CharField(max_length=160)
    category = models.CharField(max_length=16, choices=CATEGORY_CHOICES, default=CATEGORY_OTHER)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_WAITING_OPS, db_index=True)
    priority = models.CharField(max_length=16, choices=PRIORITY_CHOICES, default=PRIORITY_NORMAL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['status', '-updated_at'], name='support_status_upd_idx'),
            models.Index(fields=['user', '-updated_at'], name='support_user_upd_idx'),
        ]

    def __str__(self):
        return f'Support#{self.id} {self.subject} ({self.status})'


class SupportMessage(models.Model):
    SENDER_USER = 'user'
    SENDER_STAFF = 'staff'
    SENDER_CHOICES = [
        (SENDER_USER, 'User'),
        (SENDER_STAFF, 'Staff'),
    ]

    thread = models.ForeignKey(SupportThread, on_delete=models.CASCADE, related_name='messages')
    sender = models.CharField(max_length=8, choices=SENDER_CHOICES)
    author = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='support_messages',
    )
    body = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['thread', 'created_at'], name='support_msg_thread_idx'),
        ]

    def __str__(self):
        return f'Msg({self.sender}) on thread {self.thread_id}'


# ── Premium + remote ads config (Phase 4) ─────────────────────────────────────

class Entitlement(models.Model):
    """Who has Premium — metadata only; never store CashTrail spending."""

    PRODUCT_MONTHLY = 'premium_monthly'
    PRODUCT_YEARLY = 'premium_yearly'
    PRODUCT_LIFETIME = 'premium_lifetime'
    PRODUCT_CHOICES = [
        (PRODUCT_MONTHLY, 'Premium monthly'),
        (PRODUCT_YEARLY, 'Premium yearly'),
        (PRODUCT_LIFETIME, 'Premium lifetime'),
    ]

    SOURCE_PLAY = 'play'
    SOURCE_MANUAL = 'manual_grant'
    SOURCE_PROMO = 'promo'
    SOURCE_CHOICES = [
        (SOURCE_PLAY, 'Google Play'),
        (SOURCE_MANUAL, 'Manual grant'),
        (SOURCE_PROMO, 'Promo'),
    ]

    STATUS_ACTIVE = 'active'
    STATUS_EXPIRED = 'expired'
    STATUS_REVOKED = 'revoked'
    STATUS_PENDING = 'pending'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_REVOKED, 'Revoked'),
        (STATUS_PENDING, 'Pending verification'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='entitlements')
    product_id = models.CharField(max_length=64, choices=PRODUCT_CHOICES, default=PRODUCT_MONTHLY)
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES, default=SOURCE_MANUAL)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    started_at = models.DateTimeField()
    expires_at = models.DateTimeField(null=True, blank=True)
    purchase_token_hash = models.CharField(max_length=64, blank=True, default='', db_index=True)
    order_id = models.CharField(max_length=128, blank=True, default='')
    granted_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='entitlements_granted',
    )
    note = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['user', 'status'], name='entitlement_user_status_idx'),
            models.Index(fields=['status', 'expires_at'], name='entitlement_status_exp_idx'),
        ]

    def __str__(self):
        return f'Entitlement({self.user_id}, {self.product_id}, {self.status})'

    @property
    def is_live(self) -> bool:
        if self.status != self.STATUS_ACTIVE:
            return False
        if self.expires_at and self.expires_at <= timezone.now():
            return False
        return True


class PurchaseEvent(models.Model):
    """Play Billing verify trail — store hashed token / order metadata only."""

    STATUS_RECEIVED = 'received'
    STATUS_VERIFIED = 'verified'
    STATUS_FAILED = 'failed'
    STATUS_ACKNOWLEDGED = 'acknowledged'
    STATUS_CHOICES = [
        (STATUS_RECEIVED, 'Received'),
        (STATUS_VERIFIED, 'Verified'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_ACKNOWLEDGED, 'Acknowledged'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='purchase_events')
    product_id = models.CharField(max_length=64)
    purchase_token_hash = models.CharField(max_length=64, db_index=True)
    order_id = models.CharField(max_length=128, blank=True, default='')
    package_name = models.CharField(max_length=128, blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_RECEIVED, db_index=True)
    raw_summary = models.JSONField(default=dict, blank=True)  # never full secrets
    error = models.CharField(max_length=255, blank=True, default='')
    entitlement = models.ForeignKey(
        Entitlement, null=True, blank=True, on_delete=models.SET_NULL, related_name='purchase_events',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', '-created_at'], name='purchase_evt_status_idx'),
        ]

    def __str__(self):
        return f'PurchaseEvent({self.user_id}, {self.product_id}, {self.status})'


class AppRemoteConfig(models.Model):
    """
    Singleton-ish remote config for ads + feature flags.
    Ops edits via /api/ops/config/; app reads GET /api/config/.
    """

    KEY_DEFAULT = 'default'

    key = models.CharField(max_length=32, unique=True, default=KEY_DEFAULT)
    ads_enabled = models.BooleanField(default=True)
    banner_enabled = models.BooleanField(default=True)
    interstitial_enabled = models.BooleanField(default=False)
    rewarded_enabled = models.BooleanField(default=False)
    premium_hides_ads = models.BooleanField(default=True)
    android_banner_unit = models.CharField(max_length=128, blank=True, default='')
    android_interstitial_unit = models.CharField(max_length=128, blank=True, default='')
    android_rewarded_unit = models.CharField(max_length=128, blank=True, default='')
    show_after_sessions = models.PositiveIntegerField(default=3)
    interstitial_min_interval_sec = models.PositiveIntegerField(default=180)
    countries = models.JSONField(default=list, blank=True)  # e.g. ["PK"]
    test_device_ids = models.JSONField(default=list, blank=True)
    feature_flags = models.JSONField(default=dict, blank=True)
    min_supported_version = models.CharField(max_length=32, blank=True, default='')
    store_url = models.URLField(blank=True, default='')
    maintenance_message = models.CharField(max_length=255, blank=True, default='')
    # Phase 5 — optional WhatsApp escape hatch (digits or full https://wa.me/… URL)
    support_whatsapp = models.CharField(max_length=128, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='remote_config_updates',
    )

    class Meta:
        verbose_name = 'App remote config'
        verbose_name_plural = 'App remote config'

    def __str__(self):
        return f'AppRemoteConfig({self.key})'

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(key=cls.KEY_DEFAULT)
        return obj


class PromoCode(models.Model):
    """Redeemable premium trial codes (e.g. PREMIUM30 → 30 days)."""

    code = models.CharField(max_length=32, unique=True, db_index=True)
    product_id = models.CharField(
        max_length=64,
        choices=Entitlement.PRODUCT_CHOICES,
        default=Entitlement.PRODUCT_MONTHLY,
    )
    trial_days = models.PositiveIntegerField(default=30)
    max_redemptions = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Null = unlimited',
    )
    redemption_count = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True, db_index=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True, default='')
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='promo_codes_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'PromoCode({self.code})'

    def normalize_code(self):
        return (self.code or '').strip().upper()

    def is_currently_valid(self) -> bool:
        if not self.active:
            return False
        now = timezone.now()
        if self.starts_at and now < self.starts_at:
            return False
        if self.ends_at and now > self.ends_at:
            return False
        if self.max_redemptions is not None and self.redemption_count >= self.max_redemptions:
            return False
        return True


class PromoRedemption(models.Model):
    promo = models.ForeignKey(PromoCode, on_delete=models.CASCADE, related_name='redemptions')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='promo_redemptions')
    entitlement = models.ForeignKey(
        Entitlement, null=True, blank=True, on_delete=models.SET_NULL, related_name='promo_redemptions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['promo', 'user'], name='promo_user_unique'),
        ]

    def __str__(self):
        return f'Redeem({self.promo_id} by {self.user_id})'


# ── Linked People (Phase G) ───────────────────────────────────────────────────

def generate_people_link_code():
    """Human-friendly people invite code (no ambiguous 0/O/1/I)."""
    import secrets
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    body = ''.join(secrets.choice(alphabet) for _ in range(6))
    return f'PEEP-{body}'


class PeopleInvitation(models.Model):
    STATUSES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
        ('cancelled', 'Cancelled'),
    ]
    VIA = [
        ('query', 'Email or username'),
        ('code', 'Link code'),
    ]

    from_user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='people_invites_sent',
    )
    to_user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='people_invites_received',
    )
    display_name = models.CharField(max_length=100, blank=True, default='')
    status = models.CharField(max_length=12, choices=STATUSES, default='pending')
    invited_via = models.CharField(max_length=10, choices=VIA, default='query')
    query_snapshot = models.CharField(max_length=255, blank=True, default='')
    # Phase J — invite converts an existing local person on from_user's books
    existing_person = models.ForeignKey(
        'Account',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='people_convert_invites',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['from_user', 'to_user'],
                condition=models.Q(status='pending'),
                name='uniq_pending_people_invitation_pair',
            ),
        ]

    def __str__(self):
        return f'PeopleInvite({self.from_user_id}→{self.to_user_id} {self.status})'


class PeopleLink(models.Model):
    STATUSES = [
        ('active', 'Active'),
        ('unlinked', 'Unlinked'),
    ]

    # Ordered so user_a.id < user_b.id
    user_a = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='people_links_as_a',
    )
    user_b = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='people_links_as_b',
    )
    person_a = models.ForeignKey(
        Account, on_delete=models.CASCADE, related_name='people_link_as_a',
    )
    person_b = models.ForeignKey(
        Account, on_delete=models.CASCADE, related_name='people_link_as_b',
    )
    invitation = models.ForeignKey(
        PeopleInvitation, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='links',
    )
    status = models.CharField(max_length=12, choices=STATUSES, default='active')
    created_at = models.DateTimeField(auto_now_add=True)
    unlinked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user_a', 'user_b'],
                condition=models.Q(status='active'),
                name='uniq_active_people_link_pair',
            ),
        ]

    def __str__(self):
        return f'PeopleLink({self.user_a_id}↔{self.user_b_id} {self.status})'

    def person_for(self, user):
        if user.id == self.user_a_id:
            return self.person_a
        if user.id == self.user_b_id:
            return self.person_b
        return None

    def other_user(self, user):
        if user.id == self.user_a_id:
            return self.user_b
        if user.id == self.user_b_id:
            return self.user_a
        return None


class PeopleProposal(models.Model):
    ACTIONS = [
        ('lend', 'Lend'),
        ('borrow', 'Borrow'),
        ('pay', 'Pay'),
        ('receive', 'Receive'),
    ]
    STATUSES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
        ('cancelled', 'Cancelled'),
    ]

    link = models.ForeignKey(PeopleLink, on_delete=models.CASCADE, related_name='proposals')
    proposer = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='people_proposals_sent',
    )
    counterparty = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='people_proposals_received',
    )
    action = models.CharField(max_length=10, choices=ACTIONS)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    date = models.DateField()
    notes = models.CharField(max_length=255, blank=True, default='')
    proposer_wallet = models.ForeignKey(
        Account, on_delete=models.PROTECT, related_name='people_proposals_as_proposer_wallet',
    )
    counterparty_wallet = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='people_proposals_as_counterparty_wallet',
    )
    status = models.CharField(max_length=12, choices=STATUSES, default='pending')
    people_pair_id = models.CharField(max_length=64, db_index=True)
    client_mutation_id = models.CharField(max_length=64, blank=True, default='')
    original_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    original_currency = models.CharField(max_length=10, blank=True, default='')
    fx_rate = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    fx_source = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'PeopleProposal({self.action} {self.amount} {self.status})'


class PeopleNotification(models.Model):
    KINDS = [
        ('link_invite', 'Link invite'),
        ('link_accepted', 'Link accepted'),
        ('link_declined', 'Link declined'),
        ('proposal', 'Proposal'),
        ('proposal_accepted', 'Proposal accepted'),
        ('proposal_declined', 'Proposal declined'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='people_notifications')
    actor = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='people_notifications_acted',
    )
    kind = models.CharField(max_length=24, choices=KINDS)
    title = models.CharField(max_length=160)
    body = models.CharField(max_length=255, blank=True, default='')
    invitation = models.ForeignKey(
        PeopleInvitation, null=True, blank=True, on_delete=models.CASCADE, related_name='notifications',
    )
    proposal = models.ForeignKey(
        PeopleProposal, null=True, blank=True, on_delete=models.CASCADE, related_name='notifications',
    )
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'PeopleNotification({self.kind} → {self.user_id})'


# ── Bank SMS import (Phase 2) ─────────────────────────────────────────────────

class BankSmsImportSettings(models.Model):
    """Per-user prefs for bank SMS assist (paste now; Android SMS later)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='bank_sms_import_settings')
    sms_import_enabled = models.BooleanField(default=True)
    sms_permission_prompted_at = models.DateTimeField(null=True, blank=True)
    default_cash_wallet = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    wallet_aliases = models.JSONField(default=list, blank=True)
    # Phase 5: [{kind, hint?, mask?, phrase?}] — “always treat as…”
    kind_overrides = models.JSONField(default=list, blank=True)
    auto_create_cash_on_atm = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Bank SMS import settings'
        verbose_name_plural = 'Bank SMS import settings'

    def __str__(self):
        return f'BankSmsImportSettings({self.user_id}, enabled={self.sms_import_enabled})'


class BankSmsImport(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_EXPIRED = 'expired'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_EXPIRED, 'Expired'),
    ]

    KIND_EXPENSE = 'expense'
    KIND_ATM = 'atm'
    KIND_INCOME = 'income'
    KIND_REVERSAL = 'reversal'
    KIND_UNKNOWN = 'unknown'
    KIND_CHOICES = [
        (KIND_EXPENSE, 'Expense'),
        (KIND_ATM, 'ATM'),
        (KIND_INCOME, 'Income'),
        (KIND_REVERSAL, 'Reversal'),
        (KIND_UNKNOWN, 'Unknown'),
    ]

    SOURCE_PASTE = 'paste'
    SOURCE_ANDROID_SMS = 'android_sms'
    SOURCE_SHARE = 'share'
    SOURCE_NOTIFICATION = 'notification'
    SOURCE_CHOICES = [
        (SOURCE_PASTE, 'Paste'),
        (SOURCE_ANDROID_SMS, 'Android SMS'),
        (SOURCE_SHARE, 'Share'),
        (SOURCE_NOTIFICATION, 'App notification'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bank_sms_imports')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default=KIND_UNKNOWN)
    amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    occurred_at = models.DateTimeField(null=True, blank=True)
    tx_date = models.DateField(null=True, blank=True)
    suggested_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    resolved_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    cash_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    category = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    fingerprint = models.CharField(max_length=64, db_index=True)
    tid = models.CharField(max_length=64, blank=True, default='')
    counterparty = models.CharField(max_length=120, blank=True, default='')
    bank_hint = models.CharField(max_length=64, blank=True, default='')
    account_mask = models.CharField(max_length=32, blank=True, default='')
    raw_snippet = models.CharField(max_length=280, blank=True, default='')
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES, default=SOURCE_PASTE)
    created_transaction_ids = models.JSONField(default=list, blank=True)
    parser_version = models.CharField(max_length=32, blank=True, default='1')
    confidence = models.DecimalField(max_digits=4, decimal_places=3, null=True, blank=True)
    parse_reason = models.CharField(max_length=64, blank=True, default='')
    record_atm_as_expense = models.BooleanField(default=False)
    # Phase 5: reversal → prior approved import (best-effort)
    linked_import = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='reversal_links',
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status', '-created_at'], name='bank_sms_user_status_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'fingerprint'],
                condition=models.Q(status='pending'),
                name='uniq_pending_bank_sms_fingerprint',
            ),
        ]

    def __str__(self):
        return f'BankSmsImport({self.id} {self.kind} {self.status})'
