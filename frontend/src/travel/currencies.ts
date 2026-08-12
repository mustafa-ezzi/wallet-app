/** Travel Mode currencies + helpers (web Phase E). */
export const TRAVEL_CURRENCIES = [
  { code: 'AED', country: 'United Arab Emirates' },
  { code: 'SAR', country: 'Saudi Arabia' },
  { code: 'USD', country: 'United States' },
  { code: 'EUR', country: 'Eurozone' },
  { code: 'GBP', country: 'United Kingdom' },
  { code: 'TRY', country: 'Turkey' },
  { code: 'MYR', country: 'Malaysia' },
  { code: 'THB', country: 'Thailand' },
  { code: 'CNY', country: 'China' },
  { code: 'QAR', country: 'Qatar' },
  { code: 'OMR', country: 'Oman' },
  { code: 'BHD', country: 'Bahrain' },
  { code: 'KWD', country: 'Kuwait' },
  { code: 'INR', country: 'India' },
] as const

export type TravelCurrencyCode = (typeof TRAVEL_CURRENCIES)[number]['code']

export function countryForCurrency(code: string): string {
  const hit = TRAVEL_CURRENCIES.find((c) => c.code === code.toUpperCase())
  return hit?.country ?? code.toUpperCase()
}

export function foreignToPkr(foreign: number, rate: number): number {
  return Math.round(foreign * rate * 100) / 100
}

export function formatRateLine(currency: string, rate: number | string | null | undefined): string {
  const r = Number(rate)
  if (!currency || !Number.isFinite(r) || r <= 0) return ''
  const pretty = r >= 10 ? r.toFixed(2) : r.toFixed(4)
  return `1 ${currency.toUpperCase()} = ${pretty} PKR`
}

export function formatForeignSubtitle(
  originalAmount?: number | string | null,
  originalCurrency?: string | null,
  fxRate?: number | string | null,
): string | null {
  const amt = Number(originalAmount)
  const cur = (originalCurrency || '').trim().toUpperCase()
  if (!cur || !Number.isFinite(amt) || amt <= 0) return null
  const rate = Number(fxRate)
  const rateBit = Number.isFinite(rate) && rate > 0 ? ` · ${formatRateLine(cur, rate)}` : ''
  return `${cur} ${amt.toLocaleString(undefined, { maximumFractionDigits: 2 })}${rateBit}`
}

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
