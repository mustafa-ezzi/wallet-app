from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0030_account_credit_limit'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='statement_day',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='account',
            name='due_day',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
