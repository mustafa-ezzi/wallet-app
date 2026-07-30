from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings

from .due_push import send_due_reminders
from .models import DeviceToken, NotificationPreference


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
