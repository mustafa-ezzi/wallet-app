import type { OfflineStore, OfflineTransaction, OutboxItem } from './types'
import { newId } from './uuid'

export interface QueueTxInput {
  type: 'income' | 'expense'
  amount: number
  date: string
  accountServerId: number
  category?: string
  notes?: string
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
