from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings

from .due_push import send_due_reminders
from .campaign_push import process_due_scheduled_campaigns
from .models import DeviceToken, NotificationPreference
from .people_proposal_nudges import send_people_proposal_nudges


class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = ('id', 'token', 'platform', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = (
            'enabled',
            'remind_payables',
            'remind_receivables',
            'lead_3',
            'lead_1',
            'lead_due',
            'marketing_enabled',
            'updated_at',
        )
        read_only_fields = ('updated_at',)


class DeviceTokenViewSet(viewsets.ViewSet):
    """POST /api/devices/ register · POST /api/devices/revoke/ · GET /api/devices/."""

    permission_classes = [IsAuthenticated]

    def create(self, request):
        token = (request.data.get('token') or '').strip()
        platform = (request.data.get('platform') or 'unknown').strip().lower()
        if platform not in {'android', 'ios', 'web', 'unknown'}:
            platform = 'unknown'
        if not token:
            return Response({'detail': 'token is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Token may move between users on shared devices — reassign
        obj, created = DeviceToken.objects.update_or_create(
            token=token,
            defaults={'user': request.user, 'platform': platform},
        )
        return Response(
            DeviceTokenSerializer(obj).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def list(self, request):
        qs = DeviceToken.objects.filter(user=request.user)
        return Response(DeviceTokenSerializer(qs, many=True).data)

    @action(detail=False, methods=['post'], url_path='revoke')
    def revoke(self, request):
        token = (request.data.get('token') or '').strip()
        if not token:
            return Response({'detail': 'token is required.'}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = DeviceToken.objects.filter(user=request.user, token=token).delete()
        if not deleted:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pref, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return Response(NotificationPreferenceSerializer(pref).data)

    def patch(self, request):
        pref, _ = NotificationPreference.objects.get_or_create(user=request.user)
        ser = NotificationPreferenceSerializer(pref, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class DueRemindersJobView(APIView):
    """
    Railway cron target: POST /api/jobs/due-reminders/
    Auth: Authorization: Bearer <CRON_SECRET> or X-Cron-Secret header.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = getattr(settings, 'CRON_SECRET', '') or ''
        provided = (
            request.headers.get('X-Cron-Secret')
            or request.META.get('HTTP_X_CRON_SECRET')
            or ''
        ).strip()
        auth = (request.headers.get('Authorization') or '').strip()
        if auth.lower().startswith('bearer '):
            provided = auth[7:].strip() or provided

        if not secret or provided != secret:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        dry = str(request.query_params.get('dry_run') or request.data.get('dry_run') or '').lower() in {
            '1', 'true', 'yes',
        }
        result = send_due_reminders(dry_run=dry)
        # Trim details in response for size
        return Response({
            'date': result['date'],
            'candidates': result['candidates'],
            'sent': result['sent'],
            'skipped': result['skipped'],
            'failed': result['failed'],
            'dry_run': result['dry_run'],
        })


class PeopleProposalNudgesJobView(APIView):
    """
    Railway cron: POST /api/jobs/people-proposal-nudges/
    Reminds counterparties of pending proposals older than N days (default 2).
    Auth: same CRON_SECRET as due-reminders.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = getattr(settings, 'CRON_SECRET', '') or ''
        provided = (
            request.headers.get('X-Cron-Secret')
            or request.META.get('HTTP_X_CRON_SECRET')
            or ''
        ).strip()
        auth = (request.headers.get('Authorization') or '').strip()
        if auth.lower().startswith('bearer '):
            provided = auth[7:].strip() or provided

        if not secret or provided != secret:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        dry = str(request.query_params.get('dry_run') or request.data.get('dry_run') or '').lower() in {
            '1', 'true', 'yes',
        }
        try:
            min_age = int(request.query_params.get('min_age_days') or request.data.get('min_age_days') or 2)
        except (TypeError, ValueError):
            min_age = 2
        result = send_people_proposal_nudges(dry_run=dry, min_age_days=min_age)
        return Response(result)


class PushCampaignsJobView(APIView):
    """
    Railway cron: POST /api/jobs/push-campaigns/
    Sends due scheduled Ops campaigns.
    Auth: same CRON_SECRET as due-reminders.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = getattr(settings, 'CRON_SECRET', '') or ''
        provided = (
            request.headers.get('X-Cron-Secret')
            or request.META.get('HTTP_X_CRON_SECRET')
            or ''
        ).strip()
        auth = (request.headers.get('Authorization') or '').strip()
        if auth.lower().startswith('bearer '):
            provided = auth[7:].strip() or provided

        if not secret or provided != secret:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        dry = str(request.query_params.get('dry_run') or request.data.get('dry_run') or '').lower() in {
            '1', 'true', 'yes',
        }
        return Response(process_due_scheduled_campaigns(dry_run=dry))


class RefreshInactivityJobView(APIView):
    """
    Railway cron: POST /api/jobs/refresh-inactivity/
    Recomputes inactivity tiers (flag only — never deletes).
    Auth: same CRON_SECRET as other jobs.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = getattr(settings, 'CRON_SECRET', '') or ''
        provided = (
            request.headers.get('X-Cron-Secret')
            or request.META.get('HTTP_X_CRON_SECRET')
            or ''
        ).strip()
        auth = (request.headers.get('Authorization') or '').strip()
        if auth.lower().startswith('bearer '):
            provided = auth[7:].strip() or provided

        if not secret or provided != secret:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        from django.contrib.auth.models import User
        from django.db.models import Max
        from .models import DeviceToken, Transaction
        from .ops_api import _ensure_ops_meta, _inactivity_tier, _last_seen_for

        updated = 0
        device_last = {
            row['user_id']: row['m']
            for row in DeviceToken.objects.values('user_id').annotate(m=Max('updated_at'))
        }
        activity_last = {
            row['user_id']: row['m']
            for row in Transaction.objects.values('user_id').annotate(m=Max('created_at'))
        }
        for user in User.objects.select_related('ops_meta').iterator(chunk_size=200):
            meta = _ensure_ops_meta(user)
            last_seen = _last_seen_for(
                user,
                meta,
                device_touch=device_last.get(user.id),
                activity_touch=activity_last.get(user.id),
            )
            tier = _inactivity_tier(last_seen)
            fields: list[str] = []
            if last_seen and (meta.last_seen_at is None or last_seen > meta.last_seen_at):
                meta.last_seen_at = last_seen
                fields.append('last_seen_at')
            if meta.inactivity_tier != tier:
                meta.inactivity_tier = tier
                fields.append('inactivity_tier')
            if fields:
                fields.append('updated_at')
                meta.save(update_fields=list(dict.fromkeys(fields)))
                updated += 1

        return Response({'updated': updated})
