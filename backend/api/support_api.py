"""
Support tickets — user app + Ops inbox (Phase 3).
No finance payloads. Staff reply can trigger an Expo push.
"""

from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .expo_push import send_expo_push
from .models import DeviceToken, SupportMessage, SupportThread
from .ops_audit import log_ops_action
from .ops_permissions import IsOpsStaff
from .ops_api import OpsPagination


def _serialize_message(m: SupportMessage) -> dict:
    return {
        'id': m.id,
        'sender': m.sender,
        'author_id': m.author_id,
        'author_username': m.author.username if m.author_id else None,
        'body': m.body,
        'created_at': m.created_at.isoformat() if m.created_at else None,
    }


def _serialize_thread(t: SupportThread, *, include_messages: bool = False) -> dict:
    data = {
        'id': t.id,
        'subject': t.subject,
        'category': t.category,
        'status': t.status,
        'priority': t.priority,
        'user_id': t.user_id,
        'username': t.user.username if t.user_id else None,
        'email': t.user.email if t.user_id else '',
        'created_at': t.created_at.isoformat() if t.created_at else None,
        'updated_at': t.updated_at.isoformat() if t.updated_at else None,
        'closed_at': t.closed_at.isoformat() if t.closed_at else None,
        'message_count': t.messages.count() if not include_messages else None,
    }
    if include_messages:
        msgs = list(t.messages.select_related('author').all())
        data['messages'] = [_serialize_message(m) for m in msgs]
        data['message_count'] = len(msgs)
    else:
        last = t.messages.order_by('-created_at').first()
        data['last_message_preview'] = (last.body[:120] if last else '')
        data['last_sender'] = last.sender if last else None
    return data


def _notify_user_staff_reply(thread: SupportThread, preview: str) -> None:
    tokens = list(
        DeviceToken.objects.filter(user_id=thread.user_id).values_list('token', flat=True)
    )
    if not tokens:
        return
    body = preview.strip()
    if len(body) > 140:
        body = body[:137] + '…'
    send_expo_push(
        tokens,
        title='CashTrail Support replied',
        body=body or 'Open the app to read the reply.',
        data={'type': 'support', 'route': 'support', 'thread_id': thread.id},
        channel_id='cashtrail-updates',
    )


# ── User-facing ──────────────────────────────────────────────────────────────

class SupportThreadListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            SupportThread.objects.filter(user=request.user)
            .select_related('user')
            .order_by('-updated_at')
        )
        return Response([_serialize_thread(t) for t in qs[:50]])

    def post(self, request):
        subject = (request.data.get('subject') or '').strip()
        body = (request.data.get('body') or '').strip()
        category = (request.data.get('category') or SupportThread.CATEGORY_OTHER).strip()
        if category not in dict(SupportThread.CATEGORY_CHOICES):
            category = SupportThread.CATEGORY_OTHER
        if not subject or not body:
            return Response(
                {'detail': 'subject and body are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(subject) > 160 or len(body) > 4000:
            return Response({'detail': 'subject/body too long.'}, status=status.HTTP_400_BAD_REQUEST)

        # Soft rate limit: max 5 new threads / day / user
        day_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        created_today = SupportThread.objects.filter(
            user=request.user, created_at__gte=day_start,
        ).count()
        if created_today >= 5:
            return Response(
                {'detail': 'Daily support ticket limit reached. Please wait or reply on an open ticket.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        thread = SupportThread.objects.create(
            user=request.user,
            subject=subject,
            category=category,
            status=SupportThread.STATUS_WAITING_OPS,
        )
        SupportMessage.objects.create(
            thread=thread,
            sender=SupportMessage.SENDER_USER,
            author=request.user,
            body=body,
        )
        return Response(
            _serialize_thread(thread, include_messages=True),
            status=status.HTTP_201_CREATED,
        )


class SupportThreadDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, thread_id: int):
        try:
            thread = SupportThread.objects.select_related('user').get(
                pk=thread_id, user=request.user,
            )
        except SupportThread.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_thread(thread, include_messages=True))


class SupportThreadReplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, thread_id: int):
        try:
            thread = SupportThread.objects.select_related('user').get(
                pk=thread_id, user=request.user,
            )
        except SupportThread.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if thread.status == SupportThread.STATUS_CLOSED:
            return Response(
                {'detail': 'This ticket is closed. Open a new one if you need help.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        body = (request.data.get('body') or '').strip()
        if not body:
            return Response({'detail': 'body is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(body) > 4000:
            return Response({'detail': 'body too long.'}, status=status.HTTP_400_BAD_REQUEST)

        SupportMessage.objects.create(
            thread=thread,
            sender=SupportMessage.SENDER_USER,
            author=request.user,
            body=body,
        )
        thread.status = SupportThread.STATUS_WAITING_OPS
        thread.save(update_fields=['status', 'updated_at'])
        return Response(_serialize_thread(thread, include_messages=True))


# ── Ops ───────────────────────────────────────────────────────────────────────

class OpsSupportListView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        qs = SupportThread.objects.select_related('user').order_by('-updated_at')
        status_f = (request.query_params.get('status') or '').strip().lower()
        if status_f:
            qs = qs.filter(status=status_f)
        category = (request.query_params.get('category') or '').strip().lower()
        if category:
            qs = qs.filter(category=category)
        q = (request.query_params.get('q') or '').strip()
        if q:
            from django.db.models import Q
            qs = qs.filter(
                Q(subject__icontains=q)
                | Q(user__username__icontains=q)
                | Q(user__email__icontains=q)
            )

        paginator = OpsPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response([_serialize_thread(t) for t in page])


class OpsSupportDetailView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request, thread_id: int):
        try:
            thread = SupportThread.objects.select_related('user').get(pk=thread_id)
        except SupportThread.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_thread(thread, include_messages=True))


class OpsSupportReplyView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request, thread_id: int):
        try:
            thread = SupportThread.objects.select_related('user').get(pk=thread_id)
        except SupportThread.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        body = (request.data.get('body') or '').strip()
        if not body:
            return Response({'detail': 'body is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(body) > 4000:
            return Response({'detail': 'body too long.'}, status=status.HTTP_400_BAD_REQUEST)

        close = str(request.data.get('close') or '').lower() in {'1', 'true', 'yes'}

        SupportMessage.objects.create(
            thread=thread,
            sender=SupportMessage.SENDER_STAFF,
            author=request.user,
            body=body,
        )
        if close:
            thread.status = SupportThread.STATUS_CLOSED
            thread.closed_at = timezone.now()
        else:
            thread.status = SupportThread.STATUS_WAITING_USER
            thread.closed_at = None
        thread.save(update_fields=['status', 'closed_at', 'updated_at'])

        log_ops_action(
            actor=request.user,
            action='support.reply',
            target_type='support_thread',
            target_id=thread.id,
            meta={'close': close, 'user_id': thread.user_id},
            request=request,
        )
        try:
            _notify_user_staff_reply(thread, body)
        except Exception:
            pass

        return Response(_serialize_thread(thread, include_messages=True))


class OpsSupportStatusView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request, thread_id: int):
        try:
            thread = SupportThread.objects.select_related('user').get(pk=thread_id)
        except SupportThread.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_status = (request.data.get('status') or '').strip()
        if new_status not in dict(SupportThread.STATUS_CHOICES):
            return Response({'detail': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)

        thread.status = new_status
        if new_status == SupportThread.STATUS_CLOSED:
            thread.closed_at = timezone.now()
        else:
            thread.closed_at = None
        thread.save(update_fields=['status', 'closed_at', 'updated_at'])

        log_ops_action(
            actor=request.user,
            action='support.status',
            target_type='support_thread',
            target_id=thread.id,
            meta={'status': new_status},
            request=request,
        )
        return Response(_serialize_thread(thread, include_messages=True))
