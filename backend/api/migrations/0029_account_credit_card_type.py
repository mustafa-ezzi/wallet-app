from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0028_transaction_linked_recurring_expense'),
    ]

    operations = [
        migrations.AlterField(
            model_name='account',
            name='type',
            field=models.CharField(
                choices=[
                    ('bank', 'Bank'),
                    ('cash', 'Cash'),
                    ('credit_card', 'Credit Card'),
                    ('person', 'Person'),
                ],
                default='bank',
                max_length=20,
            ),
        ),
    ]
