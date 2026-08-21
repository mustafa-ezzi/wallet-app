"""Ops API for broadcast push campaigns (Phase 2)."""

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .campaign_push import (
    MAX_CAMPAIGNS_PER_DAY,
    campaigns_sent_today,
    estimate_recipients,
    send_campaign,
)
from .models import PushCampaign
from .ops_audit import log_ops_action
from .ops_permissions import IsOpsStaff
from .ops_api import OpsPagination


def _serialize_campaign(c: PushCampaign) -> dict:
    return {
        'id': c.id,
        'title': c.title,
        'body': c.body,
        'data': c.data or {},
        'audience': c.audience,
        'status': c.status,
        'scheduled_at': c.scheduled_at.isoformat() if c.scheduled_at else None,
        'sent_at': c.sent_at.isoformat() if c.sent_at else None,
        'recipient_estimate': c.recipient_estimate,
        'sent_ok': c.sent_ok,
        'sent_failed': c.sent_failed,
        'last_error': c.last_error or '',
        'created_by': c.created_by_id,
        'created_by_username': c.created_by.username if c.created_by_id else None,
        'created_at': c.created_at.isoformat() if c.created_at else None,
        'updated_at': c.updated_at.isoformat() if c.updated_at else None,
    }


ALLOWED_ROUTES = {
    '',
    'home',
    'settings',
    'bills',
    'wallets',
    'income',
    'reports',
    'family',
    'household',
    'support',
}


def _normalize_data(raw) -> dict:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        return {}
    out = {}
    route = str(raw.get('route') or raw.get('screen') or '').strip().lower()
    if route in ALLOWED_ROUTES and route:
        out['route'] = route
    return out


class OpsCampaignListCreateView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        qs = PushCampaign.objects.select_related('created_by').all()
        status_f = (request.query_params.get('status') or '').strip().lower()
        if status_f:
            qs = qs.filter(status=status_f)
        paginator = OpsPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response([_serialize_campaign(c) for c in page])

    def post(self, request):
        title = (request.data.get('title') or '').strip()
        body = (request.data.get('body') or '').strip()
        audience = (request.data.get('audience') or PushCampaign.AUDIENCE_ALL).strip()
        if audience not in dict(PushCampaign.AUDIENCE_CHOICES):
            return Response({'detail': 'Invalid audience.'}, status=status.HTTP_400_BAD_REQUEST)
        if not title or not body:
            return Response({'detail': 'title and body are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(title) > 120 or len(body) > 400:
            return Response({'detail': 'title/body too long.'}, status=status.HTTP_400_BAD_REQUEST)

        scheduled_raw = request.data.get('scheduled_at')
        scheduled_at = None
        if scheduled_raw:
            scheduled_at = parse_datetime(str(scheduled_raw))
            if scheduled_at is None:
                return Response({'detail': 'Invalid scheduled_at.'}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.is_naive(scheduled_at):
                scheduled_at = timezone.make_aware(scheduled_at, timezone.get_current_timezone())
            if scheduled_at <= timezone.now():
                return Response(
                    {'detail': 'scheduled_at must be in the future.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        estimate = estimate_recipients(audience)
        campaign = PushCampaign.objects.create(
            title=title,
            body=body,
            data=_normalize_data(request.data.get('data')),
            audience=audience,
            status=PushCampaign.STATUS_SCHEDULED if scheduled_at else PushCampaign.STATUS_DRAFT,
            scheduled_at=scheduled_at,
            created_by=request.user,
            recipient_estimate=estimate['users'],
        )
        log_ops_action(
            actor=request.user,
            action='campaign.create',
            target_type='push_campaign',
            target_id=campaign.id,
            meta={'audience': audience, 'estimate_users': estimate['users']},
            request=request,
        )
        return Response(_serialize_campaign(campaign), status=status.HTTP_201_CREATED)


class OpsCampaignDetailView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request, campaign_id: int):
        try:
            c = PushCampaign.objects.select_related('created_by').get(pk=campaign_id)
        except PushCampaign.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = _serialize_campaign(c)
        data['deliveries_summary'] = {
            'ok': c.deliveries.filter(status='ok').count(),
            'failed': c.deliveries.filter(status='failed').count(),
            'skipped': c.deliveries.filter(status='skipped').count(),
            'pending': c.deliveries.filter(status='pending').count(),
        }
        return Response(data)

    def delete(self, request, campaign_id: int):
        try:
            campaign = PushCampaign.objects.get(pk=campaign_id)
        except PushCampaign.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if campaign.status == PushCampaign.STATUS_SENDING:
            return Response(
                {'detail': 'Cannot delete a campaign while it is sending.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cid = campaign.id
        meta = {
            'title': campaign.title,
            'status': campaign.status,
            'audience': campaign.audience,
        }
        campaign.delete()
        log_ops_action(
            actor=request.user,
            action='campaign.delete',
            target_type='push_campaign',
            target_id=cid,
            meta=meta,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class OpsCampaignEstimateView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        audience = (request.query_params.get('audience') or PushCampaign.AUDIENCE_ALL).strip()
        if audience not in dict(PushCampaign.AUDIENCE_CHOICES):
            return Response({'detail': 'Invalid audience.'}, status=status.HTTP_400_BAD_REQUEST)
        est = estimate_recipients(audience)
        return Response({
            'audience': audience,
            'users': est['users'],
            'tokens': est['tokens'],
            'campaigns_sent_today': campaigns_sent_today(),
            'max_campaigns_per_day': MAX_CAMPAIGNS_PER_DAY,
        })


class OpsCampaignSendView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request, campaign_id: int):
        try:
            campaign = PushCampaign.objects.get(pk=campaign_id)
        except PushCampaign.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        dry = str(request.data.get('dry_run') or '').lower() in {'1', 'true', 'yes'}
        confirm = str(request.data.get('confirm') or '').lower() in {'1', 'true', 'yes'}
        if not dry and not confirm:
            return Response(
                {'detail': 'Pass confirm=true to send (or dry_run=true to estimate).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = send_campaign(campaign, dry_run=dry)
        if not dry:
            log_ops_action(
                actor=request.user,
                action='campaign.send' if not result.get('dry_run') else 'campaign.dry_run',
                target_type='push_campaign',
                target_id=campaign.id,
                meta={
                    'sent_ok': result.get('sent_ok'),
                    'sent_failed': result.get('sent_failed'),
                    'ok': result.get('ok'),
                },
                request=request,
            )
        campaign.refresh_from_db()
        return Response({
            **result,
            'campaign': _serialize_campaign(campaign),
        }, status=status.HTTP_200_OK if result.get('ok') or dry else status.HTTP_400_BAD_REQUEST)


class OpsCampaignCancelView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request, campaign_id: int):
        try:
            campaign = PushCampaign.objects.get(pk=campaign_id)
        except PushCampaign.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if campaign.status not in {PushCampaign.STATUS_DRAFT, PushCampaign.STATUS_SCHEDULED}:
            return Response(
                {'detail': 'Only draft/scheduled campaigns can be cancelled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        campaign.status = PushCampaign.STATUS_CANCELLED
        campaign.save(update_fields=['status', 'updated_at'])
        log_ops_action(
            actor=request.user,
            action='campaign.cancel',
            target_type='push_campaign',
            target_id=campaign.id,
            request=request,
        )
        return Response(_serialize_campaign(campaign))
