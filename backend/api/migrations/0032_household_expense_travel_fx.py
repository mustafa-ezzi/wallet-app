from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0031_account_statement_due_day'),
    ]

    operations = [
        migrations.AddField(
            model_name='householdexpense',
            name='original_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='householdexpense',
            name='original_currency',
            field=models.CharField(blank=True, default='', max_length=10),
        ),
        migrations.AddField(
            model_name='householdexpense',
            name='fx_rate',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=18, null=True),
        ),
        migrations.AddField(
            model_name='householdexpense',
            name='fx_source',
            field=models.CharField(
                blank=True,
                choices=[
                    ('live', 'Live'),
                    ('manual', 'Manual'),
                    ('cached', 'Cached'),
                    ('offline', 'Offline'),
                ],
                default='',
                max_length=16,
            ),
        ),
    ]
