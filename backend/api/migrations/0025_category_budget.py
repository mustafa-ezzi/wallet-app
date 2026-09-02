# Generated manually for CategoryBudget

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0024_bank_sms_import_phase_5'),
    ]

    operations = [
        migrations.CreateModel(
            name='CategoryBudget',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.PositiveSmallIntegerField()),
                ('month', models.PositiveSmallIntegerField()),
                ('category', models.CharField(max_length=100)),
                ('limit_amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='category_budgets',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['category'],
            },
        ),
        migrations.AddConstraint(
            model_name='categorybudget',
            constraint=models.UniqueConstraint(
                fields=('user', 'year', 'month', 'category'),
                name='uniq_user_month_category_budget',
            ),
        ),
        migrations.AddConstraint(
            model_name='categorybudget',
            constraint=models.CheckConstraint(
                condition=models.Q(('month__gte', 1), ('month__lte', 12)),
                name='category_budget_month_1_12',
            ),
        ),
        migrations.AddConstraint(
            model_name='categorybudget',
            constraint=models.CheckConstraint(
                condition=models.Q(('limit_amount__gt', 0)),
                name='category_budget_limit_positive',
            ),
        ),
    ]
