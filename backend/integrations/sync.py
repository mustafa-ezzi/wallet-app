"""Run one provider sync and record a SyncRun. Tokens stay inside the adapter."""

from __future__ import annotations

from django.utils import timezone

from .adapters import get_adapter
from .models import IntegrationAccount, SyncRun


def _safe_error(exc: Exception) -> str:
    text = str(exc)
    if 'PRIVATE KEY' in text or 'private_key' in text:
        return 'Sync failed.'
    return text[:500]


def run_sync(account: IntegrationAccount) -> SyncRun:
    adapter = get_adapter(account.provider)
    run = SyncRun.objects.create(provider=account.provider, account=account)
    try:
        if account.status == IntegrationAccount.STATUS_NOT_SETUP or adapter is None or not adapter.configured():
            run.error = 'Not set up'
            account.status = IntegrationAccount.STATUS_NOT_SETUP
            account.last_error = 'Not set up'
        else:
            result = adapter.sync(account)
            run.rows_written = result.rows_written
            run.error = (result.error or '')[:500]
            run.ok = not run.error
            account.last_sync_at = timezone.now()
            if run.ok:
                account.status = IntegrationAccount.STATUS_CONNECTED
                account.last_error = ''
            else:
                account.status = IntegrationAccount.STATUS_ERROR
                account.last_error = run.error
    except Exception as exc:  # noqa: BLE001 — recorded, not raised into the cron response
        run.ok = False
        run.error = _safe_error(exc)
        account.last_error = run.error
        account.status = IntegrationAccount.STATUS_ERROR
    run.finished_at = timezone.now()
    run.save(update_fields=['finished_at', 'rows_written', 'ok', 'error'])
    account.save(update_fields=['status', 'last_error', 'last_sync_at'])
    return run


def run_all_syncs() -> list[SyncRun]:
    from .ga4 import ensure_ga4_account

    ensure_ga4_account()
    runs = []
    for account in IntegrationAccount.objects.order_by('id'):
        runs.append(run_sync(account))
    return runs
