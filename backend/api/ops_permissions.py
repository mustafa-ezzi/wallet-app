"""Permissions for WalletTrails Ops APIs — staff plus a role."""

from rest_framework.permissions import BasePermission

from integrations.roles import role_allows


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


def ops(capability):
    """
    Staff check plus a capability.
    Pass a string for every method, or a dict of HTTP method → capability.
    """

    class OpsCapability(IsOpsStaff):
        message = 'Your role cannot do that.'

        def has_permission(self, request, view):
            if not IsOpsStaff.has_permission(self, request, view):
                self.message = IsOpsStaff.message
                return False
            needed = capability
            if isinstance(capability, dict):
                needed = capability.get(request.method)
            if not needed or not role_allows(request.user, needed):
                self.message = 'Your role cannot do that.'
                return False
            return True

    OpsCapability.__name__ = 'OpsCapability'
    return OpsCapability
