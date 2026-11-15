"""Google Form webhook & Ops tester feedback API."""

from __future__ import annotations

import hmac
from collections import Counter

from django.conf import settings
from django.db.models import Avg, Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import TesterFeedback
from .ops_audit import log_ops_action
from .ops_permissions import ops


def _webhook_secret() -> str:
    return (
        getattr(settings, 'GOOGLE_FORM_WEBHOOK_SECRET', '')
        or getattr(settings, 'CRON_SECRET', '')
        or ''
    ).strip()


def _provided_secret(request) -> str:
    provided = (
        request.headers.get('X-Webhook-Secret')
        or request.META.get('HTTP_X_WEBHOOK_SECRET')
        or request.headers.get('X-Cron-Secret')
        or request.META.get('HTTP_X_CRON_SECRET')
        or ''
    ).strip()
    auth = (request.headers.get('Authorization') or '').strip()
    if auth.lower().startswith('bearer '):
        provided = auth[7:].strip() or provided
    return provided


def _as_text(val) -> str:
    if val is None:
        return ''
    if isinstance(val, list):
        return ', '.join(str(x).strip() for x in val if str(x).strip())
    return str(val).strip()


def _as_list(val) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    text = str(val).strip()
    if not text:
        return []
    return [part.strip() for part in text.split(',') if part.strip()]


def _as_score(val) -> int | None:
    if val is None or val == '':
        return None
    if isinstance(val, list):
        val = val[0] if val else None
    try:
        num = int(float(str(val).strip()))
    except (TypeError, ValueError):
        return None
    if 1 <= num <= 5:
        return num
    return None


def _extract_answers(payload: dict) -> dict:
    """
    Accept either:
      { "response_id": "...", "submitted_at": "...", "answers": { "Question": value } }
    or flat structured fields.
    """
    raw = payload.get('answers')
    if isinstance(raw, dict):
        return {str(k): v for k, v in raw.items()}
    return {}


def _map_answers(payload: dict, raw_answers: dict) -> dict:
    mapped = {
        'platform': _as_text(payload.get('platform')),
        'ease_score': _as_score(payload.get('ease_score')),
        'discovery_level': _as_text(payload.get('discovery_level')),
        'features_tried': _as_list(payload.get('features_tried')),
        'trai_experience': _as_text(payload.get('trai_experience')),
        'price_range': _as_text(payload.get('price_range')),
        'favorite_feature': _as_text(payload.get('favorite_feature')),
        'bugs_or_confusion': _as_text(payload.get('bugs_or_confusion')),
        'improvement_idea': _as_text(payload.get('improvement_idea')),
        'recommend_score': _as_score(payload.get('recommend_score')),
        'contact': _as_text(payload.get('contact')),
    }

    for title, value in raw_answers.items():
        q = title.lower()
        if not mapped['platform'] and any(k in q for k in ('platform', 'version', 'android', 'web app')):
            mapped['platform'] = _as_text(value)[:120]
        elif mapped['ease_score'] is None and any(k in q for k in ('easy', 'ease', 'hard', 'experience using')):
            score = _as_score(value)
            if score is not None:
                mapped['ease_score'] = score
        elif not mapped['discovery_level'] and 'discover' in q:
            mapped['discovery_level'] = _as_text(value)[:120]
        elif not mapped['features_tried'] and ('which' in q and 'feature' in q or 'features did you try' in q):
            mapped['features_tried'] = _as_list(value)
        elif not mapped['trai_experience'] and 'trai' in q:
            mapped['trai_experience'] = _as_text(value)[:255]
        elif not mapped['price_range'] and any(k in q for k in ('price', 'range', 'pkr', 'pay', 'apply')):
            mapped['price_range'] = _as_text(value)[:120]
        elif not mapped['favorite_feature'] and any(k in q for k in ('favorite', 'favourite', 'most useful')):
            mapped['favorite_feature'] = _as_text(value)
        elif not mapped['bugs_or_confusion'] and any(k in q for k in ('bug', 'crash', 'confus', 'issue', 'problem')):
            mapped['bugs_or_confusion'] = _as_text(value)
        elif not mapped['improvement_idea'] and any(k in q for k in ('improve', 'missing', 'add', 'suggest')):
            mapped['improvement_idea'] = _as_text(value)
        elif mapped['recommend_score'] is None and any(k in q for k in ('recommend', 'keep using', 'likely')):
            score = _as_score(value)
            if score is not None:
                mapped['recommend_score'] = score
        elif not mapped['contact'] and any(k in q for k in ('email', 'whatsapp', 'contact', 'name', 'reach out')):
            mapped['contact'] = _as_text(value)[:255]

    return mapped


def _serialize_feedback(obj: TesterFeedback) -> dict:
    return {
        'id': obj.id,
        'external_id': obj.external_id,
        'source': obj.source,
        'submitted_at': obj.submitted_at.isoformat() if obj.submitted_at else None,
        'platform': obj.platform,
        'ease_score': obj.ease_score,
        'discovery_level': obj.discovery_level,
        'features_tried': obj.features_tried or [],
        'trai_experience': obj.trai_experience,
        'price_range': obj.price_range,
        'favorite_feature': obj.favorite_feature,
        'bugs_or_confusion': obj.bugs_or_confusion,
        'improvement_idea': obj.improvement_idea,
        'recommend_score': obj.recommend_score,
        'contact': obj.contact,
        'raw_answers': obj.raw_answers or {},
        'status': obj.status,
        'staff_note': obj.staff_note,
        'created_at': obj.created_at.isoformat() if obj.created_at else None,
        'updated_at': obj.updated_at.isoformat() if obj.updated_at else None,
    }


def _build_summary(qs) -> dict:
    total = qs.count()
    new_count = qs.filter(status=TesterFeedback.STATUS_NEW).count()
    agg = qs.aggregate(avg_ease=Avg('ease_score'), avg_recommend=Avg('recommend_score'))

    price_counter: Counter[str] = Counter()
    platform_counter: Counter[str] = Counter()
    discovery_counter: Counter[str] = Counter()
    trai_counter: Counter[str] = Counter()
    feature_counter: Counter[str] = Counter()

    for row in qs.values(
        'price_range',
        'platform',
        'discovery_level',
        'trai_experience',
        'features_tried',
    ):
        if row['price_range']:
            price_counter[row['price_range']] += 1
        for plat in _as_list(row['platform']):
            platform_counter[plat] += 1
        if row['discovery_level']:
            discovery_counter[row['discovery_level']] += 1
        if row['trai_experience']:
            trai_counter[row['trai_experience']] += 1
        for feat in (row['features_tried'] or []):
            if feat:
                feature_counter[str(feat)] += 1

    def _top(counter: Counter[str]) -> list[dict]:
        return [{'label': k, 'count': v} for k, v in counter.most_common(12)]

    return {
        'total': total,
        'new_count': new_count,
        'avg_ease': round(float(agg['avg_ease']), 2) if agg['avg_ease'] is not None else None,
        'avg_recommend': round(float(agg['avg_recommend']), 2) if agg['avg_recommend'] is not None else None,
        'price_ranges': _top(price_counter),
        'platforms': _top(platform_counter),
        'discovery_levels': _top(discovery_counter),
        'trai_experiences': _top(trai_counter),
        'features_tried': _top(feature_counter),
    }


class GoogleFormWebhookView(APIView):
    """
    Receive Google Form submissions from Google Apps Script onFormSubmit.
    Auth: X-Webhook-Secret, X-Cron-Secret, or Authorization: Bearer <secret>.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = _webhook_secret()
        provided = _provided_secret(request)
        if not secret or not provided or not hmac.compare_digest(provided, secret):
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        payload = request.data if isinstance(request.data, dict) else {}
        raw_answers = _extract_answers(payload)
        mapped = _map_answers(payload, raw_answers)

        external_id = _as_text(payload.get('response_id') or payload.get('external_id'))[:128] or None
        submitted_raw = _as_text(payload.get('submitted_at'))
        submitted_at = parse_datetime(submitted_raw) if submitted_raw else None
        if submitted_at is None:
            submitted_at = timezone.now()
        elif timezone.is_naive(submitted_at):
            submitted_at = timezone.make_aware(submitted_at, timezone.get_current_timezone())

        defaults = {
            'source': _as_text(payload.get('source'))[:32] or 'google_form',
            'submitted_at': submitted_at,
            'raw_answers': raw_answers or {k: v for k, v in payload.items() if k not in {'response_id', 'external_id', 'submitted_at', 'source'}},
            **mapped,
        }

        if external_id:
            obj, created = TesterFeedback.objects.update_or_create(
                external_id=external_id,
                defaults=defaults,
            )
        else:
            obj = TesterFeedback.objects.create(**defaults)
            created = True

        return Response(
            {'ok': True, 'created': created, 'id': obj.id},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class _FeedbackPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class OpsFeedbackListView(APIView):
    """List tester feedback responses and summary metrics for Ops."""

    permission_classes = [ops('feedback.read')]

    def get(self, request):
        all_qs = TesterFeedback.objects.all()
        summary = _build_summary(all_qs)

        qs = all_qs
        status_filter = (request.query_params.get('status') or '').strip()
        if status_filter in {TesterFeedback.STATUS_NEW, TesterFeedback.STATUS_REVIEWED, TesterFeedback.STATUS_RESOLVED}:
            qs = qs.filter(status=status_filter)

        platform_filter = (request.query_params.get('platform') or '').strip()
        if platform_filter:
            qs = qs.filter(platform__icontains=platform_filter)

        search = (request.query_params.get('q') or '').strip()
        if search:
            qs = qs.filter(
                Q(favorite_feature__icontains=search)
                | Q(bugs_or_confusion__icontains=search)
                | Q(improvement_idea__icontains=search)
                | Q(trai_experience__icontains=search)
                | Q(price_range__icontains=search)
                | Q(contact__icontains=search)
            )

        paginator = _FeedbackPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return Response({
            'count': paginator.page.paginator.count,
            'next': paginator.get_next_link(),
            'previous': paginator.get_previous_link(),
            'results': [_serialize_feedback(row) for row in page],
            'summary': summary,
        })


class OpsFeedbackDetailView(APIView):
    """Update status/note or delete a tester feedback entry."""

    permission_classes = [ops({'PATCH': 'feedback.write', 'DELETE': 'feedback.write'})]

    def patch(self, request, feedback_id: int):
        try:
            obj = TesterFeedback.objects.get(pk=feedback_id)
        except TesterFeedback.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data if isinstance(request.data, dict) else {}
        changed = []
        if 'status' in data:
            new_status = str(data['status'] or '').strip()
            valid = {TesterFeedback.STATUS_NEW, TesterFeedback.STATUS_REVIEWED, TesterFeedback.STATUS_RESOLVED}
            if new_status not in valid:
                return Response({'detail': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)
            obj.status = new_status
            changed.append('status')

        if 'staff_note' in data:
            obj.staff_note = str(data['staff_note'] or '').strip()
            changed.append('staff_note')

        if changed:
            obj.save(update_fields=[*changed, 'updated_at'])
            log_ops_action(
                actor=request.user,
                action='feedback.update',
                target_type='tester_feedback',
                target_id=obj.id,
                meta={'changed': changed, 'status': obj.status},
                request=request,
            )

        return Response(_serialize_feedback(obj))

    def delete(self, request, feedback_id: int):
        try:
            obj = TesterFeedback.objects.get(pk=feedback_id)
        except TesterFeedback.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        fid = obj.id
        obj.delete()
        log_ops_action(
            actor=request.user,
            action='feedback.delete',
            target_type='tester_feedback',
            target_id=fid,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
