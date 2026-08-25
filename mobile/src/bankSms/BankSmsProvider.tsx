import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AppState, Platform } from 'react-native'
import { useAuth } from '@/src/context/AuthContext'
import { bankSmsApi } from '@/src/api/client'
import { ingestBankSmsBody } from './ingest'
import {
  getSmsPermissionGranted,
  isBankSmsNativeAvailable,
  openAppPermissionSettings,
  requestSmsPermission,
  startSmsBackgroundService,
  stopSmsBackgroundService,
  subscribeIncomingSms,
} from './nativeSms'
import {
  getBankSmsEnabled,
  getBankSmsPromptSeen,
  setBankSmsEnabled,
  setBankSmsPromptSeen,
} from './storage'

type BankSmsContextValue = {
  /** Feature enabled by user (Android). */
  enabled: boolean
  prompted: boolean
  permissionGranted: boolean
  nativeAvailable: boolean
  pendingCount: number
  showPromptBanner: boolean
  refreshing: boolean
  setEnabled: (on: boolean) => Promise<void>
  markPromptSeen: () => Promise<void>
  requestPermissionAndEnable: () => Promise<boolean>
  openSettings: () => Promise<void>
  refreshPending: () => Promise<void>
  ingestBody: (body: string) => Promise<void>
}

const BankSmsContext = createContext<BankSmsContextValue | null>(null)

export function BankSmsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [enabled, setEnabledState] = useState(false)
  const [prompted, setPrompted] = useState(true)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const nativeAvailable = Platform.OS === 'android' && isBankSmsNativeAvailable()

  const refreshPending = useCallback(async () => {
    if (!user) {
      setPendingCount(0)
      return
    }
    setRefreshing(true)
    try {
      const res = await bankSmsApi.list({ status: 'pending' })
      const rows = Array.isArray(res.data) ? res.data : []
      setPendingCount(rows.length)
    } catch {
      /* offline */
    } finally {
      setRefreshing(false)
    }
  }, [user])

  const reloadLocal = useCallback(async () => {
    const [en, seen, granted] = await Promise.all([
      getBankSmsEnabled(),
      getBankSmsPromptSeen(),
      getSmsPermissionGranted(),
    ])
    setEnabledState(en)
    setPrompted(seen)
    setPermissionGranted(granted)
  }, [])

  useEffect(() => {
    void reloadLocal()
  }, [reloadLocal, user?.id])

  useEffect(() => {
    if (user) void refreshPending()
  }, [user, refreshPending])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && user) void refreshPending()
    })
    return () => sub.remove()
  }, [user, refreshPending])

  // Live SMS → pending only (never auto-approve)
  useEffect(() => {
    if (Platform.OS !== 'android' || !user || !enabled || !permissionGranted) {
      return undefined
    }
    void startSmsBackgroundService()
    const unsub = subscribeIncomingSms((body) => {
      void ingestBankSmsBody(body, 'android_sms').then((r) => {
        if (r.ok) void refreshPending()
      })
    })
    return () => {
      unsub()
    }
  }, [user, enabled, permissionGranted, refreshPending])

  const setEnabled = useCallback(async (on: boolean) => {
    if (on && Platform.OS === 'android') {
      let granted = await getSmsPermissionGranted()
      if (!granted) granted = await requestSmsPermission()
      setPermissionGranted(granted)
      if (!granted) {
        await setBankSmsEnabled(false)
        setEnabledState(false)
        return
      }
      await setBankSmsEnabled(true)
      setEnabledState(true)
      await startSmsBackgroundService()
      return
    }
    await setBankSmsEnabled(false)
    setEnabledState(false)
    await stopSmsBackgroundService()
  }, [])

  const markPromptSeen = useCallback(async () => {
    await setBankSmsPromptSeen()
    setPrompted(true)
  }, [])

  const requestPermissionAndEnable = useCallback(async () => {
    await markPromptSeen()
    if (Platform.OS !== 'android') return false
    const granted = await requestSmsPermission()
    setPermissionGranted(granted)
    if (!granted) return false
    await setBankSmsEnabled(true)
    setEnabledState(true)
    await startSmsBackgroundService()
    return true
  }, [markPromptSeen])

  const ingestBody = useCallback(async (body: string) => {
    const r = await ingestBankSmsBody(body, 'android_sms')
    if (r.ok) await refreshPending()
  }, [refreshPending])

  const showPromptBanner =
    Platform.OS === 'android'
    && Boolean(user)
    && !prompted
    && nativeAvailable

  const value = useMemo(
    () => ({
      enabled,
      prompted,
      permissionGranted,
      nativeAvailable,
      pendingCount,
      showPromptBanner,
      refreshing,
      setEnabled,
      markPromptSeen,
      requestPermissionAndEnable,
      openSettings: openAppPermissionSettings,
      refreshPending,
      ingestBody,
    }),
    [
      enabled,
      prompted,
      permissionGranted,
      nativeAvailable,
      pendingCount,
      showPromptBanner,
      refreshing,
      setEnabled,
      markPromptSeen,
      requestPermissionAndEnable,
      refreshPending,
      ingestBody,
    ],
  )

  return <BankSmsContext.Provider value={value}>{children}</BankSmsContext.Provider>
}

export function useBankSms(): BankSmsContextValue {
  const ctx = useContext(BankSmsContext)
  if (!ctx) throw new Error('useBankSms must be used within BankSmsProvider')
  return ctx
}
