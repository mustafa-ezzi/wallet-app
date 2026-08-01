import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearOpsTokens,
  fetchOpsMe,
  getStoredAccessToken,
  loginOps,
  type OpsMe,
} from './api'

type AuthState = {
  user: OpsMe | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<OpsMe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshMe = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setUser(null)
      return
    }
    const me = await fetchOpsMe()
    setUser(me)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (getStoredAccessToken()) {
          const me = await fetchOpsMe()
          if (!cancelled) setUser(me)
        }
      } catch {
        clearOpsTokens()
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    try {
      const me = await loginOps(username.trim(), password)
      setUser(me)
    } catch (e: unknown) {
      clearOpsTokens()
      const status = (e as { response?: { status?: number; data?: { detail?: string } } })?.response?.status
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (status === 403) {
        setError('This account is not staff. Mark is_staff=True for your Django user.')
      } else if (status === 401) {
        setError('Invalid username or password.')
      } else {
        setError(typeof detail === 'string' ? detail : 'Login failed.')
      }
      throw e
    }
  }, [])

  const logout = useCallback(() => {
    clearOpsTokens()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, login, logout, refreshMe }),
    [user, loading, error, login, logout, refreshMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
