'use no memo'

/** Shared WalletTrails Android widget look + responsive scale helpers. */

export type WidgetSize = {
  width?: number
  height?: number
}

export const W = {
  bg: '#042f36',
  bgDeep: '#021c22',
  panel: '#0a4550',
  panelSoft: '#0d5560',
  accent: '#10b981',
  accentSoft: '#6ee7b7',
  mint: '#a7f3d0',
  white: '#ffffff',
  muted: '#94a3b8',
  danger: '#fb7185',
  border: '#134e4a',
} as const

export function widgetLayout(size?: WidgetSize) {
  const width = Math.max(1, size?.width ?? 180)
  const height = Math.max(1, size?.height ?? 110)
  const compact = height < 95 || width < 150
  const micro = height < 80 || width < 120
  const tall = height >= 170
  const wide = width >= 260
  const pad = micro ? 8 : compact ? 10 : 14
  const radius = micro ? 14 : compact ? 16 : 20
  const brand = micro ? 10 : compact ? 11 : 12
  const label = micro ? 9 : compact ? 10 : 11
  const hero = micro
    ? 18
    : compact
      ? 22
      : Math.min(34, Math.max(24, Math.round(width / 7.2)))
  const body = compact ? 12 : 13
  const maxWallets = tall ? 4 : height >= 140 ? 3 : 2

  return {
    width,
    height,
    compact,
    micro,
    tall,
    wide,
    pad,
    radius,
    brand,
    label,
    hero,
    body,
    maxWallets,
  }
}

export function truncate(text: string, max = 18): string {
  const t = (text || '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1))}…`
}

/** Approximate bar weights for month flow (Android RemoteViews can't do %). */
export function flowWeights(income: number, expense: number): { inW: number; outW: number } {
  const i = Math.max(0, income)
  const e = Math.max(0, expense)
  const total = i + e
  if (total <= 0) return { inW: 1, outW: 1 }
  const inW = Math.max(1, Math.round((i / total) * 20))
  const outW = Math.max(1, 20 - inW)
  return { inW, outW }
}
