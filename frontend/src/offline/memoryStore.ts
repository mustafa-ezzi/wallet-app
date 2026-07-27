import type {
  OfflineAccount,
  OfflineStore,
  OfflineTransaction,
  OutboxItem,
} from './types'

/** In-memory store for unit tests and SSR-safe fallbacks. */
export function createMemoryStore(): OfflineStore {
  const meta = new Map<string, string>()
  const accounts = new Map<string, OfflineAccount>()
  const transactions = new Map<string, OfflineTransaction>()
  const outbox = new Map<string, OutboxItem>()

  return {
    async getMeta(key) {
      return meta.get(key) ?? null
    },
    async setMeta(key, value) {
      meta.set(key, value)
    },
    async clearAll() {
      meta.clear()
      accounts.clear()
      transactions.clear()
      outbox.clear()
    },
    async upsertAccounts(rows) {
      for (const a of rows) accounts.set(a.localId, a)
    },
    async listAccounts() {
      return [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name))
    },
    async getAccountByServerId(serverId) {
      return [...accounts.values()].find(a => a.serverId === serverId)
    },
    async updateAccountBalance(serverId, currentBalance) {
      const a = [...accounts.values()].find(x => x.serverId === serverId)
      if (a) accounts.set(a.localId, { ...a, currentBalance, updatedAt: new Date().toISOString() })
    },
    async upsertTransactions(txs) {
      for (const t of txs) transactions.set(t.localId, t)
    },
    async listTransactions() {
      return [...transactions.values()].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date)
        return b.createdAt.localeCompare(a.createdAt)
      })
    },
    async getTransaction(localId) {
      return transactions.get(localId)
    },
    async listPendingTransactions() {
      return [...transactions.values()].filter(t => t.syncStatus === 'pending' || t.syncStatus === 'failed')
    },
    async clearSyncedTransactions() {
      for (const [id, t] of [...transactions.entries()]) {
        if (t.syncStatus === 'synced') transactions.delete(id)
      }
    },
    async markTransactionSynced(localId, serverId) {
      const t = transactions.get(localId)
      if (!t) return
      transactions.set(localId, { ...t, serverId, syncStatus: 'synced', lastError: undefined })
    },
    async markTransactionFailed(localId, error) {
      const t = transactions.get(localId)
      if (!t) return
      transactions.set(localId, { ...t, syncStatus: 'failed', lastError: error })
    },
    async addOutbox(item) {
      outbox.set(item.id, item)
    },
    async listOutbox() {
      return [...outbox.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async removeOutbox(id) {
      outbox.delete(id)
    },
    async bumpOutboxAttempt(id, error) {
      const item = outbox.get(id)
      if (!item) return
      outbox.set(id, { ...item, attempts: item.attempts + 1, lastError: error })
    },
  }
}
