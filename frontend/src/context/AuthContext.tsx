import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../api/client'
import { identifyUser, resetAnalytics, track } from '../lib/analytics'
import { getOfflineStore } from '../offline/store'
import { isBrowserOnline } from '../offline/network'

const USER_CACHE_KEY = 'cashtrail_user'

interface User {
  id: number
  first_name: string
  last_name: string
  username: string
  email: string
  currency: string
  is_premium?: boolean
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as User
    if (!parsed || typeof parsed.id !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeCachedUser(user: User | null) {
  try {
    if (!user) localStorage.removeItem(USER_CACHE_KEY)
    else localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
  } catch {
    /* ignore quota / private mode */
  }
}

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

  const applyUser = useCallback((data: User) => {
    setUser(data)
    writeCachedUser(data)
    identifyUser(data)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await authApi.me()
      applyUser(data)
    } catch (err) {
      // Offline / flaky network: keep session from cache — do not force logout
      if (isNetworkError(err) || !isBrowserOnline()) {
        const cached = readCachedUser()
        if (cached && localStorage.getItem('access_token')) {
          setUser(cached)
          identifyUser(cached)
          return
        }
      }
      // Real auth rejection while reachable
      if (isUnauthorized(err)) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        writeCachedUser(null)
        setUser(null)
        return
      }
      // Other errors: prefer cached session if we still have a token
      const cached = readCachedUser()
      if (cached && localStorage.getItem('access_token')) {
        setUser(cached)
        identifyUser(cached)
        return
      }
      setUser(null)
    }
  }, [applyUser])

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setLoading(false)
      return
    }

    // Instant restore so ProtectedRoute doesn't bounce to /login while /me is in flight or offline
    const cached = readCachedUser()
    if (cached) {
      setUser(cached)
      identifyUser(cached)
    }

    refreshUser().finally(() => setLoading(false))
  }, [refreshUser])

  const login = async (email: string, password: string) => {
    const { data } = await authApi.login(email, password)
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    await refreshUser()
    track('user_logged_in')
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    writeCachedUser(null)
    setUser(null)
    resetAnalytics()
    void getOfflineStore().clearAll()
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
