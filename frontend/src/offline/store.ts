import { createIdbStore } from './idbStore'
import { createMemoryStore } from './memoryStore'
import type { OfflineStore } from './types'

let singleton: OfflineStore | null = null
let forced: OfflineStore | null = null

export function getOfflineStore(): OfflineStore {
  if (forced) return forced
  if (singleton) return singleton
  if (typeof indexedDB === 'undefined') {
    singleton = createMemoryStore()
  } else {
    singleton = createIdbStore()
  }
  return singleton
}

/** Test helper — inject a memory store. */
export function __setOfflineStoreForTests(store: OfflineStore | null) {
  forced = store
  if (store === null) singleton = null
}
