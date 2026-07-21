from django.contrib import admin
from .models import (
    UserProfile, Account, Project, Transaction,
    RecurringExpense, ReceivableInstallment, PayableInstallment
)

admin.site.register(UserProfile)
admin.site.register(Account)
admin.site.register(Project)
admin.site.register(Transaction)
admin.site.register(RecurringExpense)
admin.site.register(ReceivableInstallment)
admin.site.register(PayableInstallment)
