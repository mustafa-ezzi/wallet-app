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
    STATUS_CHOICES = [('active', 'Active'), ('completed', 'Completed'), ('paused', 'Paused')]

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
        return max(0.0, float(self.amount) - float(self.advance_amount or 0))


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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

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
            rec.save(update_fields=['installments_received', 'status'])

        if self.linked_payable and self.type == 'expense':
            pay = self.linked_payable
            paid_count = pay.transactions.filter(type='expense').count()
            pay.installments_paid = paid_count
            if paid_count >= pay.total_installments:
                pay.status = 'completed'
            pay.save(update_fields=['installments_paid', 'status'])


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
    STATUS = [('ongoing', 'Ongoing'), ('completed', 'Completed')]

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
