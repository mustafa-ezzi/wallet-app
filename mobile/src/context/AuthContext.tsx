import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { setHomeCurrency } from '../currency/homeCurrency'
import { apiErrorMessage, authApi } from '../api/client'
import { track } from '../lib/analytics'
import {
  activateSession,
  clearActiveSession,
  clearAllSessions,
  clearSession,
  getAccessToken,
  getCachedUser,
  listSavedUsers,
  removeSession,
  setCachedUser,
  setTokens,
  upsertActiveSession,
  type CachedUser,
} from '../api/authStorage'

export type User = CachedUser

type AuthContextValue = {
  user: User | null
  loading: boolean
  /** Other saved accounts (excludes the active user). */
  savedAccounts: User[]
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: (idToken: string, currency?: string) => Promise<{ created: boolean }>
  register: (data: {
    first_name: string
    last_name: string
    email: string
    password: string
    currency?: string
  }) => Promise<void>
  /** Log out of the active account; switches to another saved account if any remain. */
  logout: () => Promise<void>
  /** Remove every saved session and return to login. */
  logoutAll: () => Promise<void>
  refreshUser: () => Promise<void>
  /** Switch to a previously saved account without re-entering the password. */
  switchAccount: (userId: number) => Promise<void>
  /** Save current session, clear active slot, go to login to add another account. */
  beginAddAccount: () => Promise<void>
  /** Cancel add-account flow and restore the previous account. */
  cancelAddAccount: () => Promise<void>
  /** True while login is being used to add another account. */
  addingAccount: boolean
  /** Remove a saved account from the device (logs out if it is active). */
  removeAccount: (userId: number) => Promise<void>
  reloadSavedAccounts: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function isNetworkError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; response?: unknown }
  if (e?.response) return false
  const msg = (e?.message || '').toLowerCase()
  return (
    e?.code === 'ERR_NETWORK'
    || e?.code === 'ECONNABORTED'
    || msg.includes('network')
    || msg.includes('timeout')
  )
}

function isUnauthorized(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === 401 || status === 403
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [savedAccounts, setSavedAccounts] = useState<User[]>([])
  const [addingAccount, setAddingAccount] = useState(false)
  const booted = useRef(false)
  const addReturnUserId = useRef<number | null>(null)

  const reloadSavedAccounts = useCallback(async () => {
    const users = await listSavedUsers()
    setSavedAccounts(users)
  }, [])

  const applyUser = useCallback(async (data: User) => {
    setHomeCurrency(data.currency)
    setUser(data)
    await setCachedUser(data)
    await upsertActiveSession()
    await reloadSavedAccounts()
  }, [reloadSavedAccounts])

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await authApi.me()
      await applyUser(data)
    } catch (err) {
      const token = await withTimeout(getAccessToken(), 1200, null)

      if (isUnauthorized(err)) {
        await clearSession()
        setUser(null)
        await reloadSavedAccounts()
        return
      }

      const cached = await withTimeout(getCachedUser(), 1200, null)
      if (cached && token && (isNetworkError(err) || !(err as { response?: unknown })?.response)) {
        setUser(cached)
        return
      }
      if (cached && token) {
        setUser(cached)
        return
      }
      setUser(null)
    }
  }, [applyUser, reloadSavedAccounts])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    let cancelled = false

    ;(async () => {
      try {
        const token = await withTimeout(getAccessToken(), 1500, null)
        if (!token) {
          await reloadSavedAccounts()
          return
        }

        const cached = await withTimeout(getCachedUser(), 1500, null)
        if (cached && !cancelled) {
          setHomeCurrency(cached.currency)
          setUser(cached)
          await upsertActiveSession()
        }
        await reloadSavedAccounts()

        // Do not await network — UI must leave the spinner immediately
        void refreshUser()
      } catch (err) {
        console.warn('[WalletTrails] auth boot failed', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    const failsafe = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 2000)

    return () => {
      cancelled = true
      clearTimeout(failsafe)
    }
    // Boot once on mount — do not re-run when refreshUser identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email.trim(), password)
    await setTokens(data.access, data.refresh)
    await refreshUser()
    setAddingAccount(false)
    addReturnUserId.current = null
    track('user_logged_in')
  }, [refreshUser])

  const register = useCallback(async (payload: {
    first_name: string
    last_name: string
    email: string
    password: string
    currency?: string
  }) => {
    await authApi.register(payload)
  }, [])

  const loginWithGoogle = useCallback(async (idToken: string, currency?: string) => {
    const { data } = await authApi.google(idToken, currency)
    await setTokens(data.access, data.refresh)
    await refreshUser()
    setAddingAccount(false)
    addReturnUserId.current = null
    if (data.created) {
      track('user_signed_up', { source: 'google', currency: currency || 'PKR' })
    } else {
      track('user_logged_in', { source: 'google' })
    }
    return { created: Boolean(data.created) }
  }, [refreshUser])

  const switchAccount = useCallback(async (userId: number) => {
    if (user?.id === userId) return
    // Keep the current account on the device before leaving it
    await upsertActiveSession()
    const session = await activateSession(userId)
    if (!session) {
      throw new Error('That account is no longer saved on this device.')
    }
    setHomeCurrency(session.user.currency)
    setUser(session.user)
    setAddingAccount(false)
    addReturnUserId.current = null
    await reloadSavedAccounts()
    track('account_switched')
    void refreshUser()
  }, [user?.id, refreshUser, reloadSavedAccounts])

  const beginAddAccount = useCallback(async () => {
    if (user?.id) {
      await upsertActiveSession()
      addReturnUserId.current = user.id
    }
    await clearActiveSession()
    setUser(null)
    setHomeCurrency(null)
    setAddingAccount(true)
    await reloadSavedAccounts()
    track('add_account_started')
  }, [user, reloadSavedAccounts])

  const cancelAddAccount = useCallback(async () => {
    const returnId = addReturnUserId.current
    addReturnUserId.current = null
    setAddingAccount(false)
    if (returnId) {
      const session = await activateSession(returnId)
      if (session) {
        setHomeCurrency(session.user.currency)
        setUser(session.user)
        await reloadSavedAccounts()
        void refreshUser()
        return
      }
    }
    const users = await listSavedUsers()
    if (users[0]) {
      const session = await activateSession(users[0].id)
      if (session) {
        setHomeCurrency(session.user.currency)
        setUser(session.user)
        await reloadSavedAccounts()
        void refreshUser()
        return
      }
    }
    setUser(null)
    await reloadSavedAccounts()
  }, [refreshUser, reloadSavedAccounts])

  const removeAccount = useCallback(async (userId: number) => {
    if (user?.id === userId) {
      await clearSession()
      const remaining = await listSavedUsers()
      if (remaining[0]) {
        const session = await activateSession(remaining[0].id)
        if (session) {
          setHomeCurrency(session.user.currency)
          setUser(session.user)
          await reloadSavedAccounts()
          void refreshUser()
          return
        }
      }
      setHomeCurrency(null)
      setUser(null)
      await reloadSavedAccounts()
      return
    }
    await removeSession(userId)
    await reloadSavedAccounts()
  }, [user?.id, refreshUser, reloadSavedAccounts])

  const logout = useCallback(async () => {
    const currentId = user?.id
    if (currentId) {
      await removeSession(currentId)
    }
    await clearActiveSession()

    const remaining = await listSavedUsers()
    if (remaining[0]) {
      const session = await activateSession(remaining[0].id)
      if (session) {
        setHomeCurrency(session.user.currency)
        setUser(session.user)
        setAddingAccount(false)
        addReturnUserId.current = null
        await reloadSavedAccounts()
        track('user_logged_out')
        void refreshUser()
        return
      }
    }

    setHomeCurrency(null)
    setUser(null)
    setAddingAccount(false)
    addReturnUserId.current = null
    await reloadSavedAccounts()
    track('user_logged_out')
  }, [user?.id, refreshUser, reloadSavedAccounts])

  const logoutAll = useCallback(async () => {
    await clearAllSessions()
    setHomeCurrency(null)
    setUser(null)
    setAddingAccount(false)
    addReturnUserId.current = null
    setSavedAccounts([])
    track('user_logged_out_all')
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      savedAccounts,
      login,
      loginWithGoogle,
      register,
      logout,
      logoutAll,
      refreshUser,
      switchAccount,
      beginAddAccount,
      cancelAddAccount,
      addingAccount,
      removeAccount,
      reloadSavedAccounts,
    }),
    [
      user,
      loading,
      savedAccounts,
      login,
      loginWithGoogle,
      register,
      logout,
      logoutAll,
      refreshUser,
      switchAccount,
      beginAddAccount,
      cancelAddAccount,
      addingAccount,
      removeAccount,
      reloadSavedAccounts,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { apiErrorMessage }
