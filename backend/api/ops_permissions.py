"""Permissions for WalletTrails Ops APIs — staff only, never for end users."""

from rest_framework.permissions import BasePermission


class IsOpsStaff(BasePermission):
    """
    Allow only authenticated staff (is_staff=True).
    Superusers are included. Suspended / inactive accounts are rejected via is_active.
    """

    message = 'Ops access requires a staff account.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_staff
        )
