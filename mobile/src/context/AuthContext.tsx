import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { apiErrorMessage, authApi } from '../api/client'
import { track } from '../lib/analytics'
import {
  clearSession,
  getAccessToken,
  getCachedUser,
  setCachedUser,
  setTokens,
  type CachedUser,
} from '../api/authStorage'

export type User = CachedUser

type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: {
    first_name: string
    last_name: string
    email: string
    password: string
    currency?: string
  }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
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
  const booted = useRef(false)

  const applyUser = useCallback(async (data: User) => {
    setUser(data)
    await setCachedUser(data)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await authApi.me()
      await applyUser(data)
    } catch (err) {
      const token = await withTimeout(getAccessToken(), 1200, null)

      if (isUnauthorized(err)) {
        await clearSession()
        setUser(null)
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
  }, [applyUser])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    let cancelled = false

    ;(async () => {
      try {
        const token = await withTimeout(getAccessToken(), 1500, null)
        if (!token) return

        const cached = await withTimeout(getCachedUser(), 1500, null)
        if (cached && !cancelled) setUser(cached)

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

  const logout = useCallback(async () => {
    await clearSession()
    setUser(null)
    track('user_logged_out')
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { apiErrorMessage }
