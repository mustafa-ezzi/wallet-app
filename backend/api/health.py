"""Lightweight health checks for Railway wake / mobile probes."""

from django.http import JsonResponse
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


def health_view(_request):
    """Django view — no DRF auth stack; used by Railway and app wake pings."""
    return JsonResponse({'ok': True, 'service': 'cashtrail', 'ts': timezone.now().isoformat()})


class ApiHealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({'ok': True, 'service': 'cashtrail', 'ts': timezone.now().isoformat()})
