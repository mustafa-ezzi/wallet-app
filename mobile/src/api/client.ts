import Constants from 'expo-constants'
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './authStorage'

/** Always-on fallback so a misconfigured EAS build never points at invalid.local. */
const PRODUCTION_API_ROOT = 'https://tranquil-radiance-production.up.railway.app'

function normalizeApiRoot(raw: string | undefined | null): string {
  const value = (raw ?? '').trim().replace(/\/$/, '')
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value.replace(/^\/+/, '')}`
}

function extraApiUrl(): string {
  const fromExpoConfig = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl
  const fromManifest = (Constants as { manifest?: { extra?: { apiUrl?: string } } }).manifest?.extra?.apiUrl
  return normalizeApiRoot(fromExpoConfig || fromManifest)
}

/** Prefer env (dev / EAS), then app.json extra, then production fallback. */
function resolveApiRoot(): string {
  return (
    normalizeApiRoot(process.env.EXPO_PUBLIC_API_URL)
    || extraApiUrl()
    || PRODUCTION_API_ROOT
  )
}

const API_ROOT = resolveApiRoot()
const API_BASE = `${API_ROOT}/api`

const api = axios.create({
  baseURL: API_BASE,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  timeout: 45000,
  transitional: { clarifyTimeoutError: true },
})

function looksLikeHtml(data: unknown): boolean {
  if (typeof data !== 'string') return false
  const s = data.trim().slice(0, 200).toLowerCase()
  return s.startsWith('<!doctype') || s.startsWith('<html') || s.includes('<head>')
}

function assertApiResponse(res: AxiosResponse) {
  if (res.status === 204 || res.data == null || res.data === '') return res
  let data = res.data
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
      res.data = data
    } catch {
      /* keep */
    }
  }
  if (looksLikeHtml(data) || typeof data === 'string') {
    const err = new Error(
      'API returned HTML instead of JSON. Check EXPO_PUBLIC_API_URL points to your Django backend.',
    ) as Error & { response?: { status?: number; data?: { detail?: string } } }
    err.response = { status: res.status, data: { detail: err.message } }
    throw err
  }
  return res
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => assertApiResponse(res),
  async (err) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean }
    if (!err.response) {
      return Promise.reject(err)
    }
    if (err.response?.status === 401 && original && !original._retry) {
      original._retry = true
      const refresh = await getRefreshToken()
      if (refresh && API_BASE) {
        try {
          const { data } = await axios.post(`${API_BASE}/auth/refresh/`, { refresh }, { timeout: 45000 })
          await setTokens(data.access, refresh)
          original.headers = original.headers ?? {}
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch (refreshErr) {
          if (!(refreshErr as { response?: unknown })?.response) {
            return Promise.reject(err)
          }
          await clearSession()
        }
      }
    }
    return Promise.reject(err)
  },
)

export default api
export { API_BASE, API_ROOT, PRODUCTION_API_ROOT }

/** Direct fetch probe — bypasses axios to diagnose device networking. */
export async function probeApiConnection(): Promise<{
  ok: boolean
  url: string
  status?: number
  detail: string
}> {
  const url = `${API_BASE}/me/`
  const started = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    const ms = Date.now() - started
    if (res.status === 401 || res.status === 200) {
      return { ok: true, url, status: res.status, detail: `Reachable in ${ms}ms (HTTP ${res.status})` }
    }
    return {
      ok: false,
      url,
      status: res.status,
      detail: `Server responded HTTP ${res.status} in ${ms}ms`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, url, detail: `Fetch failed: ${msg}` }
  }
}

export function asList<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: T[] }).results
  }
  return []
}

export function apiErrorMessage(err: unknown, fallback = 'Request failed.'): string {
  const ax = err as {
    code?: string
    message?: string
    response?: { status?: number; data?: unknown }
  }

  if (!ax?.response) {
    const msg = (ax?.message || '').toLowerCase()
    const code = (ax?.code || '').toUpperCase()
    if (code === 'ECONNABORTED' || msg.includes('timeout') || msg.includes('aborted')) {
      return 'Server took too long to respond. Try again in a moment.'
    }
    if (msg.includes('network') || code === 'ERR_NETWORK') {
      return `Cannot reach CashTrail (${API_ROOT}). Check mobile data/Wi‑Fi, disable VPN, then retry.`
    }
    return ax?.message || fallback
  }

  const status = ax.response.status
  const data = ax.response.data
  if (status === 401) return 'Session expired. Please log in again.'
  if (status === 403) return 'You do not have permission for this action.'
  if (status === 404) return 'Not found on the server. The app may need an update.'
  if (status && status >= 500) return 'Server error. Please try again shortly.'

  if (typeof data === 'string') return data
  if (typeof data === 'object' && data !== null) {
    const obj = data as { detail?: unknown; smtp_error?: unknown }
    const detail = typeof obj.detail === 'string' ? obj.detail : ''
    const smtp = typeof obj.smtp_error === 'string' ? obj.smtp_error : ''
    if (detail && smtp) return `${detail}\n\n${smtp}`
    if (detail) return detail
    if (smtp) return smtp
    const parts = Object.values(data as Record<string, unknown>).flat()
    const joined = parts.filter(v => typeof v === 'string' || typeof v === 'number').join(' ')
    if (joined.trim()) return joined
  }
  return fallback
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login/', { username: email, password }),
  register: (data: {
    first_name: string
    last_name: string
    email: string
    password: string
    currency?: string
  }) => api.post('/auth/register/', { ...data, username: data.email }),
  me: () => api.get('/me/'),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password/', { email }),
  verifyResetOtp: (email: string, code: string) =>
    api.post('/auth/verify-reset-otp/', { email, code }),
  resetPassword: (reset_token: string, password: string) =>
    api.post('/auth/reset-password/', { reset_token, password }),
}

export const dashboardApi = {
  get: () => api.get('/dashboard/'),
}

export const accountsApi = {
  list: () => api.get('/accounts/'),
  create: (data: object) => api.post('/accounts/', data),
  update: (id: number, data: object) => api.patch(`/accounts/${id}/`, data),
  remove: (id: number) => api.delete(`/accounts/${id}/`),
}

export const transactionsApi = {
  list: (params?: object) => api.get('/transactions/', { params }),
  create: (data: object) => api.post('/transactions/', data),
  update: (id: number, data: object) => api.patch(`/transactions/${id}/`, data),
  remove: (id: number) => api.delete(`/transactions/${id}/`),
}

export const expensesApi = {
  list: () => api.get('/expenses/'),
  create: (data: object) => api.post('/expenses/', data),
  update: (id: number, data: object) => api.patch(`/expenses/${id}/`, data),
  remove: (id: number) => api.delete(`/expenses/${id}/`),
}

export const payablesApi = {
  list: () => api.get('/payables/'),
  create: (data: object) => api.post('/payables/', data),
  update: (id: number, data: object) => api.patch(`/payables/${id}/`, data),
  remove: (id: number) => api.delete(`/payables/${id}/`),
}

export const receivablesApi = {
  list: () => api.get('/receivables/'),
  create: (data: object) => api.post('/receivables/', data),
  update: (id: number, data: object) => api.patch(`/receivables/${id}/`, data),
  remove: (id: number) => api.delete(`/receivables/${id}/`),
}

export const forecastApi = {
  get: (year: number, month: number) => api.get(`/forecast/${year}/${month}/`),
}

export const projectsApi = {
  list: (params?: object) => api.get('/projects/', { params }),
  create: (data: object) => api.post('/projects/', data),
  update: (id: number, data: object) => api.patch(`/projects/${id}/`, data),
  remove: (id: number) => api.delete(`/projects/${id}/`),
}

export const householdsApi = {
  list: () => api.get('/households/'),
  create: (data: object) => api.post('/households/', data),
  get: (id: number) => api.get(`/households/${id}/`),
  update: (id: number, data: object) => api.patch(`/households/${id}/`, data),
  remove: (id: number) => api.delete(`/households/${id}/`),
  members: (id: number) => api.get(`/households/${id}/members/`),
  leave: (id: number) => api.post(`/households/${id}/leave/`),
  getInvite: (id: number) => api.get(`/households/${id}/invites/`),
  regenerateInvite: (id: number) => api.post(`/households/${id}/invites/`),
  inviteByEmail: (id: number, email: string) =>
    api.post(`/households/${id}/invite-by-email/`, { email }),
  ledgers: (id: number) => api.get(`/households/${id}/ledgers/`),
  /** All open ledgers across households — for linking personal expenses. */
  openLedgers: () => api.get('/household-ledgers/', { params: { status: 'open' } }),
  createLedger: (id: number, data: object) => api.post(`/households/${id}/ledgers/`, data),
  closeLedger: (ledgerId: number) => api.post(`/household-ledgers/${ledgerId}/close/`),
  reopenLedger: (ledgerId: number) => api.post(`/household-ledgers/${ledgerId}/reopen/`),
  ledgerSummary: (ledgerId: number) => api.get(`/household-ledgers/${ledgerId}/summary/`),
  ledgerReport: (ledgerId: number, params?: { year?: number; month?: number }) =>
    api.get(`/household-ledgers/${ledgerId}/report/`, { params }),
  ledgerContributions: (ledgerId: number) =>
    api.get(`/household-ledgers/${ledgerId}/contributions/`),
  addContribution: (ledgerId: number, data: object) =>
    api.post(`/household-ledgers/${ledgerId}/contributions/`, data),
  settlement: (ledgerId: number) => api.get(`/household-ledgers/${ledgerId}/settlement/`),
  markSettlement: (ledgerId: number, data: object) =>
    api.post(`/household-ledgers/${ledgerId}/settlement/mark/`, data),
  joinPreview: (data: { code?: string; token?: string }) => api.post('/households/join/preview/', data),
  join: (data: { code?: string; token?: string }) => api.post('/households/join/', data),
  pendingInvites: () => api.get('/households/invitations/pending/'),
  acceptInvite: (id: number) => api.post(`/households/invitations/${id}/accept/`),
  declineInvite: (id: number) => api.post(`/households/invitations/${id}/decline/`),
  ledgerExpenses: (ledgerId: number, params?: object) =>
    api.get(`/household-ledgers/${ledgerId}/expenses/`, { params }),
  addExpense: (ledgerId: number, data: object) =>
    api.post(`/household-ledgers/${ledgerId}/expenses/`, data),
  removeExpense: (id: number) => api.delete(`/household-expenses/${id}/`),
  unreadNotificationCount: () => api.get('/household-notifications/unread_count/'),
}
