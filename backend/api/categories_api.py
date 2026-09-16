"""User-defined income/expense categories."""

from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated

from .models import UserCategory


class UserCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserCategory
        fields = ('id', 'kind', 'name', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_kind(self, value):
        kind = (value or '').strip().lower()
        if kind not in ('expense', 'income'):
            raise serializers.ValidationError('Kind must be expense or income.')
        return kind

    def validate_name(self, value):
        name = ' '.join((value or '').split())
        if len(name) < 2:
            raise serializers.ValidationError('Enter a category name.')
        if len(name) > 80:
            raise serializers.ValidationError('Name is too long.')
        return name

    def validate(self, attrs):
        request = self.context['request']
        kind = attrs.get('kind') or getattr(self.instance, 'kind', '')
        name = attrs.get('name') or getattr(self.instance, 'name', '')
        qs = UserCategory.objects.filter(user=request.user, kind=kind, name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({'name': 'You already have this category.'})
        return attrs


class UserCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = UserCategorySerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = UserCategory.objects.filter(user=self.request.user)
        kind = (self.request.query_params.get('kind') or '').strip().lower()
        if kind in ('expense', 'income'):
            qs = qs.filter(kind=kind)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
