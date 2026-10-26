import { differenceInCalendarDays, format, startOfDay, subDays } from 'date-fns'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'custom'

export type DateRange = {
  preset: RangePreset
  from: Date
  to: Date
  compare: boolean
}

export const RANGE_PRESETS: { value: Exclude<RangePreset, 'custom'>; label: string; days: number }[] = [
  { value: 'today', label: 'Today', days: 1 },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
]

const STORAGE_KEY = 'wallettrails_ops_range'

export function rangeForPreset(preset: Exclude<RangePreset, 'custom'>, compare: boolean): DateRange {
  const days = RANGE_PRESETS.find((p) => p.value === preset)?.days ?? 30
  const to = startOfDay(new Date())
  return { preset, from: subDays(to, days - 1), to, compare }
}

/** The equal-length window immediately before `range`, used for "vs previous period". */
export function previousPeriod(range: DateRange): { from: Date; to: Date } {
  const days = differenceInCalendarDays(range.to, range.from) + 1
  return { from: subDays(range.from, days), to: subDays(range.from, 1) }
}

export function formatRange(range: DateRange): string {
  const preset = RANGE_PRESETS.find((p) => p.value === range.preset)
  if (preset) return preset.label
  const sameYear = range.from.getFullYear() === range.to.getFullYear()
  return `${format(range.from, sameYear ? 'd MMM' : 'd MMM yyyy')} – ${format(range.to, 'd MMM yyyy')}`
}

/** API-friendly params (YYYY-MM-DD) for endpoints that accept a date range. */
export function rangeParams(range: DateRange) {
  return {
    from: format(range.from, 'yyyy-MM-dd'),
    to: format(range.to, 'yyyy-MM-dd'),
    compare: range.compare ? 1 : undefined,
  }
}

function readStored(): DateRange {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as
      | { preset?: RangePreset; from?: string; to?: string; compare?: boolean }
      | null
    if (raw?.preset && raw.preset !== 'custom') return rangeForPreset(raw.preset, raw.compare ?? true)
    if (raw?.preset === 'custom' && raw.from && raw.to) {
      return { preset: 'custom', from: new Date(raw.from), to: new Date(raw.to), compare: raw.compare ?? true }
    }
  } catch {
    /* fall through to default */
  }
  return rangeForPreset('30d', true)
}

type DateRangeState = {
  range: DateRange
  setRange: (range: DateRange) => void
}

const DateRangeContext = createContext<DateRangeState | null>(null)

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<DateRange>(readStored)

  const value = useMemo<DateRangeState>(
    () => ({
      range,
      setRange: (next) => {
        setRangeState(next)
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...next, from: next.from.toISOString(), to: next.to.toISOString() }),
          )
        } catch {
          /* ignore */
        }
      },
    }),
    [range],
  )

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange outside DateRangeProvider')
  return ctx
}
