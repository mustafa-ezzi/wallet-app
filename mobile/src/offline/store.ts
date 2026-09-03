import type { OfflineStore } from './types'
import { createMemoryStore } from './memoryStore'
import { createSqliteStore } from './sqliteStore'

let storePromise: Promise<OfflineStore> | null = null
let testOverride: OfflineStore | null = null

async function createDefaultStore(): Promise<OfflineStore> {
  try {
    return await createSqliteStore()
  } catch (err) {
    console.warn('[WalletTrails] SQLite unavailable, using memory store', err)
    return createMemoryStore()
  }
}

export function getOfflineStore(): Promise<OfflineStore> {
  if (testOverride) return Promise.resolve(testOverride)
  if (!storePromise) {
    storePromise = createDefaultStore()
  }
  return storePromise
}

export function __setOfflineStoreForTests(store: OfflineStore | null) {
  testOverride = store
  storePromise = null
}

export function __resetOfflineStore() {
  storePromise = null
}
