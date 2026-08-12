# Generated manually for Phase J — Linked People polish

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0021_linked_people_phase_g'),
    ]

    operations = [
        migrations.AddField(
            model_name='peopleinvitation',
            name='existing_person',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='people_convert_invites',
                to='api.account',
            ),
        ),
        migrations.AlterField(
            model_name='pushdeliverylog',
            name='kind',
            field=models.CharField(
                choices=[
                    ('payable', 'Payable'),
                    ('receivable', 'Receivable'),
                    ('expense', 'Expense'),
                    ('people_proposal', 'People proposal'),
                ],
                max_length=16,
            ),
        ),
    ]
