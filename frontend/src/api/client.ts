import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

/** Ensure API root is an absolute URL (Railway vars are often pasted without https://). */
function normalizeApiRoot(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/$/, '')
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  // Accidentally pasted as host-only → treat as https backend
  return `https://${value.replace(/^\/+/, '')}`
}

// Local Vite proxy uses /api. On Railway set VITE_API_URL to your backend URL
// e.g. https://tranquil-radiance-production.up.railway.app  (include https://)
const API_ROOT = normalizeApiRoot(import.meta.env.VITE_API_URL as string | undefined)
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
    // Never wipe the session on pure network failures (offline open)
    const noResponse = !err.response
    if (noResponse) {
      return Promise.reject(err)
    }
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
        } catch (refreshErr) {
          // Refresh also failed due to network → keep tokens, stay logged in offline
          if (!(refreshErr as { response?: unknown })?.response) {
            return Promise.reject(err)
          }
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          try { localStorage.removeItem('cashtrail_user') } catch { /* ignore */ }
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

// ── Typed helpers ───────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login/', { username: email, password }),
  register: (data: { first_name: string; last_name: string; email: string; password: string; currency?: string }) =>
    api.post('/auth/register/', { ...data, username: data.email }),
  me: () => api.get('/me/'),
  updateMe: (data: object) => api.patch('/me/', data),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password/', { email }),
  verifyResetOtp: (email: string, code: string) =>
    api.post('/auth/verify-reset-otp/', { email, code }),
  resetPassword: (reset_token: string, password: string) =>
    api.post('/auth/reset-password/', { reset_token, password }),
}

export const accountsApi = {
  list: (params?: object) => api.get('/accounts/', { params }),
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
  remove: (id: number) => api.delete(`/receivables/${id}/`),
}

export const payablesApi = {
  list: () => api.get('/payables/'),
  create: (data: object) => api.post('/payables/', data),
  update: (id: number, data: object) => api.patch(`/payables/${id}/`, data),
  remove: (id: number) => api.delete(`/payables/${id}/`),
}

export const dashboardApi = {
  get: () => api.get('/dashboard/'),
}

export const forecastApi = {
  get: (year: number, month: number) => api.get(`/forecast/${year}/${month}/`),
}

export const householdsApi = {
  list: () => api.get('/households/'),
  create: (data: object) => api.post('/households/', data),
  get: (id: number) => api.get(`/households/${id}/`),
  update: (id: number, data: object) => api.patch(`/households/${id}/`, data),
  remove: (id: number) => api.delete(`/households/${id}/`),
  members: (id: number) => api.get(`/households/${id}/members/`),
  leave: (id: number) => api.post(`/households/${id}/leave/`),
  removeMember: (householdId: number, memberId: number) =>
    api.post(`/households/${householdId}/members/${memberId}/remove/`),
  setMemberRole: (householdId: number, memberId: number, role: string) =>
    api.post(`/households/${householdId}/members/${memberId}/set-role/`, { role }),
  getInvite: (id: number) => api.get(`/households/${id}/invites/`),
  regenerateInvite: (id: number) => api.post(`/households/${id}/invites/`),
  revokeInvite: (id: number) => api.post(`/households/${id}/invites/revoke/`),
  inviteByEmail: (id: number, email: string) => api.post(`/households/${id}/invite-by-email/`, { email }),
  ledgers: (id: number) => api.get(`/households/${id}/ledgers/`),
  createLedger: (id: number, data: object) => api.post(`/households/${id}/ledgers/`, data),
  updateLedger: (ledgerId: number, data: object) => api.patch(`/household-ledgers/${ledgerId}/`, data),
  removeLedger: (ledgerId: number) => api.delete(`/household-ledgers/${ledgerId}/`),
  openLedgers: () => api.get('/household-ledgers/', { params: { status: 'open' } }),
  closeLedger: (ledgerId: number) => api.post(`/household-ledgers/${ledgerId}/close/`),
  reopenLedger: (ledgerId: number) => api.post(`/household-ledgers/${ledgerId}/reopen/`),
  ledgerSummary: (ledgerId: number) => api.get(`/household-ledgers/${ledgerId}/summary/`),
  ledgerReport: (ledgerId: number, params?: { year?: number; month?: number }) =>
    api.get(`/household-ledgers/${ledgerId}/report/`, { params }),
  ledgerContributions: (ledgerId: number) =>
    api.get(`/household-ledgers/${ledgerId}/contributions/`),
  addContribution: (ledgerId: number, data: object) =>
    api.post(`/household-ledgers/${ledgerId}/contributions/`, data),
  removeContribution: (id: number) => api.delete(`/household-contributions/${id}/`),
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
  updateExpense: (id: number, data: object) => api.patch(`/household-expenses/${id}/`, data),
  removeExpense: (id: number) => api.delete(`/household-expenses/${id}/`),
  notifications: (params?: object) => api.get('/household-notifications/', { params }),
  unreadNotificationCount: () => api.get('/household-notifications/unread_count/'),
  markNotificationRead: (id: number) => api.post(`/household-notifications/${id}/mark_read/`),
  markAllNotificationsRead: () => api.post('/household-notifications/mark_all_read/'),
}

export const travelApi = {
  get: () => api.get('/travel-mode/'),
  set: (data: object) => api.put('/travel-mode/', data),
}

export const fxApi = {
  quote: (base: string, quote = 'PKR', refresh = false) =>
    api.get('/fx/', { params: { base, quote, refresh: refresh ? '1' : undefined } }),
}

export const peopleApi = {
  list: () => api.get('/people/'),
  create: (data: { name: string }) => api.post('/people/', data),
  update: (id: number, data: object) => api.patch(`/people/${id}/`, data),
  remove: (id: number) => api.delete(`/people/${id}/`),
  action: (data: object) => api.post('/people/actions/', data),
  updatePair: (pairId: string, data: object) =>
    api.patch(`/people/pairs/${encodeURIComponent(pairId)}/`, data),
  removePair: (pairId: string) =>
    api.delete(`/people/pairs/${encodeURIComponent(pairId)}/`),
  history: (id: number, params?: { year?: number; month?: number }) =>
    api.get(`/people/${id}/history/`, { params }),
  // Phase G/I — linked people
  linkCode: () => api.get('/people/link-code/'),
  regenerateLinkCode: () => api.post('/people/link-code/'),
  invite: (data: { query: string; display_name?: string; existing_person_id?: number }) =>
    api.post('/people/invitations/', data),
  joinByCode: (data: { code: string; display_name?: string; existing_person_id?: number }) =>
    api.post('/people/invitations/join/', data),
  pendingInvites: () => api.get('/people/invitations/pending/'),
  acceptInvite: (id: number) => api.post(`/people/invitations/${id}/accept/`),
  declineInvite: (id: number) => api.post(`/people/invitations/${id}/decline/`),
  cancelInvite: (id: number) => api.post(`/people/invitations/${id}/cancel/`),
  links: () => api.get('/people/links/'),
  unlink: (id: number) => api.post(`/people/links/${id}/unlink/`),
  propose: (data: object) => api.post('/people/proposals/', data),
  pendingProposals: () => api.get('/people/proposals/pending/'),
  acceptProposal: (id: number, data: { wallet_id: number }) =>
    api.post(`/people/proposals/${id}/accept/`, data),
  declineProposal: (id: number) => api.post(`/people/proposals/${id}/decline/`),
  notifications: () => api.get('/people/notifications/'),
  markNotificationRead: (id: number) => api.post(`/people/notifications/${id}/mark_read/`),
  markAllNotificationsRead: () => api.post('/people/notifications/mark_all_read/'),
}

