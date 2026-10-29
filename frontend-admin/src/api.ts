import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

function normalizeApiRoot(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/$/, '')
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value.replace(/^\/+/, '')}`
}

const API_ROOT = normalizeApiRoot(import.meta.env.VITE_API_URL)
const API_BASE = API_ROOT ? `${API_ROOT}/api` : '/api'

const TOKEN_KEY = 'wallettrails_ops_access'
const REFRESH_KEY = 'wallettrails_ops_refresh'

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

let refreshPromise: Promise<string | null> | null = null

async function refreshAccess(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh) return null
  try {
    const { data } = await axios.post<{ access: string }>(`${API_BASE}/ops/auth/refresh/`, { refresh })
    localStorage.setItem(TOKEN_KEY, data.access)
    return data.access
  } catch {
    clearOpsTokens()
    return null
  }
}

opsApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const url = String(original?.url || '')
    if (error.response?.status !== 401 || !original || original._retry || url.includes('/ops/auth/')) {
      return Promise.reject(error)
    }
    original._retry = true
    refreshPromise ??= refreshAccess().finally(() => {
      refreshPromise = null
    })
    const access = await refreshPromise
    if (!access) return Promise.reject(error)
    original.headers.Authorization = `Bearer ${access}`
    return opsApi(original)
  },
)

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

export type OpsRole = 'owner' | 'admin' | 'support' | 'marketing' | 'viewer'

export type OpsMe = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_staff: boolean
  is_superuser: boolean
  role?: OpsRole
  capabilities?: string[]
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

export type SummaryCounts = {
  signups: number
  active_users: number
  records_created: number
  support_opened: number
  premium_started: number
  campaigns_sent: number
}

export type AttentionItem = {
  kind: 'support' | 'purchase' | 'campaign'
  id: number
  title: string
  detail: string
  tone: 'danger' | 'warn' | 'info'
  at: string | null
  to: string
}

export type OpsDashboardSummary = {
  range: { from: string; to: string; days: number; previous_from: string | null; previous_to: string | null }
  current: SummaryCounts
  previous: SummaryCounts | null
  series: { date: string; signups: number; active_users: number; records_created: number }[]
  snapshot: {
    total_users: number
    active_7d: number
    suspended: number
    users_with_push: number
    premium_live: number
    support_open: number
    support_waiting_ops: number
    inactivity: { none: number; '7d': number; '30d': number; '90d': number; unflagged: number }
    platforms: { android: number; ios: number; web: number; other: number }
  }
  needs_attention: {
    counts: { support: number; purchases: number; campaigns: number }
    items: AttentionItem[]
  }
  generated_at: string
}

type CountWindow = { total: number; new: number; previous_new: number }
type Growth = { current: number; previous: number; absolute_change: number; percent_change: number | null }

/** analytics_agent report as served by Ops — money fields are removed server-side. */
export type AnalyticsReport = {
  generated_at: string
  schedule: { cron: string; timezone: string }
  period: {
    timezone: string
    days: number
    start: string
    end: string
    previous_start: string
    previous_end: string
    label: string
  }
  metrics: {
    records: Record<string, CountWindow>
    users: {
      active_1d: number
      active_7d: number
      active_30d: number
      suspended: number
      onboarding_complete: number
      onboarding_incomplete: number
      new_24h: number
      new_7d: number
      inactivity: Record<string, number>
      premium_live: number
      push_tokens: number
      users_with_push: number
    }
    activity: {
      daily: { date: string; transactions: number; signups: number }[]
      weekly: { week: string; transactions: number; signups: number }[]
      monthly: { month: string; transactions: number; signups: number }[]
    }
    growth: Record<string, Growth>
    breakdowns: Record<string, Record<string, number>>
    support: { open: number; waiting_ops: number; waiting_user: number }
    households: { total: number; memberships_by_status: Record<string, number> }
    budgets: { current_month: number; overall_caps_current_month: number }
    features: { travel_mode_enabled: number; bank_sms_settings_enabled: number }
  }
  trends: {
    anomaly_rule: string
    direction: Record<string, 'up' | 'down' | 'flat'>
    anomalies: {
      date: string
      metric: string
      value: number
      baseline_mean: number
      z_score: number | null
      direction: 'high' | 'low'
    }[]
  }
  insights: { source: 'llm' | 'rules'; summary: string; highlights: string[] }
  status: { state: 'ok' | 'partial'; read_only: boolean; warnings: string[] }
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
  const { data } = await opsApi.post<{ access: string; refresh: string }>('/ops/auth/login/', {
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

export type TeamMember = {
  id: number
  username: string
  email: string
  role: OpsRole
  is_superuser: boolean
}

export async function fetchTeam() {
  const { data } = await opsApi.get<{ results: TeamMember[] }>('/ops/team/')
  return data.results
}

export async function saveTeamMember(payload: { username: string; email?: string; role: OpsRole; password?: string }) {
  const { data } = await opsApi.post<TeamMember>('/ops/team/', payload)
  return data
}

export async function setTeamRole(userId: number, role: OpsRole) {
  const { data } = await opsApi.patch<TeamMember>(`/ops/team/${userId}/`, { role })
  return data
}

export async function revokeTeamMember(userId: number) {
  await opsApi.post(`/ops/team/${userId}/`)
}

export type IntegrationCard = {
  provider: 'ga4' | 'instagram' | 'facebook' | 'linkedin'
  label: string
  id: number | null
  status: 'not_setup' | 'connected' | 'needs_reconnect' | 'error'
  display_name: string
  external_id: string
  token_expires_at: string | null
  last_sync_at: string | null
  last_error: string
  connected_at: string | null
  scopes: string[]
}

export async function fetchIntegrations() {
  const { data } = await opsApi.get<{ results: IntegrationCard[] }>('/ops/integrations/')
  return data.results
}

export async function connectIntegration(provider: string) {
  const { data } = await opsApi.post<IntegrationCard & { detail?: string }>(`/ops/integrations/${provider}/connect/`)
  return data
}

export async function syncIntegration(id: number) {
  const { data } = await opsApi.post<IntegrationCard & { rows_written?: number }>(`/ops/integrations/${id}/sync/`)
  return data
}

export async function disconnectIntegration(id: number) {
  const { data } = await opsApi.post<IntegrationCard>(`/ops/integrations/${id}/disconnect/`)
  return data
}

export async function uploadLinkedInRows(rows: { metric: string; date: string; value: number }[]) {
  const { data } = await opsApi.post<IntegrationCard & { rows_written?: number }>('/ops/integrations/linkedin/upload/', { rows })
  return data
}

export async function fetchOpsDashboard() {
  const { data } = await opsApi.get<OpsDashboard>('/ops/dashboard/')
  return data
}

export async function fetchDashboardSummary(params: { from: string; to: string; compare?: number }) {
  const { data } = await opsApi.get<OpsDashboardSummary>('/ops/dashboard/summary/', { params })
  return data
}

export async function fetchAnalyticsReport() {
  const { data } = await opsApi.get<AnalyticsReport>('/ops/reports/analytics/')
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
  target_user_id: number | null
  target_username: string | null
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
  deliveries?: {
    id: number
    user_id: number
    username: string
    email: string
    platform: string
    status: string
    error: string
  }[]
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
  user_id?: number
  data?: { route?: string }
  scheduled_at?: string | null
}) {
  const { data } = await opsApi.post<OpsCampaign>('/ops/campaigns/', payload)
  return data
}

export type CampaignRecipient = {
  id: number
  username: string
  email: string
  has_push: boolean
}

export async function searchCampaignRecipients(q: string) {
  const { data } = await opsApi.get<{ results: CampaignRecipient[] }>('/ops/campaigns/recipients/', { params: { q } })
  return data.results
}

export async function estimateCampaignAudience(audience: string, userId?: number) {
  const { data } = await opsApi.get<CampaignEstimate>('/ops/campaigns/estimate/', {
    params: { audience, user_id: audience === 'user' ? userId : undefined },
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
  a.download = 'wallettrails_users.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export type WebsiteTotals = {
  users: number
  new_users: number
  sessions: number
  engaged_sessions: number
  engagement_rate: number
  avg_engagement_seconds: number
  get_app_clicks: number
}

export type WebsiteReport = {
  configured: boolean
  status: string
  last_sync_at: string | null
  last_error: string
  from: string
  to: string
  totals: WebsiteTotals
  previous: WebsiteTotals | null
  series: { date: string; users: number; new_users: number; sessions: number; get_app_clicks: number }[]
  pages: { label: string; value: number }[]
  sources: { label: string; value: number }[]
  countries: { label: string; value: number }[]
  devices: { label: string; value: number }[]
  events: { label: string; value: number }[]
}

export type WebsiteRealtime = {
  configured: boolean
  active_users: number | null
  cached: boolean
  detail?: string
}

export async function fetchWebsite(params: { from: string; to: string; compare?: number }) {
  const { data } = await opsApi.get<WebsiteReport>('/ops/growth/website/', { params })
  return data
}

export async function fetchWebsiteRealtime() {
  const { data } = await opsApi.get<WebsiteRealtime>('/ops/growth/website/realtime/')
  return data
}

export type TrackedLinkRow = {
  id: number
  label: string
  destination: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string
  url: string
  created_at: string
}

export async function fetchTrackedLinks() {
  const { data } = await opsApi.get<{ results: TrackedLinkRow[] }>('/ops/links/')
  return data.results
}

export async function createTrackedLink(payload: {
  label: string
  destination: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
}) {
  const { data } = await opsApi.post<TrackedLinkRow>('/ops/links/', payload)
  return data
}
