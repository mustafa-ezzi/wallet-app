import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { accountsApi, transactionsApi } from '@/src/api/client'
import { useAuth } from '@/src/context/AuthContext'
import { track } from '@/src/lib/analytics'
import { hydrateFromServer } from './hydrate'
import { queuePersonalTransaction, type QueueTxInput } from './queueTransaction'
import { getOfflineStore, __resetOfflineStore } from './store'
import { pendingCount, syncOutbox } from './syncEngine'
import type { OfflineAccount, OfflineTransaction } from './types'
import { updateBalanceWidgets } from '@/src/widgets/updateBalanceWidget'

interface OfflineContextValue {
  ready: boolean
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
  const [ready, setReady] = useState(false)
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastError, setLastError] = useState('')
  const syncingRef = useRef(false)

  const refreshStatus = useCallback(async () => {
    const store = await getOfflineStore()
    setPending(await pendingCount(store))
  }, [])

  const hydrateNow = useCallback(async () => {
    if (!user) return
    const net = await NetInfo.fetch()
    if (net.isConnected === false) return
    const store = await getOfflineStore()
    const [aRes, tRes] = await Promise.all([accountsApi.list(), transactionsApi.list()])
    await hydrateFromServer(store, aRes.data, tRes.data, user.id)
    await refreshStatus()
    void updateBalanceWidgets()
  }, [user, refreshStatus])

  const syncNow = useCallback(async () => {
    const net = await NetInfo.fetch()
    if (net.isConnected === false || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setLastError('')
    try {
      const store = await getOfflineStore()
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
      track('transaction_sync_failed')
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [hydrateNow, refreshStatus])

  const queueTransaction = useCallback(async (input: QueueTxInput) => {
    const store = await getOfflineStore()
    const net = await NetInfo.fetch()
    const onlineNow = net.isConnected !== false
    const result = await queuePersonalTransaction(store, input, { online: onlineNow })
    if (!onlineNow) track('transaction_queued_offline', { tx_type: input.type })
    await refreshStatus()
    void updateBalanceWidgets()
    if (onlineNow) await syncNow()
    return { queuedOffline: !onlineNow, localId: result.transaction.localId }
  }, [refreshStatus, syncNow])

  const clearLocal = useCallback(async () => {
    const store = await getOfflineStore()
    await store.clearAll()
    __resetOfflineStore()
    setPending(0)
    setLastError('')
  }, [])

  const getCachedAccounts = useCallback(async () => {
    const store = await getOfflineStore()
    return store.listAccounts()
  }, [])

  const getCachedTransactions = useCallback(async () => {
    const store = await getOfflineStore()
    return store.listTransactions()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await getOfflineStore()
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const next = state.isConnected !== false
      setOnline(next)
      if (next) void syncNow()
    })
    void NetInfo.fetch().then((s) => setOnline(s.isConnected !== false))
    return () => unsub()
  }, [syncNow])

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') void syncNow()
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [syncNow])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus, user?.id])

  useEffect(() => {
    if (!user) return
    void (async () => {
      try {
        const store = await getOfflineStore()
        const prev = await store.getMeta('user_id')
        if (prev && prev !== String(user.id)) {
          await store.clearAll()
        }
        const net = await NetInfo.fetch()
        if (net.isConnected === false) {
          await refreshStatus()
          return
        }
        await hydrateNow()
        await syncNow()
      } catch {
        /* offline mid-flight */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per login
  }, [user?.id])

  const value = useMemo<OfflineContextValue>(
    () => ({
      ready,
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
    }),
    [
      ready,
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
    ],
  )

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext)
  if (!ctx) throw new Error('useOffline must be used within OfflineProvider')
  return ctx
}

export function useOfflineOptional(): OfflineContextValue | null {
  return useContext(OfflineContext)
}
