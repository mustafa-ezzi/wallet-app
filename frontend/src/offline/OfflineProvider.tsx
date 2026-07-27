import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { accountsApi, transactionsApi } from '../api/client'
import { track } from '../lib/analytics'
import { useAuth } from '../context/AuthContext'
import { getOfflineStore } from './store'
import { hydrateFromServer } from './hydrate'
import { isBrowserOnline, subscribeOnlineStatus } from './network'
import { pendingCount, syncOutbox } from './syncEngine'
import { queuePersonalTransaction, type QueueTxInput } from './queueTransaction'
import type { OfflineAccount, OfflineTransaction } from './types'

interface OfflineContextValue {
  online: boolean
  pending: number
  syncing: boolean
  lastError: string
  refreshStatus: () => Promise<void>
  syncNow: () => Promise<void>
  hydrateNow: () => Promise<void>
  clearLocal: () => Promise<void>
  queueTransaction: (input: QueueTxInput) => Promise<{ queuedOffline: boolean; localId: string }>
  getCachedAccounts: () => Promise<OfflineAccount[]>
  getCachedTransactions: () => Promise<OfflineTransaction[]>
}

const OfflineContext = createContext<OfflineContextValue | null>(null)

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [online, setOnline] = useState(isBrowserOnline())
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastError, setLastError] = useState('')

  const refreshStatus = useCallback(async () => {
    setPending(await pendingCount(getOfflineStore()))
  }, [])

  const hydrateNow = useCallback(async () => {
    if (!user || !isBrowserOnline()) return
    const store = getOfflineStore()
    const [aRes, tRes] = await Promise.all([
      accountsApi.list(),
      transactionsApi.list(),
    ])
    await hydrateFromServer(store, aRes.data, tRes.data, user.id)
    await refreshStatus()
  }, [user, refreshStatus])

  const syncNow = useCallback(async () => {
    if (!isBrowserOnline() || syncing) return
    setSyncing(true)
    setLastError('')
    try {
      const store = getOfflineStore()
      const result = await syncOutbox(store, async (payload) => {
        const res = await transactionsApi.create(payload)
        return { id: res.data.id as number }
      })
      if (result.pushed > 0) {
        track('transaction_sync_success', { count: result.pushed })
        await hydrateNow()
      }
      if (result.failed > 0 && result.errors[0]) {
        setLastError(result.errors[0])
        track('transaction_sync_failed')
      }
      await refreshStatus()
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [syncing, hydrateNow, refreshStatus])

  const queueTransaction = useCallback(async (input: QueueTxInput) => {
    const store = getOfflineStore()
    const onlineNow = isBrowserOnline()
    const result = await queuePersonalTransaction(store, input, { online: onlineNow })
    if (!onlineNow) track('transaction_queued_offline', { tx_type: input.type })
    await refreshStatus()
    if (onlineNow) await syncNow()
    return { queuedOffline: !onlineNow, localId: result.transaction.localId }
  }, [refreshStatus, syncNow])

  const clearLocal = useCallback(async () => {
    await getOfflineStore().clearAll()
    setPending(0)
    setLastError('')
  }, [])

  const getCachedAccounts = useCallback(async () => getOfflineStore().listAccounts(), [])
  const getCachedTransactions = useCallback(async () => getOfflineStore().listTransactions(), [])

  useEffect(() => subscribeOnlineStatus((next) => {
    setOnline(next)
    if (next) void syncNow()
  }), [syncNow])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus, user?.id])

  useEffect(() => {
    if (!user) return
    if (!isBrowserOnline()) return
    void (async () => {
      try {
        await hydrateNow()
        await syncNow()
      } catch {
        /* ignore hydrate errors when offline mid-flight */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per user login
  }, [user?.id])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isBrowserOnline()) void syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [syncNow])

  const value = useMemo<OfflineContextValue>(() => ({
    online,
    pending,
    syncing,
    lastError,
    refreshStatus,
    syncNow,
    hydrateNow,
    clearLocal,
    queueTransaction,
    getCachedAccounts,
    getCachedTransactions,
  }), [
    online, pending, syncing, lastError, refreshStatus, syncNow, hydrateNow,
    clearLocal, queueTransaction, getCachedAccounts, getCachedTransactions,
  ])

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  )
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext)
  if (!ctx) throw new Error('useOffline must be used within OfflineProvider')
  return ctx
}

export function useOfflineOptional(): OfflineContextValue | null {
  return useContext(OfflineContext)
}
