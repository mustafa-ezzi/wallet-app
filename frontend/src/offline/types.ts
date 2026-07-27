/** Offline L0+L1 types — mirror + outbox (see REACT_NATIVE_PLAYSTORE_RESEARCH.md §6). */

export type SyncStatus = 'synced' | 'pending' | 'failed'

export interface OfflineAccount {
  localId: string
  serverId: number
  name: string
  type: string
  openingBalance: number
  currentBalance: number
  updatedAt: string
}

export interface OfflineTransaction {
  localId: string
  serverId: number | null
  syncStatus: SyncStatus
  type: 'income' | 'expense'
  amount: number
  date: string
  accountServerId: number
  category: string
  notes: string
  createdAt: string
  clientMutationId: string
  lastError?: string
}

export interface OutboxItem {
  id: string
  entity: 'transaction'
  localId: string
  payload: {
    type: 'income' | 'expense'
    amount: number
    date: string
    account: number
    category: string
    notes: string
    client_mutation_id: string
  }
  attempts: number
  lastError?: string
  createdAt: string
}

export interface OfflineStore {
  getMeta(key: string): Promise<string | null>
  setMeta(key: string, value: string): Promise<void>
  clearAll(): Promise<void>

  upsertAccounts(accounts: OfflineAccount[]): Promise<void>
  listAccounts(): Promise<OfflineAccount[]>
  getAccountByServerId(serverId: number): Promise<OfflineAccount | undefined>
  updateAccountBalance(serverId: number, currentBalance: number): Promise<void>

  upsertTransactions(txs: OfflineTransaction[]): Promise<void>
  listTransactions(): Promise<OfflineTransaction[]>
  getTransaction(localId: string): Promise<OfflineTransaction | undefined>
  listPendingTransactions(): Promise<OfflineTransaction[]>
  clearSyncedTransactions(): Promise<void>
  markTransactionSynced(localId: string, serverId: number): Promise<void>
  markTransactionFailed(localId: string, error: string): Promise<void>

  addOutbox(item: OutboxItem): Promise<void>
  listOutbox(): Promise<OutboxItem[]>
  removeOutbox(id: string): Promise<void>
  bumpOutboxAttempt(id: string, error: string): Promise<void>
}

export function accountLocalId(serverId: number): string {
  return `acc-${serverId}`
}
