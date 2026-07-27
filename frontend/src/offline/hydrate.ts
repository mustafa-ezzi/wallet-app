import { asList } from '../api/client'
import { accountLocalId, type OfflineAccount, type OfflineStore, type OfflineTransaction } from './types'

export function mapServerAccount(raw: {
  id: number
  name: string
  type: string
  opening_balance: number | string
  current_balance: number | string
}): OfflineAccount {
  return {
    localId: accountLocalId(raw.id),
    serverId: raw.id,
    name: raw.name,
    type: raw.type,
    openingBalance: Number(raw.opening_balance) || 0,
    currentBalance: Number(raw.current_balance) || 0,
    updatedAt: new Date().toISOString(),
  }
}

export function mapServerTransaction(raw: {
  id: number
  type: string
  amount: number | string
  date: string
  account: number
  category?: string
  notes?: string
  created_at?: string
  client_mutation_id?: string | null
}): OfflineTransaction {
  return {
    localId: `srv-${raw.id}`,
    serverId: raw.id,
    syncStatus: 'synced',
    type: raw.type === 'income' ? 'income' : 'expense',
    amount: Number(raw.amount) || 0,
    date: raw.date,
    accountServerId: raw.account,
    category: raw.category || '',
    notes: raw.notes || '',
    createdAt: raw.created_at || new Date().toISOString(),
    clientMutationId: raw.client_mutation_id || `srv-${raw.id}`,
  }
}

/** Replace synced mirror; keep local pending/failed rows. */
export async function hydrateFromServer(
  store: OfflineStore,
  accountsRaw: unknown,
  transactionsRaw: unknown,
  userId: number | string,
): Promise<void> {
  const accounts = asList<{
    id: number
    name: string
    type: string
    opening_balance: number | string
    current_balance: number | string
  }>(accountsRaw).map(mapServerAccount)

  const serverTxs = asList<{
    id: number
    type: string
    amount: number | string
    date: string
    account: number
    category?: string
    notes?: string
    created_at?: string
    client_mutation_id?: string | null
  }>(transactionsRaw).map(mapServerTransaction)

  const pending = await store.listPendingTransactions()
  const pendingMutations = new Set(pending.map(t => t.clientMutationId))
  const serverFiltered = serverTxs.filter(t => !pendingMutations.has(t.clientMutationId))

  await store.upsertAccounts(accounts)
  await store.clearSyncedTransactions()
  await store.upsertTransactions([...serverFiltered, ...pending])
  await store.setMeta('user_id', String(userId))
  await store.setMeta('last_synced_at', new Date().toISOString())
}
