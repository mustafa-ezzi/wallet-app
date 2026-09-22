import type { OfflineStore } from './types'
import { createMemoryStore } from './memoryStore'

/**
 * Default / web implementation — no expo-sqlite import (avoids wa-sqlite.wasm Metro error).
 * Native overrides this via `sqliteStore.native.ts`.
 */
export async function createSqliteStore(): Promise<OfflineStore> {
  return createMemoryStore()
}

export function closeSqliteStore() {
  /* web / tests: nothing to close */
}

export function isNativeSqliteError(_err: unknown): boolean {
  return false
}
