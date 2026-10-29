from django.conf import settings
from django.db import models


class StaffRole(models.Model):
    """Ops role for a staff user. Missing row is handled in roles.role_for."""

    ROLE_OWNER = 'owner'
    ROLE_ADMIN = 'admin'
    ROLE_SUPPORT = 'support'
    ROLE_MARKETING = 'marketing'
    ROLE_VIEWER = 'viewer'
    ROLE_CHOICES = [
        (ROLE_OWNER, 'Owner'),
        (ROLE_ADMIN, 'Admin'),
        (ROLE_SUPPORT, 'Support'),
        (ROLE_MARKETING, 'Marketing'),
        (ROLE_VIEWER, 'Viewer'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ops_staff_role',
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_VIEWER)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['user__username']

    def __str__(self):
        return f'{self.user_id}:{self.role}'


class IntegrationAccount(models.Model):
    PROVIDER_GA4 = 'ga4'
    PROVIDER_INSTAGRAM = 'instagram'
    PROVIDER_FACEBOOK = 'facebook'
    PROVIDER_LINKEDIN = 'linkedin'
    PROVIDER_CHOICES = [
        (PROVIDER_GA4, 'Google Analytics 4'),
        (PROVIDER_INSTAGRAM, 'Instagram'),
        (PROVIDER_FACEBOOK, 'Facebook'),
        (PROVIDER_LINKEDIN, 'LinkedIn'),
    ]

    STATUS_NOT_SETUP = 'not_setup'
    STATUS_CONNECTED = 'connected'
    STATUS_NEEDS_RECONNECT = 'needs_reconnect'
    STATUS_ERROR = 'error'
    STATUS_CHOICES = [
        (STATUS_NOT_SETUP, 'Not set up'),
        (STATUS_CONNECTED, 'Connected'),
        (STATUS_NEEDS_RECONNECT, 'Needs reconnect'),
        (STATUS_ERROR, 'Error'),
    ]

    provider = models.CharField(max_length=32, choices=PROVIDER_CHOICES)
    external_id = models.CharField(max_length=200, blank=True, default='')
    display_name = models.CharField(max_length=200, blank=True, default='')
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_NOT_SETUP)
    encrypted_token = models.TextField(blank=True, default='')
    token_expires_at = models.DateTimeField(null=True, blank=True)
    scopes = models.JSONField(default=list, blank=True)
    connected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='ops_integrations_connected',
    )
    connected_at = models.DateTimeField(null=True, blank=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['provider', 'external_id'], name='uniq_integration_provider_external'),
        ]

    def __str__(self):
        return f'{self.provider}:{self.display_name or self.external_id or self.pk}'


class MetricSnapshot(models.Model):
    account = models.ForeignKey(IntegrationAccount, on_delete=models.CASCADE, related_name='snapshots')
    metric = models.CharField(max_length=80)
    date = models.DateField()
    dimension_key = models.CharField(max_length=80, blank=True, default='')
    dimension_value = models.CharField(max_length=200, blank=True, default='')
    value = models.FloatField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['account', 'metric', 'date', 'dimension_key', 'dimension_value'],
                name='uniq_metric_snapshot',
            ),
        ]


class SocialPost(models.Model):
    account = models.ForeignKey(IntegrationAccount, on_delete=models.CASCADE, related_name='posts')
    external_id = models.CharField(max_length=200)
    permalink = models.URLField(max_length=500, blank=True, default='')
    type = models.CharField(max_length=40, blank=True, default='')
    caption_preview = models.CharField(max_length=280, blank=True, default='')
    published_at = models.DateTimeField(null=True, blank=True)
    views = models.PositiveIntegerField(default=0)
    reach = models.PositiveIntegerField(default=0)
    likes = models.PositiveIntegerField(default=0)
    comments = models.PositiveIntegerField(default=0)
    shares = models.PositiveIntegerField(default=0)
    saves = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['account', 'external_id'], name='uniq_social_post'),
        ]


class SyncRun(models.Model):
    provider = models.CharField(max_length=32)
    account = models.ForeignKey(
        IntegrationAccount,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sync_runs',
    )
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    rows_written = models.PositiveIntegerField(default=0)
    ok = models.BooleanField(default=False)
    error = models.TextField(blank=True, default='')


class TrackedLink(models.Model):
    label = models.CharField(max_length=120)
    destination = models.URLField(max_length=500)
    utm_source = models.CharField(max_length=80, blank=True, default='')
    utm_medium = models.CharField(max_length=80, blank=True, default='')
    utm_campaign = models.CharField(max_length=80, blank=True, default='')
    utm_content = models.CharField(max_length=80, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='ops_tracked_links',
    )
    created_at = models.DateTimeField(auto_now_add=True)
