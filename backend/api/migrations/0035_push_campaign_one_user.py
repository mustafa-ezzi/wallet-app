from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0034_recurring_expense_remind'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='pushcampaign',
            name='target_user',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='push_campaigns_targeted',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='pushcampaign',
            name='audience',
            field=models.CharField(
                choices=[
                    ('all', 'All opted-in users with a device'),
                    ('android', 'Android only'),
                    ('inactive_7d', 'Inactive 7d+'),
                    ('inactive_30d', 'Inactive 30d+'),
                    ('inactive_90d', 'Inactive 90d+'),
                    ('user', 'One user'),
                ],
                default='all',
                max_length=32,
            ),
        ),
    ]
