from django.db import models
from django.contrib.auth.models import User
from django.db.models import Sum


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    currency = models.CharField(max_length=10, default='PKR')

    def __str__(self):
        return f"Profile({self.user.username})"


class Account(models.Model):
    ACCOUNT_TYPES = [('bank', 'Bank'), ('cash', 'Cash')]

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
