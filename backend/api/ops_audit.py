"""Helpers to write AdminAuditLog rows from Ops views."""

from .models import AdminAuditLog


def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def log_ops_action(*, actor, action, target_type='', target_id='', meta=None, request=None):
    return AdminAuditLog.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        action=action,
        target_type=target_type or '',
        target_id=str(target_id) if target_id not in (None, '') else '',
        meta=meta or {},
        ip_address=client_ip(request) if request is not None else None,
    )
