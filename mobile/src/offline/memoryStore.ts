import type {
  OfflineAccount,
  OfflineStore,
  OfflineTransaction,
  OutboxItem,
  SyncStatus,
} from './types'

type Mem = {
  meta: Map<string, string>
  accounts: Map<string, OfflineAccount>
  transactions: Map<string, OfflineTransaction>
  outbox: Map<string, OutboxItem>
}

/** In-memory fallback (web / tests) when SQLite is unavailable. */
export function createMemoryStore(): OfflineStore {
  const state: Mem = {
    meta: new Map(),
    accounts: new Map(),
    transactions: new Map(),
    outbox: new Map(),
  }

  return {
    async getMeta(key) {
      return state.meta.get(key) ?? null
    },
    async setMeta(key, value) {
      state.meta.set(key, value)
    },
    async clearAll() {
      state.meta.clear()
      state.accounts.clear()
      state.transactions.clear()
      state.outbox.clear()
    },
    async upsertAccounts(accounts) {
      for (const a of accounts) state.accounts.set(a.localId, a)
    },
    async listAccounts() {
      return [...state.accounts.values()].sort((a, b) => a.name.localeCompare(b.name))
    },
    async getAccountByServerId(serverId) {
      return [...state.accounts.values()].find((a) => a.serverId === serverId)
    },
    async updateAccountBalance(serverId, currentBalance) {
      const a = await this.getAccountByServerId(serverId)
      if (!a) return
      state.accounts.set(a.localId, { ...a, currentBalance, updatedAt: new Date().toISOString() })
    },
    async upsertTransactions(txs) {
      for (const t of txs) state.transactions.set(t.localId, t)
    },
    async listTransactions() {
      return [...state.transactions.values()].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date)
        return b.createdAt.localeCompare(a.createdAt)
      })
    },
    async getTransaction(localId) {
      return state.transactions.get(localId)
    },
    async listPendingTransactions() {
      return (await this.listTransactions()).filter(
        (t) => t.syncStatus === 'pending' || t.syncStatus === 'failed',
      )
    },
    async clearSyncedTransactions() {
      for (const [id, t] of state.transactions) {
        if (t.syncStatus === 'synced') state.transactions.delete(id)
      }
    },
    async markTransactionSynced(localId, serverId) {
      const t = state.transactions.get(localId)
      if (!t) return
      state.transactions.set(localId, { ...t, serverId, syncStatus: 'synced', lastError: undefined })
    },
    async markTransactionFailed(localId, error) {
      const t = state.transactions.get(localId)
      if (!t) return
      state.transactions.set(localId, { ...t, syncStatus: 'failed' as SyncStatus, lastError: error })
    },
    async addOutbox(item) {
      state.outbox.set(item.id, item)
    },
    async listOutbox() {
      return [...state.outbox.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async removeOutbox(id) {
      state.outbox.delete(id)
    },
    async bumpOutboxAttempt(id, error) {
      const item = state.outbox.get(id)
      if (!item) return
      state.outbox.set(id, { ...item, attempts: item.attempts + 1, lastError: error })
    },
  }
}
