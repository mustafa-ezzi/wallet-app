import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { apiErrorMessage, fxApi, travelApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { foreignToPkr, formatRateLine, todayISO } from './currencies'

export type TravelModeState = {
  enabled: boolean
  travel_currency: string
  rate: number | string | null
  rate_as_of?: string | null
  rate_source?: string
  start_date?: string | null
  end_date?: string | null
  updated_at?: string
  created_at?: string
}

export type FxQuote = {
  base: string
  quote: string
  rate: string
  as_of: string
  source: string
  stale: boolean
  warning?: string
}

const CACHE_KEY = 'wallettrails_travel_mode_v1'
const RATE_REFRESH_KEY = 'wallettrails_travel_rate_refreshed_day'

const EMPTY: TravelModeState = {
  enabled: false,
  travel_currency: '',
  rate: null,
  rate_as_of: null,
  rate_source: '',
  start_date: null,
  end_date: null,
}

type TravelModeContextValue = {
  travel: TravelModeState
  loading: boolean
  saving: boolean
  error: string
  refresh: () => Promise<void>
  setTravel: (payload: Record<string, unknown>) => Promise<TravelModeState>
  fetchQuote: (base: string, refresh?: boolean) => Promise<FxQuote>
  isActive: boolean
  currency: string
  rate: number
  rateLine: string
  toPkr: (foreignAmount: number) => number
  /** Phase F: trip end_date has passed while still enabled */
  tripEnded: boolean
  dismissTripEnded: () => void
  tripEndedDismissed: boolean
}

const TravelModeContext = createContext<TravelModeContextValue | null>(null)

function readCache(): TravelModeState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TravelModeState
  } catch {
    return null
  }
}

function writeCache(state: TravelModeState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function TravelModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [travel, setTravelState] = useState<TravelModeState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tripEndedDismissed, setTripEndedDismissed] = useState(false)
  const dailyRefreshDone = useRef(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setTravelState(EMPTY)
      setLoading(false)
      return
    }
    setError('')
    try {
      const { data } = await travelApi.get()
      const next = { ...EMPTY, ...data }
      setTravelState(next)
      writeCache(next)
    } catch (err) {
      const cached = readCache()
      if (cached) setTravelState({ ...EMPTY, ...cached })
      else setError(apiErrorMessage(err, 'Could not load Travel Mode.'))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cached = readCache()
      if (!cancelled && cached) setTravelState({ ...EMPTY, ...cached })
      if (!cancelled) await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const setTravel = useCallback(async (payload: Record<string, unknown>) => {
    setSaving(true)
    setError('')
    try {
      const { data } = await travelApi.set(payload)
      const next = { ...EMPTY, ...data }
      setTravelState(next)
      writeCache(next)
      if (payload.enabled === false) setTripEndedDismissed(false)
      return next
    } catch (err) {
      const msg = apiErrorMessage(err, 'Could not update Travel Mode.')
      setError(msg)
      throw new Error(msg)
    } finally {
      setSaving(false)
    }
  }, [])

  const fetchQuote = useCallback(async (base: string, force = false) => {
    const { data } = await fxApi.quote(base, 'PKR', force)
    return data as FxQuote
  }, [])

  const rate = Number(travel.rate)
  const isActive = Boolean(
    travel.enabled
    && travel.travel_currency
    && Number.isFinite(rate)
    && rate > 0,
  )
  const currency = isActive ? travel.travel_currency.toUpperCase() : ''
  const rateLine = isActive ? formatRateLine(currency, rate) : ''

  const tripEnded = Boolean(
    travel.enabled
    && travel.end_date
    && travel.end_date < todayISO(),
  )

  // Phase F: once per local day, soft-refresh trip rate while active (never rewrites old txs).
  useEffect(() => {
    if (!user || !isActive || dailyRefreshDone.current) return
    const day = todayISO()
    try {
      if (localStorage.getItem(RATE_REFRESH_KEY) === day) {
        dailyRefreshDone.current = true
        return
      }
    } catch {
      /* ignore */
    }
    dailyRefreshDone.current = true
    ;(async () => {
      try {
        const q = await fetchQuote(currency, true)
        const nextRate = Number(q.rate)
        if (!(nextRate > 0)) return
        await setTravel({
          enabled: true,
          travel_currency: currency,
          rate: nextRate,
          rate_source: q.stale ? 'cached' : 'live',
          start_date: travel.start_date ?? null,
          end_date: travel.end_date ?? null,
        })
        localStorage.setItem(RATE_REFRESH_KEY, day)
      } catch {
        /* keep existing trip rate */
      }
    })()
  }, [user, isActive, currency, fetchQuote, setTravel, travel.start_date, travel.end_date])

  const value = useMemo<TravelModeContextValue>(() => ({
    travel,
    loading,
    saving,
    error,
    refresh,
    setTravel,
    fetchQuote,
    isActive,
    currency,
    rate: isActive ? rate : 0,
    rateLine,
    toPkr: (foreignAmount: number) => (isActive ? foreignToPkr(foreignAmount, rate) : foreignAmount),
    tripEnded,
    dismissTripEnded: () => setTripEndedDismissed(true),
    tripEndedDismissed,
  }), [
    travel, loading, saving, error, refresh, setTravel, fetchQuote,
    isActive, currency, rate, rateLine, tripEnded, tripEndedDismissed,
  ])

  return (
    <TravelModeContext.Provider value={value}>
      {children}
    </TravelModeContext.Provider>
  )
}

export function useTravelMode() {
  const ctx = useContext(TravelModeContext)
  if (!ctx) throw new Error('useTravelMode must be used within TravelModeProvider')
  return ctx
}
