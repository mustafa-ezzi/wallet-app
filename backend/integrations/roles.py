"""Ops roles. Enforced on the API, not only hidden in the panel."""

from __future__ import annotations

from .models import StaffRole

ROLE_OWNER = StaffRole.ROLE_OWNER
ROLE_ADMIN = StaffRole.ROLE_ADMIN
ROLE_SUPPORT = StaffRole.ROLE_SUPPORT
ROLE_MARKETING = StaffRole.ROLE_MARKETING
ROLE_VIEWER = StaffRole.ROLE_VIEWER

CAPABILITIES = (
    'dashboard.read',
    'analytics.read',
    'growth.read',
    'users.read',
    'users.write',
    'users.delete',
    'users.export',
    'premium.read',
    'premium.write',
    'promos.read',
    'promos.write',
    'campaigns.read',
    'campaigns.write',
    'support.read',
    'support.write',
    'config.read',
    'config.write',
    'audit.read',
    'integrations.read',
    'integrations.write',
    'team.read',
    'team.write',
)

_ALL = frozenset(CAPABILITIES)
_ADMIN = _ALL - frozenset({'team.read', 'team.write'})
_SUPPORT = frozenset({
    'dashboard.read',
    'analytics.read',
    'users.read',
    'support.read',
    'support.write',
    'audit.read',
})
_MARKETING = frozenset({
    'dashboard.read',
    'analytics.read',
    'growth.read',
    'promos.read',
    'promos.write',
    'campaigns.read',
    'campaigns.write',
})
_VIEWER = frozenset({'dashboard.read', 'analytics.read', 'growth.read'})

ROLE_CAPABILITIES = {
    ROLE_OWNER: _ALL,
    ROLE_ADMIN: _ADMIN,
    ROLE_SUPPORT: _SUPPORT,
    ROLE_MARKETING: _MARKETING,
    ROLE_VIEWER: _VIEWER,
}


def role_for(user) -> str:
    """
    Explicit StaffRole wins.
    Until the first role is saved, every staff user is an owner so the current
    panel is not locked out. After that, a superuser with no row stays owner
    and any other staff user with no row is an admin.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return ''
    try:
        return user.ops_staff_role.role
    except StaffRole.DoesNotExist:
        pass
    if user.is_superuser or not StaffRole.objects.filter(role=ROLE_OWNER).exists():
        return ROLE_OWNER
    return ROLE_ADMIN


def capabilities_for(user) -> frozenset:
    return ROLE_CAPABILITIES.get(role_for(user), frozenset())


def role_allows(user, capability: str) -> bool:
    return capability in capabilities_for(user)
