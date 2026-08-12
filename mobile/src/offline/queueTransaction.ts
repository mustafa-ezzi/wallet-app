import type { OfflineStore, OfflineTransaction, OutboxItem } from './types'
import { newId } from './uuid'

export interface QueueTxInput {
  type: 'income' | 'expense'
  amount: number
  date: string
  accountServerId: number
  category?: string
  notes?: string
  /** Household shared writes stay online-only in P4. */
  householdLedger?: number | null
  /** Travel Mode snapshot (amount is already PKR). */
  originalAmount?: number | null
  originalCurrency?: string | null
  fxRate?: number | null
  fxSource?: string | null
}

export interface QueueTxResult {
  transaction: OfflineTransaction
  outboxId: string
  queuedOffline: boolean
}

/** L1: write local tx + outbox + optimistic balance. Never calls the network. */
export async function queuePersonalTransaction(
  store: OfflineStore,
  input: QueueTxInput,
  opts?: { online?: boolean },
): Promise<QueueTxResult> {
  if (input.householdLedger != null) {
    throw new Error('Household expenses need internet. Connect and try again.')
  }

  const account = await store.getAccountByServerId(input.accountServerId)
  if (!account) {
    throw new Error('Wallet not available offline. Connect once to download your wallets.')
  }
  if (!(input.amount > 0)) {
    throw new Error('Please enter a valid amount.')
  }

  const localId = newId()
  const clientMutationId = newId()
  const createdAt = new Date().toISOString()
  const delta = input.type === 'income' ? input.amount : -input.amount

  const transaction: OfflineTransaction = {
    localId,
    serverId: null,
    syncStatus: 'pending',
    type: input.type,
    amount: input.amount,
    date: input.date,
    accountServerId: input.accountServerId,
    category: input.category || '',
    notes: input.notes || '',
    createdAt,
    clientMutationId,
    originalAmount: input.originalAmount ?? null,
    originalCurrency: input.originalCurrency ?? null,
    fxRate: input.fxRate ?? null,
    fxSource: input.fxSource ?? null,
  }

  const outbox: OutboxItem = {
    id: newId(),
    entity: 'transaction',
    localId,
    payload: {
      type: input.type,
      amount: input.amount,
      date: input.date,
      account: input.accountServerId,
      category: input.category || '',
      notes: input.notes || '',
      client_mutation_id: clientMutationId,
      ...(input.originalAmount != null && input.originalCurrency && input.fxRate != null
        ? {
            original_amount: input.originalAmount,
            original_currency: input.originalCurrency,
            fx_rate: input.fxRate,
            fx_source: input.fxSource || 'offline',
          }
        : {}),
    },
    attempts: 0,
    createdAt,
  }

  await store.upsertTransactions([transaction])
  await store.addOutbox(outbox)
  await store.updateAccountBalance(input.accountServerId, account.currentBalance + delta)

  return {
    transaction,
    outboxId: outbox.id,
    queuedOffline: opts?.online === false,
  }
}
