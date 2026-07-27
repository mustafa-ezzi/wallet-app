import type { OfflineStore } from './types'

export type PostTransaction = (payload: Record<string, unknown>) => Promise<{ id: number }>

export interface SyncResult {
  pushed: number
  failed: number
  errors: string[]
}

function errorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Sync failed'
  const ax = err as { response?: { data?: unknown; status?: number }; message?: string }
  const data = ax.response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (typeof d.detail === 'string') return d.detail
    if (typeof d.account === 'string') return d.account
    if (Array.isArray(d.account)) return d.account.join(' ')
    if (typeof d.non_field_errors === 'object' && Array.isArray(d.non_field_errors)) {
      return d.non_field_errors.join(' ')
    }
  }
  if (ax.response?.status === 404) return 'Account missing on server'
  return ax.message || 'Sync failed'
}

function isValidationError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429
}

/** Push outbox → API. Idempotent via client_mutation_id. */
export async function syncOutbox(
  store: OfflineStore,
  postTransaction: PostTransaction,
): Promise<SyncResult> {
  const items = await store.listOutbox()
  let pushed = 0
  let failed = 0
  const errors: string[] = []

  for (const item of items) {
    if (item.entity !== 'transaction') continue
    try {
      const res = await postTransaction(item.payload as unknown as Record<string, unknown>)
      await store.markTransactionSynced(item.localId, res.id)
      await store.removeOutbox(item.id)
      pushed += 1
    } catch (err) {
      const msg = errorMessage(err)
      await store.bumpOutboxAttempt(item.id, msg)
      if (isValidationError(err)) {
        await store.markTransactionFailed(item.localId, msg)
        await store.removeOutbox(item.id)
        failed += 1
        errors.push(msg)
      } else {
        // leave pending for retry
        failed += 1
        errors.push(msg)
      }
    }
  }

  if (pushed > 0) {
    await store.setMeta('last_synced_at', new Date().toISOString())
  }

  return { pushed, failed, errors }
}

export async function pendingCount(store: OfflineStore): Promise<number> {
  return (await store.listOutbox()).length
}
