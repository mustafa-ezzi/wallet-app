from django.urls import path

from .views import TraiConfirmView, TraiMessageView

urlpatterns = [
    path('message/', TraiMessageView.as_view(), name='trai-message'),
    path('confirm/', TraiConfirmView.as_view(), name='trai-confirm'),
]
