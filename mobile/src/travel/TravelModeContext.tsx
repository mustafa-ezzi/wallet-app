import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { apiErrorMessage, fxApi, travelApi } from '@/src/api/client'
import type { FxQuote, TravelModeState } from '@/src/api/types'
import { useAuth } from '@/src/context/AuthContext'
import { foreignToPkr, formatRateLine } from '@/src/travel/currencies'

const CACHE_KEY = 'wallettrails_travel_mode_v1'

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
}

const TravelModeContext = createContext<TravelModeContextValue | null>(null)

async function readCache(): Promise<TravelModeState | null> {
  try {
    const raw = Platform.OS === 'web'
      ? (typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null)
      : await SecureStore.getItemAsync(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TravelModeState
  } catch {
    return null
  }
}

async function writeCache(state: TravelModeState) {
  try {
    const raw = JSON.stringify(state)
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(CACHE_KEY, raw)
      return
    }
    await SecureStore.setItemAsync(CACHE_KEY, raw)
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
      await writeCache(next)
    } catch (err) {
      const cached = await readCache()
      if (cached) setTravelState({ ...EMPTY, ...cached })
      else setError(apiErrorMessage(err, 'Could not load Travel Mode.'))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cached = await readCache()
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
      await writeCache(next)
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
  }), [
    travel, loading, saving, error, refresh, setTravel, fetchQuote,
    isActive, currency, rate, rateLine,
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
