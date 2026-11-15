from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0035_push_campaign_one_user'),
    ]

    operations = [
        migrations.CreateModel(
            name='TesterFeedback',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('external_id', models.CharField(blank=True, max_length=128, null=True, unique=True)),
                ('source', models.CharField(default='google_form', max_length=32)),
                ('submitted_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('platform', models.CharField(blank=True, default='', max_length=120)),
                ('ease_score', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('discovery_level', models.CharField(blank=True, default='', max_length=120)),
                ('features_tried', models.JSONField(blank=True, default=list)),
                ('trai_experience', models.CharField(blank=True, default='', max_length=255)),
                ('price_range', models.CharField(blank=True, default='', max_length=120)),
                ('favorite_feature', models.TextField(blank=True, default='')),
                ('bugs_or_confusion', models.TextField(blank=True, default='')),
                ('improvement_idea', models.TextField(blank=True, default='')),
                ('recommend_score', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('contact', models.CharField(blank=True, default='', max_length=255)),
                ('raw_answers', models.JSONField(blank=True, default=dict)),
                (
                    'status',
                    models.CharField(
                        choices=[('new', 'New'), ('reviewed', 'Reviewed'), ('resolved', 'Resolved')],
                        db_index=True,
                        default='new',
                        max_length=24,
                    ),
                ),
                ('staff_note', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-submitted_at', '-id'],
                'indexes': [
                    models.Index(fields=['status', '-submitted_at'], name='feedback_status_sub_idx'),
                ],
            },
        ),
    ]
