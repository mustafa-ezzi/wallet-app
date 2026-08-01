import axios from 'axios'

function normalizeApiRoot(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/$/, '')
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value.replace(/^\/+/, '')}`
}

const API_ROOT = normalizeApiRoot(import.meta.env.VITE_API_URL)
const API_BASE = API_ROOT ? `${API_ROOT}/api` : '/api'

const TOKEN_KEY = 'cashtrail_ops_access'
const REFRESH_KEY = 'cashtrail_ops_refresh'

export const opsApi = axios.create({
  baseURL: API_BASE,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

opsApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function getStoredAccessToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setOpsTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearOpsTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export type OpsMe = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_staff: boolean
  is_superuser: boolean
}

export type OpsDashboard = {
  users: {
    total: number
    new_24h: number
    new_7d: number
    new_30d: number
    active_7d: number
    suspended: number
  }
  push: {
    users_with_device: number
    total_tokens: number
  }
  inactivity: {
    tier_7d: number
    tier_30d: number
    tier_90d: number
  }
  volume_counts_only: {
    wallet_accounts: number
    transactions_30d: number
  }
  support?: {
    open: number
    waiting_ops: number
    waiting_user: number
  }
  generated_at: string
}

export type OpsUser = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  date_joined: string | null
  last_login: string | null
  last_seen_at: string | null
  is_active: boolean
  is_staff: boolean
  is_superuser?: boolean
  suspended: boolean
  suspended_at: string | null
  inactivity_tier: string
  marketing_opt_out: boolean
  wallet_count: number
  tx_count_30d: number
  device_count: number
  platforms: string[]
  push_enabled: boolean
  internal_notes?: string
  latest_device?: { platform: string; updated_at: string } | null
}

export type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export async function loginOps(username: string, password: string): Promise<OpsMe> {
  const { data } = await opsApi.post<{ access: string; refresh: string }>('/auth/login/', {
    username,
    password,
  })
  setOpsTokens(data.access, data.refresh)
  try {
    const me = await fetchOpsMe()
    return me
  } catch (err) {
    clearOpsTokens()
    throw err
  }
}

export async function fetchOpsMe() {
  const { data } = await opsApi.get<OpsMe>('/ops/me/')
  return data
}

export async function fetchOpsDashboard() {
  const { data } = await opsApi.get<OpsDashboard>('/ops/dashboard/')
  return data
}

export async function fetchOpsUsers(params: Record<string, string | number | undefined>) {
  const { data } = await opsApi.get<Paginated<OpsUser>>('/ops/users/', { params })
  return data
}

export async function fetchOpsUser(id: number) {
  const { data } = await opsApi.get<OpsUser>(`/ops/users/${id}/`)
  return data
}

export async function suspendOpsUser(id: number) {
  const { data } = await opsApi.post<OpsUser>(`/ops/users/${id}/suspend/`)
  return data
}

export async function unsuspendOpsUser(id: number) {
  const { data } = await opsApi.post<OpsUser>(`/ops/users/${id}/unsuspend/`)
  return data
}

export async function refreshInactivityFlags() {
  const { data } = await opsApi.post<{ updated: number }>('/ops/users/refresh-inactivity/')
  return data
}

export type OpsCampaign = {
  id: number
  title: string
  body: string
  data: Record<string, unknown>
  audience: string
  status: string
  scheduled_at: string | null
  sent_at: string | null
  recipient_estimate: number
  sent_ok: number
  sent_failed: number
  last_error: string
  created_by: number | null
  created_by_username: string | null
  created_at: string | null
  updated_at: string | null
  deliveries_summary?: {
    ok: number
    failed: number
    skipped: number
    pending: number
  }
}

export type CampaignEstimate = {
  audience: string
  users: number
  tokens: number
  campaigns_sent_today: number
  max_campaigns_per_day: number
}

export async function fetchCampaigns(params?: Record<string, string | number | undefined>) {
  const { data } = await opsApi.get<Paginated<OpsCampaign>>('/ops/campaigns/', { params })
  return data
}

export async function fetchCampaign(id: number) {
  const { data } = await opsApi.get<OpsCampaign>(`/ops/campaigns/${id}/`)
  return data
}

export async function createCampaign(payload: {
  title: string
  body: string
  audience: string
  data?: { route?: string }
  scheduled_at?: string | null
}) {
  const { data } = await opsApi.post<OpsCampaign>('/ops/campaigns/', payload)
  return data
}

export async function estimateCampaignAudience(audience: string) {
  const { data } = await opsApi.get<CampaignEstimate>('/ops/campaigns/estimate/', {
    params: { audience },
  })
  return data
}

export async function sendCampaign(id: number, opts: { confirm?: boolean; dry_run?: boolean }) {
  const { data } = await opsApi.post<{
    ok: boolean
    dry_run?: boolean
    users?: number
    tokens?: number
    sent_ok: number
    sent_failed: number
    detail?: string
    campaign: OpsCampaign
  }>(`/ops/campaigns/${id}/send/`, opts)
  return data
}

export async function cancelCampaign(id: number) {
  const { data } = await opsApi.post<OpsCampaign>(`/ops/campaigns/${id}/cancel/`)
  return data
}

export type SupportMessage = {
  id: number
  sender: 'user' | 'staff'
  author_id: number | null
  author_username: string | null
  body: string
  created_at: string | null
}

export type SupportThread = {
  id: number
  subject: string
  category: string
  status: string
  priority: string
  user_id: number
  username: string | null
  email: string
  created_at: string | null
  updated_at: string | null
  closed_at: string | null
  message_count: number | null
  last_message_preview?: string
  last_sender?: string | null
  messages?: SupportMessage[]
}

export async function fetchSupportThreads(params?: Record<string, string | number | undefined>) {
  const { data } = await opsApi.get<Paginated<SupportThread>>('/ops/support/', { params })
  return data
}

export async function fetchSupportThread(id: number) {
  const { data } = await opsApi.get<SupportThread>(`/ops/support/${id}/`)
  return data
}

export async function replySupportThread(
  id: number,
  payload: { body: string; close?: boolean },
) {
  const { data } = await opsApi.post<SupportThread>(`/ops/support/${id}/reply/`, payload)
  return data
}

export async function setSupportStatus(id: number, statusValue: string) {
  const { data } = await opsApi.post<SupportThread>(`/ops/support/${id}/status/`, {
    status: statusValue,
  })
  return data
}
