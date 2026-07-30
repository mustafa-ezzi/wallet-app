import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './authStorage'

function normalizeApiRoot(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/$/, '')
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value.replace(/^\/+/, '')}`
}

const API_ROOT = normalizeApiRoot(process.env.EXPO_PUBLIC_API_URL)
const API_BASE = API_ROOT ? `${API_ROOT}/api` : ''

if (!API_BASE && __DEV__) {
  console.warn(
    '[CashTrail] EXPO_PUBLIC_API_URL is not set. Create mobile/.env with your Railway backend URL.',
  )
}

const api = axios.create({
  // Prefer failing fast over an infinite spinner if URL/network is wrong
  baseURL: API_BASE || 'https://invalid.local/api',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  timeout: 12000,
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
          const { data } = await axios.post(`${API_BASE}/auth/refresh/`, { refresh })
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
export { API_BASE, API_ROOT }

export function asList<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: T[] }).results
  }
  return []
}

export function apiErrorMessage(err: unknown, fallback = 'Request failed.'): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  if (!data) {
    const msg = (err as Error)?.message
    if (msg && /network/i.test(msg)) return 'No internet connection. Check your network and try again.'
    return msg || fallback
  }
  if (typeof data === 'string') return data
  if (typeof data === 'object' && data !== null) {
    const detail = (data as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
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
