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
  premium?: {
    live: number
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
  premium?: {
    is_premium: boolean
    product_id: string | null
    source: string | null
    status: string
    started_at: string | null
    expires_at: string | null
  }
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

export async function deleteOpsUser(id: number, confirmUsername: string) {
  const { data } = await opsApi.post<{
    ok: boolean
    deleted: {
      user_id: number
      username: string
      accounts: number
      people_proposals: number
      household_expenses: number
      household_contributions: number
      household_settlements: number
      households_removed: number
      memberships_removed: number
    }
  }>(`/ops/users/${id}/delete/`, { confirm_username: confirmUsername })
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

export async function deleteCampaign(id: number) {
  await opsApi.delete(`/ops/campaigns/${id}/`)
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

export type OpsEntitlement = {
  id: number
  user_id: number
  username: string | null
  email: string
  product_id: string
  source: string
  status: string
  is_live: boolean
  started_at: string | null
  expires_at: string | null
  order_id: string
  note: string
  granted_by_id: number | null
  granted_by_username: string | null
  created_at: string | null
  updated_at: string | null
}

export type PremiumStats = {
  live_premium: number
  live_monthly: number
  live_yearly: number
  live_lifetime: number
  manual_grants_live: number
  play_live: number
  pending_or_failed_purchases: number
  play_verify_configured: boolean
}

export type PurchaseQueueItem = {
  id: number
  user_id: number
  username: string
  email: string
  product_id: string
  order_id: string
  status: string
  error: string
  created_at: string | null
}

export type OpsRemoteConfig = {
  ads: {
    ads_enabled: boolean
    banner_enabled: boolean
    interstitial_enabled: boolean
    rewarded_enabled: boolean
    premium_hides_ads: boolean
    effective_show_ads: boolean
    units: {
      android_banner: string
      android_interstitial: string
      android_rewarded: string
    }
    rules: {
      show_after_sessions: number
      interstitial_min_interval_sec: number
      countries: string[]
    }
    test_device_ids: string[]
  }
  feature_flags: Record<string, unknown>
  min_supported_version: string
  store_url: string
  maintenance_message: string
  support_whatsapp?: string
  updated_at: string | null
  raw: {
    ads_enabled: boolean
    banner_enabled: boolean
    interstitial_enabled: boolean
    rewarded_enabled: boolean
    premium_hides_ads: boolean
    android_banner_unit: string
    android_interstitial_unit: string
    android_rewarded_unit: string
    show_after_sessions: number
    interstitial_min_interval_sec: number
    countries: string[]
    test_device_ids: string[]
    feature_flags: Record<string, unknown>
    min_supported_version: string
    store_url: string
    maintenance_message: string
    support_whatsapp?: string
    updated_by_id: number | null
    updated_by_username: string | null
  }
}

export async function fetchPremiumStats() {
  const { data } = await opsApi.get<PremiumStats>('/ops/premium/stats/')
  return data
}

export async function fetchEntitlements(params?: Record<string, string | number | undefined>) {
  const { data } = await opsApi.get<Paginated<OpsEntitlement>>('/ops/premium/', { params })
  return data
}

export async function grantPremium(payload: {
  user_id?: number
  username?: string
  product_id: string
  days?: number
  note?: string
  source?: 'manual_grant' | 'promo'
}) {
  const { data } = await opsApi.post<OpsEntitlement>('/ops/premium/grant/', payload)
  return data
}

export async function revokePremium(id: number) {
  const { data } = await opsApi.post<OpsEntitlement>(`/ops/premium/${id}/revoke/`)
  return data
}

export async function fetchPurchaseQueue(params?: Record<string, string | number | undefined>) {
  const { data } = await opsApi.get<Paginated<PurchaseQueueItem>>('/ops/premium/purchases/', { params })
  return data
}

export async function fetchOpsConfig() {
  const { data } = await opsApi.get<OpsRemoteConfig>('/ops/config/')
  return data
}

export async function patchOpsConfig(payload: Record<string, unknown>) {
  const { data } = await opsApi.patch<OpsRemoteConfig>('/ops/config/', payload)
  return data
}

export type OpsPromo = {
  id: number
  code: string
  product_id: string
  trial_days: number
  max_redemptions: number | null
  redemption_count: number
  active: boolean
  starts_at: string | null
  ends_at: string | null
  note: string
  is_valid_now: boolean
  created_by_username: string | null
  created_at: string | null
}

export type OpsAuditRow = {
  id: number
  action: string
  actor_id: number | null
  actor_username: string | null
  target_type: string
  target_id: string
  meta: Record<string, unknown>
  ip_address: string | null
  created_at: string | null
}

export async function fetchPromos(params?: Record<string, string | number | undefined>) {
  const { data } = await opsApi.get<Paginated<OpsPromo>>('/ops/promos/', { params })
  return data
}

export async function createPromo(payload: {
  code: string
  product_id: string
  trial_days: number
  max_redemptions?: number | null
  note?: string
  active?: boolean
}) {
  const { data } = await opsApi.post<OpsPromo>('/ops/promos/', payload)
  return data
}

export async function patchPromo(id: number, payload: Record<string, unknown>) {
  const { data } = await opsApi.patch<OpsPromo>(`/ops/promos/${id}/`, payload)
  return data
}

export async function fetchAuditLog(params?: Record<string, string | number | undefined>) {
  const { data } = await opsApi.get<Paginated<OpsAuditRow>>('/ops/audit/', { params })
  return data
}

export function usersExportUrl(params?: Record<string, string | undefined>) {
  const qs = new URLSearchParams()
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v)
    }
  }
  const q = qs.toString()
  return `${opsApi.defaults.baseURL}/ops/users/export/${q ? `?${q}` : ''}`
}

export async function downloadUsersCsv(params?: Record<string, string | undefined>) {
  const { data } = await opsApi.get<Blob>('/ops/users/export/', {
    params,
    responseType: 'blob',
  })
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = 'cashtrail_users.csv'
  a.click()
  URL.revokeObjectURL(url)
}
