import type {
  OfflineAccount,
  OfflineStore,
  OfflineTransaction,
  OutboxItem,
} from './types'

const DB_NAME = 'wallettrails-offline'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'localId' })
      if (!db.objectStoreNames.contains('transactions')) db.createObjectStore('transactions', { keyPath: 'localId' })
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB tx aborted'))
  })
}

export function createIdbStore(): OfflineStore {
  let dbPromise: Promise<IDBDatabase> | null = null
  const db = () => {
    if (!dbPromise) dbPromise = openDb()
    return dbPromise
  }

  return {
    async getMeta(key) {
      const database = await db()
      const tx = database.transaction('meta', 'readonly')
      const value = await reqToPromise(tx.objectStore('meta').get(key))
      return (value as string | undefined) ?? null
    },
    async setMeta(key, value) {
      const database = await db()
      const tx = database.transaction('meta', 'readwrite')
      tx.objectStore('meta').put(value, key)
      await txDone(tx)
    },
    async clearAll() {
      const database = await db()
      const tx = database.transaction(['meta', 'accounts', 'transactions', 'outbox'], 'readwrite')
      tx.objectStore('meta').clear()
      tx.objectStore('accounts').clear()
      tx.objectStore('transactions').clear()
      tx.objectStore('outbox').clear()
      await txDone(tx)
    },
    async upsertAccounts(accounts) {
      const database = await db()
      const tx = database.transaction('accounts', 'readwrite')
      const store = tx.objectStore('accounts')
      for (const a of accounts) store.put(a)
      await txDone(tx)
    },
    async listAccounts() {
      const database = await db()
      const tx = database.transaction('accounts', 'readonly')
      const rows = await reqToPromise(tx.objectStore('accounts').getAll()) as OfflineAccount[]
      return rows.sort((a, b) => a.name.localeCompare(b.name))
    },
    async getAccountByServerId(serverId) {
      const rows = await this.listAccounts()
      return rows.find(a => a.serverId === serverId)
    },
    async updateAccountBalance(serverId, currentBalance) {
      const a = await this.getAccountByServerId(serverId)
      if (!a) return
      await this.upsertAccounts([{ ...a, currentBalance, updatedAt: new Date().toISOString() }])
    },
    async upsertTransactions(txs) {
      const database = await db()
      const tx = database.transaction('transactions', 'readwrite')
      const store = tx.objectStore('transactions')
      for (const t of txs) store.put(t)
      await txDone(tx)
    },
    async listTransactions() {
      const database = await db()
      const tx = database.transaction('transactions', 'readonly')
      const rows = await reqToPromise(tx.objectStore('transactions').getAll()) as OfflineTransaction[]
      return rows.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date)
        return b.createdAt.localeCompare(a.createdAt)
      })
    },
    async getTransaction(localId) {
      const database = await db()
      const tx = database.transaction('transactions', 'readonly')
      return (await reqToPromise(tx.objectStore('transactions').get(localId))) as OfflineTransaction | undefined
    },
    async listPendingTransactions() {
      const rows = await this.listTransactions()
      return rows.filter(t => t.syncStatus === 'pending' || t.syncStatus === 'failed')
    },
    async clearSyncedTransactions() {
      const rows = await this.listTransactions()
      const database = await db()
      const tx = database.transaction('transactions', 'readwrite')
      const store = tx.objectStore('transactions')
      for (const t of rows) {
        if (t.syncStatus === 'synced') store.delete(t.localId)
      }
      await txDone(tx)
    },
    async markTransactionSynced(localId, serverId) {
      const t = await this.getTransaction(localId)
      if (!t) return
      await this.upsertTransactions([{ ...t, serverId, syncStatus: 'synced', lastError: undefined }])
    },
    async markTransactionFailed(localId, error) {
      const t = await this.getTransaction(localId)
      if (!t) return
      await this.upsertTransactions([{ ...t, syncStatus: 'failed', lastError: error }])
    },
    async addOutbox(item) {
      const database = await db()
      const tx = database.transaction('outbox', 'readwrite')
      tx.objectStore('outbox').put(item)
      await txDone(tx)
    },
    async listOutbox() {
      const database = await db()
      const tx = database.transaction('outbox', 'readonly')
      const rows = await reqToPromise(tx.objectStore('outbox').getAll()) as OutboxItem[]
      return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async removeOutbox(id) {
      const database = await db()
      const tx = database.transaction('outbox', 'readwrite')
      tx.objectStore('outbox').delete(id)
      await txDone(tx)
    },
    async bumpOutboxAttempt(id, error) {
      const database = await db()
      const tx = database.transaction('outbox', 'readwrite')
      const store = tx.objectStore('outbox')
      const item = (await reqToPromise(store.get(id))) as OutboxItem | undefined
      if (item) {
        store.put({ ...item, attempts: item.attempts + 1, lastError: error })
      }
      await txDone(tx)
    },
  }
}
