import * as SecureStore from 'expo-secure-store'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Platform } from 'react-native'
import api from '@/src/api/client'
import { useAuth } from '@/src/context/AuthContext'

const CACHE_KEY = 'cashtrail_remote_config_v1'

export type AdsConfig = {
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

export type PremiumStatus = {
  is_premium: boolean
  product_id: string | null
  source: string | null
  status: string
  started_at: string | null
  expires_at: string | null
}

export type RemoteConfig = {
  ads: AdsConfig
  feature_flags: Record<string, unknown>
  min_supported_version: string
  store_url: string
  maintenance_message: string
  viewer: { is_premium: boolean }
  updated_at: string | null
}

const DEFAULT_ADS: AdsConfig = {
  ads_enabled: true,
  banner_enabled: true,
  interstitial_enabled: false,
  rewarded_enabled: false,
  premium_hides_ads: true,
  effective_show_ads: true,
  units: {
    android_banner: 'ca-app-pub-3940256099942544/6300978111',
    android_interstitial: 'ca-app-pub-3940256099942544/1033173712',
    android_rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  rules: {
    show_after_sessions: 3,
    interstitial_min_interval_sec: 180,
    countries: ['PK'],
  },
  test_device_ids: [],
}

const DEFAULT_CONFIG: RemoteConfig = {
  ads: DEFAULT_ADS,
  feature_flags: {},
  min_supported_version: '',
  store_url: '',
  maintenance_message: '',
  viewer: { is_premium: false },
  updated_at: null,
}

const FREE_PREMIUM: PremiumStatus = {
  is_premium: false,
  product_id: null,
  source: null,
  status: 'free',
  started_at: null,
  expires_at: null,
}

type Ctx = {
  config: RemoteConfig
  premium: PremiumStatus
  loading: boolean
  refresh: () => Promise<void>
  shouldShowAds: boolean
}

const RemoteConfigContext = createContext<Ctx | null>(null)

function mergeConfig(raw: Partial<RemoteConfig> | null | undefined): RemoteConfig {
  const adsIn = raw?.ads
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    ads: {
      ...DEFAULT_ADS,
      ...(adsIn || {}),
      units: { ...DEFAULT_ADS.units, ...(adsIn?.units || {}) },
      rules: { ...DEFAULT_ADS.rules, ...(adsIn?.rules || {}) },
    },
    viewer: raw?.viewer || { is_premium: false },
  }
}

async function cacheGet(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return null
      return localStorage.getItem(CACHE_KEY)
    }
    return await SecureStore.getItemAsync(CACHE_KEY)
  } catch {
    return null
  }
}

async function cacheSet(value: string) {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(CACHE_KEY, value)
      return
    }
    await SecureStore.setItemAsync(CACHE_KEY, value)
  } catch {
    /* ignore */
  }
}

export function RemoteConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [config, setConfig] = useState<RemoteConfig>(DEFAULT_CONFIG)
  const [premium, setPremium] = useState<PremiumStatus>(FREE_PREMIUM)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: cfg }, premiumRes] = await Promise.all([
        api.get<RemoteConfig>('/config/'),
        user
          ? api.get<PremiumStatus>('/premium/').then((r) => r.data).catch(() => FREE_PREMIUM)
          : Promise.resolve(FREE_PREMIUM),
      ])
      const next = mergeConfig(cfg)
      setConfig(next)
      setPremium(premiumRes)
      await cacheSet(JSON.stringify({ config: next, premium: premiumRes }))
    } catch {
      /* keep cache / defaults */
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = await cacheGet()
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as { config?: RemoteConfig; premium?: PremiumStatus }
          if (parsed.config) setConfig(mergeConfig(parsed.config))
          if (parsed.premium) setPremium(parsed.premium)
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const shouldShowAds =
    Boolean(config.ads?.effective_show_ads)
    && !premium.is_premium
    && Boolean(config.ads?.banner_enabled)

  const value = useMemo(
    () => ({ config, premium, loading, refresh, shouldShowAds }),
    [config, premium, loading, refresh, shouldShowAds],
  )

  return <RemoteConfigContext.Provider value={value}>{children}</RemoteConfigContext.Provider>
}

export function useRemoteConfig() {
  const ctx = useContext(RemoteConfigContext)
  if (!ctx) throw new Error('useRemoteConfig must be used within RemoteConfigProvider')
  return ctx
}
