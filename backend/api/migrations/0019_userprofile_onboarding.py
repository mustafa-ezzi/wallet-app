from django.db import migrations, models


def mark_existing_complete(apps, schema_editor):
    UserProfile = apps.get_model('api', 'UserProfile')
    UserProfile.objects.all().update(onboarding_complete=True)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0018_ops_phase5_polish'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='country',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='date_of_birth',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='gender',
            field=models.CharField(
                blank=True,
                choices=[
                    ('male', 'Male'),
                    ('female', 'Female'),
                    ('other', 'Other'),
                    ('prefer_not', 'Prefer not to say'),
                ],
                default='',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='onboarding_complete',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='user_type',
            field=models.CharField(
                blank=True,
                choices=[
                    ('student', 'Student'),
                    ('professional', 'Professional'),
                    ('self_employed', 'Self Employed'),
                    ('retired', 'Retired'),
                ],
                default='',
                max_length=32,
            ),
        ),
        migrations.RunPython(mark_existing_complete, migrations.RunPython.noop),
    ]
