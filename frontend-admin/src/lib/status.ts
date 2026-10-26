import type { BadgeTone } from '../components/ui'

type StatusMeta = { label: string; tone: BadgeTone }

function lookup(map: Record<string, StatusMeta>, key: string): StatusMeta {
  return map[key] ?? { label: key.replace(/_/g, ' '), tone: 'neutral' }
}

const INACTIVITY: Record<string, StatusMeta> = {
  none: { label: 'Active', tone: 'success' },
  '7d': { label: 'Inactive 7d', tone: 'warn' },
  '30d': { label: 'Inactive 30d', tone: 'warn' },
  '90d': { label: 'Inactive 90d', tone: 'danger' },
}
export const inactivityStatus = (tier: string) => lookup(INACTIVITY, tier)

const CAMPAIGN: Record<string, StatusMeta> = {
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  sending: { label: 'Sending', tone: 'warn' },
  sent: { label: 'Sent', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}
export const campaignStatus = (status: string) => lookup(CAMPAIGN, status)

const DELIVERY: Record<string, StatusMeta> = {
  ok: { label: 'Delivered', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warn' },
}
export const deliveryStatus = (status: string) => lookup(DELIVERY, status)

const SUPPORT: Record<string, StatusMeta> = {
  waiting_ops: { label: 'Needs reply', tone: 'warn' },
  waiting_user: { label: 'Waiting on user', tone: 'info' },
  open: { label: 'Open', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
}
export const supportStatus = (status: string) => lookup(SUPPORT, status)

const ENTITLEMENT: Record<string, StatusMeta> = {
  active: { label: 'Past expiry', tone: 'warn' },
  expired: { label: 'Expired', tone: 'neutral' },
  revoked: { label: 'Revoked', tone: 'danger' },
  pending: { label: 'Pending', tone: 'warn' },
}
export function entitlementStatus(status: string, isLive: boolean): StatusMeta {
  return isLive ? { label: 'Live', tone: 'success' } : lookup(ENTITLEMENT, status)
}

export const PRODUCT_LABELS: Record<string, string> = {
  premium_monthly: 'Monthly',
  premium_yearly: 'Yearly',
  premium_lifetime: 'Lifetime',
}
export const productLabel = (id: string | null | undefined) => (id ? (PRODUCT_LABELS[id] ?? id) : '—')

export const SOURCE_LABELS: Record<string, string> = {
  play: 'Google Play',
  manual_grant: 'Manual grant',
  promo: 'Promo',
}

export const AUDIENCES = [
  { value: 'all', label: 'All opted-in users with a device' },
  { value: 'android', label: 'Android only' },
  { value: 'inactive_7d', label: 'Inactive 7d+' },
  { value: 'inactive_30d', label: 'Inactive 30d+' },
  { value: 'inactive_90d', label: 'Inactive 90d+' },
]
export const audienceLabel = (value: string) => AUDIENCES.find((a) => a.value === value)?.label ?? value

export const SUPPORT_CATEGORIES: Record<string, string> = {
  billing: 'Billing / Premium',
  bug: 'Bug',
  account: 'Account',
  other: 'Other',
}
