import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryStore } from './memoryStore'
import { queuePersonalTransaction } from './queueTransaction'
import { syncOutbox, pendingCount } from './syncEngine'
import { hydrateFromServer } from './hydrate'
import { accountLocalId } from './types'

describe('offline L0+L1', () => {
  const store = createMemoryStore()

  beforeEach(async () => {
    await store.clearAll()
    await store.upsertAccounts([{
      localId: accountLocalId(1),
      serverId: 1,
      name: 'Meezan',
      type: 'bank',
      openingBalance: 10000,
      currentBalance: 10000,
      updatedAt: new Date().toISOString(),
    }])
  })

  it('queues a personal expense and updates local balance', async () => {
    const result = await queuePersonalTransaction(store, {
      type: 'expense',
      amount: 500,
      date: '2026-07-20',
      accountServerId: 1,
      category: 'Food',
    }, { online: false })

    expect(result.queuedOffline).toBe(true)
    expect(result.transaction.syncStatus).toBe('pending')
    expect(await pendingCount(store)).toBe(1)

    const acc = await store.getAccountByServerId(1)
    expect(acc?.currentBalance).toBe(9500)
  })

  it('rejects queue when wallet is missing offline', async () => {
    await expect(queuePersonalTransaction(store, {
      type: 'income',
      amount: 100,
      date: '2026-07-20',
      accountServerId: 99,
    })).rejects.toThrow(/Wallet not available offline/)
  })

  it('syncs outbox once and is safe to retry with same mutation id on server', async () => {
    await queuePersonalTransaction(store, {
      type: 'expense',
      amount: 200,
      date: '2026-07-21',
      accountServerId: 1,
      category: 'Transport',
    })

    let calls = 0
    const post = async (payload: Record<string, unknown>) => {
      calls += 1
      expect(payload.client_mutation_id).toBeTruthy()
      return { id: 42 }
    }

    const first = await syncOutbox(store, post)
    expect(first.pushed).toBe(1)
    expect(await pendingCount(store)).toBe(0)
    expect(calls).toBe(1)

    const tx = (await store.listTransactions()).find(t => t.serverId === 42)
    expect(tx?.syncStatus).toBe('synced')

    const second = await syncOutbox(store, post)
    expect(second.pushed).toBe(0)
    expect(calls).toBe(1)
  })

  it('marks validation failures as failed and clears outbox', async () => {
    await queuePersonalTransaction(store, {
      type: 'expense',
      amount: 50,
      date: '2026-07-22',
      accountServerId: 1,
    })

    const result = await syncOutbox(store, async () => {
      const err: any = new Error('bad')
      err.response = { status: 400, data: { account: 'Invalid account' } }
      throw err
    })

    expect(result.failed).toBe(1)
    expect(await pendingCount(store)).toBe(0)
    const failed = await store.listPendingTransactions()
    expect(failed[0]?.syncStatus).toBe('failed')
  })

  it('keeps pending local txs across hydrate', async () => {
    await queuePersonalTransaction(store, {
      type: 'income',
      amount: 1000,
      date: '2026-07-23',
      accountServerId: 1,
      category: 'Salary',
    })

    await hydrateFromServer(
      store,
      [{ id: 1, name: 'Meezan', type: 'bank', opening_balance: 10000, current_balance: 10000 }],
      [{
        id: 7,
        type: 'expense',
        amount: 100,
        date: '2026-07-01',
        account: 1,
        category: 'Food',
        notes: '',
        created_at: '2026-07-01T00:00:00Z',
      }],
      1,
    )

    const txs = await store.listTransactions()
    expect(txs.some(t => t.serverId === 7 && t.syncStatus === 'synced')).toBe(true)
    expect(txs.some(t => t.syncStatus === 'pending' && t.amount === 1000)).toBe(true)
    expect(await pendingCount(store)).toBe(1)
  })
})
