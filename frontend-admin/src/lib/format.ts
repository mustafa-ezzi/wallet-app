import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'

const numberFormat = new Intl.NumberFormat('en-US')

export function formatNumber(value: number | null | undefined): string {
  return typeof value === 'number' ? numberFormat.format(value) : '—'
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = typeof value === 'string' ? parseISO(value) : value
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, 'd MMM yyyy') : '—'
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, 'd MMM yyyy, HH:mm') : '—'
}

/** "3 days ago" / "in 2 hours". */
export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? formatDistanceToNowStrict(date, { addSuffix: true }) : '—'
}

export function shortDay(value: string): string {
  const date = toDate(value)
  return date ? format(date, 'd MMM') : value
}

export function initials(name: string): string {
  const parts = name.replace(/[@._-]+/g, ' ').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function displayName(user: { first_name?: string; last_name?: string; username: string }): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username
}
