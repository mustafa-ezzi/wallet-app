# Generated manually for Phase 5 bank SMS polish

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0023_bank_sms_import_phase_2'),
    ]

    operations = [
        migrations.AddField(
            model_name='banksmsimportsettings',
            name='kind_overrides',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='banksmsimport',
            name='linked_import',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='reversal_links',
                to='api.banksmsimport',
            ),
        ),
    ]
