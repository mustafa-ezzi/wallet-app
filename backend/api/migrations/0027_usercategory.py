from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0026_userprofile_google_sub'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('expense', 'Expense'), ('income', 'Income')], max_length=10)),
                ('name', models.CharField(max_length=80)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='custom_categories',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['kind', 'name'],
            },
        ),
        migrations.AddConstraint(
            model_name='usercategory',
            constraint=models.UniqueConstraint(fields=('user', 'kind', 'name'), name='uniq_user_category_kind_name'),
        ),
    ]
