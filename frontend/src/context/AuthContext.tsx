import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { authApi } from '../api/client'
import { identifyUser, resetAnalytics, track } from '../lib/analytics'
import { getOfflineStore } from '../offline/store'
import { isBrowserOnline } from '../offline/network'
import {
  activateSession,
  clearActiveSession,
  clearAllSessions,
  clearSession,
  getAccessToken,
  listSavedUsers,
  readCachedUser,
  removeSession,
  setActiveTokens,
  upsertActiveSession,
  writeCachedUser,
  type CachedUser,
} from '../auth/sessionStore'

export type User = CachedUser

interface AuthContextType {
  user: User | null
  loading: boolean
  savedAccounts: User[]
  addingAccount: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  refreshUser: () => Promise<void>
  switchAccount: (userId: number) => Promise<void>
  beginAddAccount: () => Promise<void>
  cancelAddAccount: () => Promise<void>
  removeAccount: (userId: number) => Promise<void>
  reloadSavedAccounts: () => void
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

function isNetworkError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; response?: unknown }
  if (e?.response) return false
  const msg = (e?.message || '').toLowerCase()
  return (
    e?.code === 'ERR_NETWORK'
    || e?.code === 'ECONNABORTED'
    || msg.includes('network error')
    || msg.includes('failed to fetch')
    || !isBrowserOnline()
  )
}

function isUnauthorized(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === 401 || status === 403
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [savedAccounts, setSavedAccounts] = useState<User[]>([])
  const [addingAccount, setAddingAccount] = useState(false)
  const addReturnUserId = useRef<number | null>(null)
  const userRef = useRef<User | null>(null)
  userRef.current = user

  const reloadSavedAccounts = useCallback(() => {
    setSavedAccounts(listSavedUsers())
  }, [])

  const applyUser = useCallback((data: User) => {
    setUser(data)
    writeCachedUser(data)
    upsertActiveSession()
    identifyUser(data)
    setSavedAccounts(listSavedUsers())
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await authApi.me()
      applyUser(data)
    } catch (err) {
      if (isNetworkError(err) || !isBrowserOnline()) {
        const cached = readCachedUser()
        if (cached && getAccessToken()) {
          setUser(cached)
          identifyUser(cached)
          return
        }
      }
      if (isUnauthorized(err)) {
        clearSession()
        setUser(null)
        reloadSavedAccounts()
        return
      }
      const cached = readCachedUser()
      if (cached && getAccessToken()) {
        setUser(cached)
        identifyUser(cached)
        return
      }
      setUser(null)
    }
  }, [applyUser, reloadSavedAccounts])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      reloadSavedAccounts()
      setLoading(false)
      return
    }

    const cached = readCachedUser()
    if (cached) {
      setUser(cached)
      identifyUser(cached)
      upsertActiveSession()
    }
    reloadSavedAccounts()
    refreshUser().finally(() => setLoading(false))
  }, [refreshUser, reloadSavedAccounts])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password)
    setActiveTokens(data.access, data.refresh)
    await refreshUser()
    setAddingAccount(false)
    addReturnUserId.current = null
    track('user_logged_in')
  }, [refreshUser])

  const activateAndLoad = useCallback(async (userId: number) => {
    const session = activateSession(userId)
    if (!session) return false
    setUser(session.user)
    identifyUser(session.user)
    reloadSavedAccounts()
    void refreshUser()
    return true
  }, [refreshUser, reloadSavedAccounts])

  const switchAccount = useCallback(async (userId: number) => {
    if (userRef.current?.id === userId) return
    upsertActiveSession()
    const session = activateSession(userId)
    if (!session) throw new Error('That account is no longer saved in this browser.')
    resetAnalytics()
    await getOfflineStore().clearAll()
    setUser(session.user)
    identifyUser(session.user)
    setAddingAccount(false)
    addReturnUserId.current = null
    reloadSavedAccounts()
    track('account_switched')
    void refreshUser()
  }, [refreshUser, reloadSavedAccounts])

  const beginAddAccount = useCallback(async () => {
    if (userRef.current?.id) {
      upsertActiveSession()
      addReturnUserId.current = userRef.current.id
    }
    clearActiveSession()
    setUser(null)
    setAddingAccount(true)
    reloadSavedAccounts()
    track('add_account_started')
  }, [reloadSavedAccounts])

  const cancelAddAccount = useCallback(async () => {
    const returnId = addReturnUserId.current
    addReturnUserId.current = null
    setAddingAccount(false)
    if (returnId && await activateAndLoad(returnId)) return
    const users = listSavedUsers()
    if (users[0] && await activateAndLoad(users[0].id)) return
    setUser(null)
    reloadSavedAccounts()
  }, [activateAndLoad, reloadSavedAccounts])

  const logout = useCallback(async () => {
    const currentId = userRef.current?.id
    if (currentId) removeSession(currentId)
    clearActiveSession()
    resetAnalytics()
    await getOfflineStore().clearAll()

    const remaining = listSavedUsers()
    if (remaining[0] && await activateAndLoad(remaining[0].id)) {
      setAddingAccount(false)
      addReturnUserId.current = null
      track('user_logged_out')
      return
    }

    setUser(null)
    setAddingAccount(false)
    addReturnUserId.current = null
    reloadSavedAccounts()
    track('user_logged_out')
  }, [activateAndLoad, reloadSavedAccounts])

  const logoutAll = useCallback(async () => {
    clearAllSessions()
    setUser(null)
    setAddingAccount(false)
    addReturnUserId.current = null
    setSavedAccounts([])
    resetAnalytics()
    await getOfflineStore().clearAll()
    track('user_logged_out_all')
  }, [])

  const removeAccount = useCallback(async (userId: number) => {
    if (userRef.current?.id === userId) {
      await logout()
      return
    }
    removeSession(userId)
    reloadSavedAccounts()
  }, [logout, reloadSavedAccounts])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        savedAccounts,
        addingAccount,
        login,
        logout,
        logoutAll,
        refreshUser,
        switchAccount,
        beginAddAccount,
        cancelAddAccount,
        removeAccount,
        reloadSavedAccounts,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
