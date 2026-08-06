"""Remote ads / feature config — public read, ops write (Phase 4)."""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AppRemoteConfig
from .ops_audit import log_ops_action
from .ops_permissions import IsOpsStaff
from .entitlements import user_is_premium


# Google sample units — safe defaults until Ops sets production IDs.
_TEST_BANNER = 'ca-app-pub-3940256099942544/6300978111'
_TEST_INTERSTITIAL = 'ca-app-pub-3940256099942544/1033173712'
_TEST_REWARDED = 'ca-app-pub-3940256099942544/5224354917'


def serialize_remote_config(cfg: AppRemoteConfig, *, for_user=None) -> dict:
    premium = bool(for_user and for_user.is_authenticated and user_is_premium(for_user))
    ads_master = bool(cfg.ads_enabled)
    hide = bool(cfg.premium_hides_ads and premium)
    effective_ads = ads_master and not hide

    return {
        'ads': {
            'ads_enabled': ads_master,
            'banner_enabled': bool(cfg.banner_enabled) and effective_ads,
            'interstitial_enabled': bool(cfg.interstitial_enabled) and effective_ads,
            'rewarded_enabled': bool(cfg.rewarded_enabled) and effective_ads,
            'premium_hides_ads': bool(cfg.premium_hides_ads),
            'effective_show_ads': effective_ads,
            'units': {
                'android_banner': cfg.android_banner_unit or _TEST_BANNER,
                'android_interstitial': cfg.android_interstitial_unit or _TEST_INTERSTITIAL,
                'android_rewarded': cfg.android_rewarded_unit or _TEST_REWARDED,
            },
            'rules': {
                'show_after_sessions': cfg.show_after_sessions,
                'interstitial_min_interval_sec': cfg.interstitial_min_interval_sec,
                'countries': cfg.countries if isinstance(cfg.countries, list) else [],
            },
            'test_device_ids': cfg.test_device_ids if isinstance(cfg.test_device_ids, list) else [],
        },
        'feature_flags': cfg.feature_flags if isinstance(cfg.feature_flags, dict) else {},
        'min_supported_version': cfg.min_supported_version or '',
        'store_url': cfg.store_url or '',
        'maintenance_message': cfg.maintenance_message or '',
        'viewer': {
            'is_premium': premium,
        },
        'updated_at': cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


def serialize_ops_config(cfg: AppRemoteConfig) -> dict:
    data = serialize_remote_config(cfg)
    data['raw'] = {
        'ads_enabled': cfg.ads_enabled,
        'banner_enabled': cfg.banner_enabled,
        'interstitial_enabled': cfg.interstitial_enabled,
        'rewarded_enabled': cfg.rewarded_enabled,
        'premium_hides_ads': cfg.premium_hides_ads,
        'android_banner_unit': cfg.android_banner_unit,
        'android_interstitial_unit': cfg.android_interstitial_unit,
        'android_rewarded_unit': cfg.android_rewarded_unit,
        'show_after_sessions': cfg.show_after_sessions,
        'interstitial_min_interval_sec': cfg.interstitial_min_interval_sec,
        'countries': cfg.countries if isinstance(cfg.countries, list) else [],
        'test_device_ids': cfg.test_device_ids if isinstance(cfg.test_device_ids, list) else [],
        'feature_flags': cfg.feature_flags if isinstance(cfg.feature_flags, dict) else {},
        'min_supported_version': cfg.min_supported_version or '',
        'store_url': cfg.store_url or '',
        'maintenance_message': cfg.maintenance_message or '',
        'updated_by_id': cfg.updated_by_id,
        'updated_by_username': getattr(cfg.updated_by, 'username', None) if cfg.updated_by_id else None,
    }
    return data


class AppConfigView(APIView):
    """App bootstrap config. Auth optional — premium gate applied when logged in."""

    permission_classes = [AllowAny]

    def get(self, request):
        cfg = AppRemoteConfig.get_solo()
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        return Response(serialize_remote_config(cfg, for_user=user))


class OpsConfigView(APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        return Response(serialize_ops_config(AppRemoteConfig.get_solo()))

    def patch(self, request):
        cfg = AppRemoteConfig.get_solo()
        data = request.data if isinstance(request.data, dict) else {}

        bool_fields = (
            'ads_enabled',
            'banner_enabled',
            'interstitial_enabled',
            'rewarded_enabled',
            'premium_hides_ads',
        )
        str_fields = (
            'android_banner_unit',
            'android_interstitial_unit',
            'android_rewarded_unit',
            'min_supported_version',
            'store_url',
            'maintenance_message',
        )
        changed = []

        for field in bool_fields:
            if field in data:
                setattr(cfg, field, bool(data[field]))
                changed.append(field)

        for field in str_fields:
            if field in data:
                setattr(cfg, field, str(data[field] or '').strip()[:512 if field == 'store_url' else 255])
                changed.append(field)

        if 'show_after_sessions' in data:
            try:
                cfg.show_after_sessions = max(0, int(data['show_after_sessions']))
                changed.append('show_after_sessions')
            except (TypeError, ValueError):
                return Response({'detail': 'show_after_sessions must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

        if 'interstitial_min_interval_sec' in data:
            try:
                cfg.interstitial_min_interval_sec = max(0, int(data['interstitial_min_interval_sec']))
                changed.append('interstitial_min_interval_sec')
            except (TypeError, ValueError):
                return Response(
                    {'detail': 'interstitial_min_interval_sec must be an integer.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if 'countries' in data:
            countries = data['countries']
            if isinstance(countries, str):
                countries = [c.strip().upper() for c in countries.split(',') if c.strip()]
            if not isinstance(countries, list):
                return Response({'detail': 'countries must be a list or comma-separated string.'}, status=status.HTTP_400_BAD_REQUEST)
            cfg.countries = [str(c).strip().upper()[:8] for c in countries if str(c).strip()]
            changed.append('countries')

        if 'test_device_ids' in data:
            ids = data['test_device_ids']
            if isinstance(ids, str):
                ids = [x.strip() for x in ids.split(',') if x.strip()]
            if not isinstance(ids, list):
                return Response({'detail': 'test_device_ids must be a list or comma-separated string.'}, status=status.HTTP_400_BAD_REQUEST)
            cfg.test_device_ids = [str(x).strip()[:128] for x in ids if str(x).strip()]
            changed.append('test_device_ids')

        if 'feature_flags' in data:
            flags = data['feature_flags']
            if not isinstance(flags, dict):
                return Response({'detail': 'feature_flags must be an object.'}, status=status.HTTP_400_BAD_REQUEST)
            cfg.feature_flags = flags
            changed.append('feature_flags')

        if not changed:
            return Response({'detail': 'No recognized fields to update.'}, status=status.HTTP_400_BAD_REQUEST)

        cfg.updated_by = request.user
        cfg.save()
        log_ops_action(
            actor=request.user,
            action='config.update',
            target_type='app_remote_config',
            target_id=cfg.key,
            meta={'changed': changed, 'ads_enabled': cfg.ads_enabled},
            request=request,
        )
        return Response(serialize_ops_config(cfg))
