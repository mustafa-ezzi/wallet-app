from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0033_bot_draft'),
    ]

    operations = [
        migrations.AddField(
            model_name='recurringexpense',
            name='remind',
            field=models.BooleanField(default=True),
        ),
    ]
