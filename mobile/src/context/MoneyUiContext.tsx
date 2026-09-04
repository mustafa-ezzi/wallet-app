import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DeviceEventEmitter } from 'react-native'

export const BOOKS_CHANGED_EVENT = 'wallettrails:books-changed'

type MoneyUiValue = {
  addOpen: boolean
  openAdd: () => void
  closeAdd: () => void
  refreshKey: number
  bumpRefresh: () => void
}

const MoneyUiContext = createContext<MoneyUiValue | null>(null)

export function MoneyUiProvider({ children }: { children: React.ReactNode }) {
  const [addOpen, setAddOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const openAdd = useCallback(() => setAddOpen(true), [])
  const closeAdd = useCallback(() => setAddOpen(false), [])
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  // Offline sync / bank approve can finish after navigation — refresh books.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(BOOKS_CHANGED_EVENT, () => {
      setRefreshKey((k) => k + 1)
    })
    return () => sub.remove()
  }, [])

  const value = useMemo(
    () => ({ addOpen, openAdd, closeAdd, refreshKey, bumpRefresh }),
    [addOpen, openAdd, closeAdd, refreshKey, bumpRefresh],
  )

  return <MoneyUiContext.Provider value={value}>{children}</MoneyUiContext.Provider>
}

export function useMoneyUi(): MoneyUiValue {
  const ctx = useContext(MoneyUiContext)
  if (!ctx) throw new Error('useMoneyUi must be used within MoneyUiProvider')
  return ctx
}

/** Notify Home / lists that books changed (safe from OfflineProvider). */
export function emitBooksChanged() {
  DeviceEventEmitter.emit(BOOKS_CHANGED_EVENT)
}
