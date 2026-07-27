# Generated manually for offline sync idempotency

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0009_household_expense_pot_amount'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='client_mutation_id',
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True),
        ),
        migrations.AddConstraint(
            model_name='transaction',
            constraint=models.UniqueConstraint(
                condition=models.Q(('client_mutation_id__isnull', False))
                & ~models.Q(('client_mutation_id', '')),
                fields=('user', 'client_mutation_id'),
                name='uniq_tx_user_client_mutation_id',
            ),
        ),
    ]
