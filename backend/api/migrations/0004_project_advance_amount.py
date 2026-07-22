# Generated manually for advance_amount on Project

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_nullable_linked_project_receivable'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='advance_amount',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                default=0,
                help_text='Advance already received (subtracted from total remaining)',
                max_digits=14,
            ),
        ),
    ]
