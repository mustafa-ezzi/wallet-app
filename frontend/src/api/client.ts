import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

// Local Vite proxy uses /api. On Railway set VITE_API_URL to your backend URL
// e.g. https://wallet-backend.up.railway.app  (no trailing slash)
const API_ROOT = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''
const API_BASE = API_ROOT ? `${API_ROOT}/api` : '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

function looksLikeHtml(data: unknown): boolean {
  if (typeof data !== 'string') return false
  const s = data.trim().slice(0, 200).toLowerCase()
  return s.startsWith('<!doctype') || s.startsWith('<html') || s.includes('<head>')
}

function normalizeApiData(data: unknown): unknown {
  if (data == null) return data
  if (typeof data === 'object') return data
  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (!trimmed || looksLikeHtml(trimmed)) return data
    try {
      return JSON.parse(trimmed)
    } catch {
      return data
    }
  }
  return data
}

function assertApiResponse(res: AxiosResponse) {
  // Empty bodies (204) are fine
  if (res.status === 204 || res.data == null || res.data === '') {
    return res
  }

  const normalized = normalizeApiData(res.data)
  res.data = normalized

  // Accept any JSON object/array. Only reject HTML shells (misconfigured API URL).
  if (looksLikeHtml(normalized) || typeof normalized === 'string') {
    const err = new Error(
      API_ROOT
        ? 'API returned HTML instead of JSON. Check VITE_API_URL points to your backend, not the frontend.'
        : 'API is not configured. Set VITE_API_URL to your backend URL and redeploy the frontend.'
    ) as Error & { response?: { data?: { detail?: string }; status?: number } }
    err.response = {
      status: res.status,
      data: { detail: err.message },
    }
    throw err
  }
  return res
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => assertApiResponse(res),
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && original && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_BASE}/auth/refresh/`, { refresh })
          localStorage.setItem('access_token', data.access)
          original.headers = original.headers ?? {}
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      } else {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
export { API_BASE, API_ROOT }

/** Normalize DRF list responses (paginated or plain array). */
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

// ── Typed helpers ───────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login/', { username: email, password }),
  register: (data: { first_name: string; last_name: string; email: string; password: string; currency?: string }) =>
    api.post('/auth/register/', { ...data, username: data.email }),
  me: () => api.get('/me/'),
  updateMe: (data: object) => api.patch('/me/', data),
}

export const accountsApi = {
  list: () => api.get('/accounts/'),
  create: (data: object) => api.post('/accounts/', data),
  update: (id: number, data: object) => api.patch(`/accounts/${id}/`, data),
  remove: (id: number) => api.delete(`/accounts/${id}/`),
}

export const projectsApi = {
  list: (params?: object) => api.get('/projects/', { params }),
  create: (data: object) => api.post('/projects/', data),
  update: (id: number, data: object) => api.patch(`/projects/${id}/`, data),
  remove: (id: number) => api.delete(`/projects/${id}/`),
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

export const receivablesApi = {
  list: () => api.get('/receivables/'),
  create: (data: object) => api.post('/receivables/', data),
  update: (id: number, data: object) => api.patch(`/receivables/${id}/`, data),
}

export const payablesApi = {
  list: () => api.get('/payables/'),
  create: (data: object) => api.post('/payables/', data),
  update: (id: number, data: object) => api.patch(`/payables/${id}/`, data),
}

export const dashboardApi = {
  get: () => api.get('/dashboard/'),
}

export const forecastApi = {
  get: (year: number, month: number) => api.get(`/forecast/${year}/${month}/`),
}
