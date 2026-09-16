from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0025_category_budget'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='google_sub',
            field=models.CharField(blank=True, db_index=True, default='', max_length=64),
        ),
    ]
