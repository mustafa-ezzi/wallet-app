# Generated manually for Bank SMS Import Phase 2

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0022_linked_people_phase_j'),
    ]

    operations = [
        migrations.CreateModel(
            name='BankSmsImportSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sms_import_enabled', models.BooleanField(default=True)),
                ('sms_permission_prompted_at', models.DateTimeField(blank=True, null=True)),
                ('wallet_aliases', models.JSONField(blank=True, default=list)),
                ('auto_create_cash_on_atm', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('default_cash_wallet', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='api.account',
                )),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bank_sms_import_settings',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Bank SMS import settings',
                'verbose_name_plural': 'Bank SMS import settings',
            },
        ),
        migrations.CreateModel(
            name='BankSmsImport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('approved', 'Approved'),
                        ('rejected', 'Rejected'),
                        ('expired', 'Expired'),
                    ],
                    db_index=True, default='pending', max_length=16,
                )),
                ('kind', models.CharField(
                    choices=[
                        ('expense', 'Expense'),
                        ('atm', 'ATM'),
                        ('income', 'Income'),
                        ('reversal', 'Reversal'),
                        ('unknown', 'Unknown'),
                    ],
                    default='unknown', max_length=16,
                )),
                ('amount', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('occurred_at', models.DateTimeField(blank=True, null=True)),
                ('tx_date', models.DateField(blank=True, null=True)),
                ('category', models.CharField(blank=True, default='', max_length=100)),
                ('notes', models.TextField(blank=True, default='')),
                ('fingerprint', models.CharField(db_index=True, max_length=64)),
                ('tid', models.CharField(blank=True, default='', max_length=64)),
                ('counterparty', models.CharField(blank=True, default='', max_length=120)),
                ('bank_hint', models.CharField(blank=True, default='', max_length=64)),
                ('account_mask', models.CharField(blank=True, default='', max_length=32)),
                ('raw_snippet', models.CharField(blank=True, default='', max_length=280)),
                ('source', models.CharField(
                    choices=[
                        ('paste', 'Paste'),
                        ('android_sms', 'Android SMS'),
                        ('share', 'Share'),
                    ],
                    default='paste', max_length=16,
                )),
                ('created_transaction_ids', models.JSONField(blank=True, default=list)),
                ('parser_version', models.CharField(blank=True, default='1', max_length=32)),
                ('confidence', models.DecimalField(blank=True, decimal_places=3, max_digits=4, null=True)),
                ('parse_reason', models.CharField(blank=True, default='', max_length=64)),
                ('record_atm_as_expense', models.BooleanField(default=False)),
                ('responded_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('cash_account', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='api.account',
                )),
                ('resolved_account', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='api.account',
                )),
                ('suggested_account', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='api.account',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bank_sms_imports',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='banksmsimport',
            index=models.Index(fields=['user', 'status', '-created_at'], name='bank_sms_user_status_idx'),
        ),
        migrations.AddConstraint(
            model_name='banksmsimport',
            constraint=models.UniqueConstraint(
                condition=models.Q(('status', 'pending')),
                fields=('user', 'fingerprint'),
                name='uniq_pending_bank_sms_fingerprint',
            ),
        ),
    ]
