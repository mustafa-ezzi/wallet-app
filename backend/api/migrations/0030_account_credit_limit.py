from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0029_account_credit_card_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='credit_limit',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
    ]
