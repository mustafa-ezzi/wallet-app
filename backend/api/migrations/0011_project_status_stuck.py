# Generated manually — allow marking one-time income projects as stuck

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_transaction_client_mutation_id'),
    ]

    operations = [
        migrations.AlterField(
            model_name='project',
            name='status',
            field=models.CharField(
                choices=[
                    ('active', 'Active'),
                    ('completed', 'Completed'),
                    ('paused', 'Paused'),
                    ('stuck', 'Stuck'),
                ],
                default='active',
                max_length=15,
            ),
        ),
    ]
