import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState, type AppStateStatus, Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as ScreenCapture from 'expo-screen-capture'
import { useAuth } from '@/src/context/AuthContext'
import { track } from '@/src/lib/analytics'
import {
  getBlockScreenshots,
  getPrivacyEnabled,
  getPrivacyTimeout,
  hasAppPin,
  PRIVACY_TIMEOUT_MS,
  setBlockScreenshots,
  setPinHash,
  setPrivacyEnabled,
  setPrivacyTimeout,
  verifyPin,
  type PrivacyTimeout,
} from '@/src/privacy/storage'

type PrivacyLockValue = {
  ready: boolean
  enabled: boolean
  locked: boolean
  timeout: PrivacyTimeout
  blockScreenshots: boolean
  hasPin: boolean
  biometricsAvailable: boolean
  /** True when amounts should show as bullets / blur — page chrome stays visible */
  amountsHidden: boolean
  unlockSheetOpen: boolean
  openUnlockSheet: () => void
  closeUnlockSheet: () => void
  unlockWithBiometrics: () => Promise<boolean>
  unlockWithPin: (pin: string) => Promise<boolean>
  lockNow: () => void
  setEnabled: (on: boolean) => Promise<void>
  setTimeoutPref: (value: PrivacyTimeout) => Promise<void>
  setAppPin: (pin: string) => Promise<void>
  setScreenshotBlock: (on: boolean) => Promise<void>
  refreshCapabilities: () => Promise<void>
}

const PrivacyLockContext = createContext<PrivacyLockValue | null>(null)

export function PrivacyLockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [ready, setReady] = useState(false)
  const [enabled, setEnabledState] = useState(false)
  const [locked, setLocked] = useState(false)
  const [timeout, setTimeoutState] = useState<PrivacyTimeout>('immediate')
  const [blockScreenshots, setBlockScreenshotsState] = useState(true)
  const [hasPin, setHasPin] = useState(false)
  const [biometricsAvailable, setBiometricsAvailable] = useState(false)
  const [unlockSheetOpen, setUnlockSheetOpen] = useState(false)
  const backgroundAt = useRef<number | null>(null)

  const refreshCapabilities = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        setBiometricsAvailable(false)
        return
      }
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const enrolled = await LocalAuthentication.isEnrolledAsync()
      setBiometricsAvailable(hasHardware && enrolled)
    } catch {
      setBiometricsAvailable(false)
    }
  }, [])

  const applyScreenshotFlag = useCallback(async (privacyOn: boolean, block: boolean) => {
    if (Platform.OS === 'web') return
    try {
      if (privacyOn && block) {
        await ScreenCapture.preventScreenCaptureAsync()
      } else {
        await ScreenCapture.allowScreenCaptureAsync()
      }
    } catch {
      /* Expo Go / unsupported */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [on, to, pin, block] = await Promise.all([
        getPrivacyEnabled(),
        getPrivacyTimeout(),
        hasAppPin(),
        getBlockScreenshots(),
      ])
      if (cancelled) return
      setEnabledState(on)
      setTimeoutState(to)
      setHasPin(pin)
      setBlockScreenshotsState(block)
      setLocked(on) // lock on cold start when enabled
      await refreshCapabilities()
      await applyScreenshotFlag(on, block)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [applyScreenshotFlag, refreshCapabilities])

  // Re-lock when logged-in user enables privacy or after login with privacy on
  useEffect(() => {
    if (!ready) return
    if (user && enabled) {
      setLocked(true)
    }
    if (!user) {
      setLocked(false)
    }
  }, [user?.id, enabled, ready])

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (!enabled || !user) return

      if (next === 'background' || next === 'inactive') {
        backgroundAt.current = Date.now()
        if (timeout === 'immediate') {
          setLocked(true)
        }
        return
      }

      if (next === 'active') {
        const leftAt = backgroundAt.current
        backgroundAt.current = null
        if (leftAt == null) return
        const elapsed = Date.now() - leftAt
        const limit = PRIVACY_TIMEOUT_MS[timeout]
        if (elapsed >= limit) {
          setLocked(true)
        }
      }
    }

    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [enabled, timeout, user])

  const closeUnlockSheet = useCallback(() => setUnlockSheetOpen(false), [])

  const openUnlockSheet = useCallback(() => {
    if (!enabled) return
    setUnlockSheetOpen(true)
  }, [enabled])

  const unlockWithBiometrics = useCallback(async () => {
    if (Platform.OS === 'web') return false
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Reveal WalletTrails amounts',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        fallbackLabel: 'Use device PIN',
      })
      if (result.success) {
        setLocked(false)
        setUnlockSheetOpen(false)
        track('privacy_unlock_success', { method: 'biometric' })
        return true
      }
      track('privacy_unlock_failed', { method: 'biometric' })
      return false
    } catch {
      track('privacy_unlock_failed', { method: 'biometric' })
      return false
    }
  }, [])

  const unlockWithPin = useCallback(async (pin: string) => {
    const ok = await verifyPin(pin)
    if (ok) {
      setLocked(false)
      setUnlockSheetOpen(false)
      track('privacy_unlock_success', { method: 'app_pin' })
      return true
    }
    track('privacy_unlock_failed', { method: 'app_pin' })
    return false
  }, [])

  const lockNow = useCallback(() => {
    if (enabled) {
      setLocked(true)
      setUnlockSheetOpen(false)
    }
  }, [enabled])

  const setEnabled = useCallback(async (on: boolean) => {
    await setPrivacyEnabled(on)
    setEnabledState(on)
    if (on) {
      setLocked(true)
    } else {
      setLocked(false)
    }
    await applyScreenshotFlag(on, blockScreenshots)
  }, [applyScreenshotFlag, blockScreenshots])

  const setTimeoutPref = useCallback(async (value: PrivacyTimeout) => {
    await setPrivacyTimeout(value)
    setTimeoutState(value)
  }, [])

  const setAppPin = useCallback(async (pin: string) => {
    await setPinHash(pin)
    setHasPin(true)
  }, [])

  const setScreenshotBlock = useCallback(async (on: boolean) => {
    await setBlockScreenshots(on)
    setBlockScreenshotsState(on)
    await applyScreenshotFlag(enabled, on)
  }, [applyScreenshotFlag, enabled])

  const amountsHidden = Boolean(user && enabled && locked)

  const value = useMemo(
    () => ({
      ready,
      enabled,
      locked,
      timeout,
      blockScreenshots,
      hasPin,
      biometricsAvailable,
      amountsHidden,
      unlockSheetOpen,
      openUnlockSheet,
      closeUnlockSheet,
      unlockWithBiometrics,
      unlockWithPin,
      lockNow,
      setEnabled,
      setTimeoutPref,
      setAppPin,
      setScreenshotBlock,
      refreshCapabilities,
    }),
    [
      ready,
      enabled,
      locked,
      timeout,
      blockScreenshots,
      hasPin,
      biometricsAvailable,
      amountsHidden,
      unlockSheetOpen,
      openUnlockSheet,
      closeUnlockSheet,
      unlockWithBiometrics,
      unlockWithPin,
      lockNow,
      setEnabled,
      setTimeoutPref,
      setAppPin,
      setScreenshotBlock,
      refreshCapabilities,
    ],
  )

  return (
    <PrivacyLockContext.Provider value={value}>
      {children}
    </PrivacyLockContext.Provider>
  )
}

export function usePrivacyLock(): PrivacyLockValue {
  const ctx = useContext(PrivacyLockContext)
  if (!ctx) throw new Error('usePrivacyLock must be used within PrivacyLockProvider')
  return ctx
}
