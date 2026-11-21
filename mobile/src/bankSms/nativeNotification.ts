/**
 * Thin wrapper around expo-android-notification-listener-service.
 * Safe stubs on iOS / web / Expo Go when the native module is missing.
 *
 * Native allowlist is left empty so OEM package-ID variants still reach JS;
 * we filter to bank-like alerts in JS (see walletApps.isBankishNotification).
 */
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { getPermissionStatus } from '@/src/notifications/schedule'
import { getDetectedTxAlertsEnabled } from '@/src/notifications/detectedTransaction'
import { DETECTED_TX_SIMPLE_ID } from '@/src/notifications/detectedTransactionCopy'
import { getBankNotifEnabled } from './storage'
import {
  isBankishNotification,
  resolveBankLabel,
} from './walletApps'

export type NotificationPayload = {
  packageName: string
  id?: number
  title?: string
  text?: string
  bigText?: string
  subText?: string
  summaryText?: string
  postTime?: number
  key?: string
  appName?: string
}

type ListenerApi = {
  isNotificationPermissionGranted: () => boolean
  openNotificationListenerSettings: () => void
  setAllowedPackages: (packages: string[]) => void
  addListener: (
    event: 'onNotificationReceived',
    cb: (event: NotificationPayload) => void,
  ) => { remove: () => void }
  /** Returns + clears native SharedPreferences queue (background catch-up). */
  drainQueuedNotifications?: () => NotificationPayload[] | Promise<NotificationPayload[]>
  /** Ask Android to bind the listener again after it was dropped. */
  requestListenerRebind?: () => void
  /** Read bank alerts still showing in the shade. */
  syncActiveNotifications?: () => void | Promise<void>
  /** Remember a notification key so later shade catch-up does not import it twice. */
  markNotificationSeen?: (key: string) => void
  /** Closed-app bank alerts post a placeholder only when this is on. */
  setBankAlertBannerEnabled?: (on: boolean) => void
  /** Remove the placeholder after JS parses the alert. */
  cancelBankAlertBanner?: () => void
}

function loadNative(): ListenerApi | null {
  if (Platform.OS !== 'android') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-android-notification-listener-service').default as ListenerApi
  } catch {
    return null
  }
}

export function isBankNotificationNativeAvailable(): boolean {
  return loadNative() != null
}

/**
 * Empty native allowlist = deliver all packages to JS (module treats empty as allow-all).
 * We must filter in subscribeWalletNotifications — never leave this "open" without JS filter.
 */
export function applyWalletNotificationAllowlist(): void {
  const mod = loadNative()
  if (!mod?.setAllowedPackages) return
  try {
    mod.setAllowedPackages([])
  } catch {
    /* ignore */
  }
}

export function getNotificationListenerGranted(): boolean {
  const mod = loadNative()
  if (!mod?.isNotificationPermissionGranted) return false
  try {
    return Boolean(mod.isNotificationPermissionGranted())
  } catch {
    return false
  }
}

export function openNotificationListenerSettings(): void {
  const mod = loadNative()
  if (!mod?.openNotificationListenerSettings) return
  try {
    mod.openNotificationListenerSettings()
  } catch {
    /* ignore */
  }
}

/**
 * Build a parseable body from a notification. Prefers bigText over text.
 * Injects wallet/bank name when missing so bank_hint matching still works.
 */
export function bodyFromWalletNotification(n: NotificationPayload): string {
  const parts = [n.title, n.bigText || n.text, n.subText, n.summaryText]
    .map((s) => (s || '').trim())
    .filter(Boolean)
  const unique: string[] = []
  for (const p of parts) {
    if (unique[unique.length - 1] !== p) unique.push(p)
  }
  let body = unique.join('\n')
  const label = resolveBankLabel(n)
  if (label && !new RegExp(label.replace(/\s+/g, '\\s*'), 'i').test(body)) {
    body = `${label}\n${body}`
  }
  return body.trim()
}

/** Subscribe while JS is alive. Returns unsubscribe. */
export function subscribeWalletNotifications(
  onNotification: (body: string, meta: NotificationPayload) => void,
): () => void {
  const mod = loadNative()
  if (!mod?.addListener) return () => undefined
  applyWalletNotificationAllowlist()
  try {
    const sub = mod.addListener('onNotificationReceived', (event) => {
      try {
        if (__DEV__) {
          console.log('[WalletTrails notif]', event.packageName, event.title, event.text || event.bigText)
        }
        if (!isBankishNotification(event)) return
        const body = bodyFromWalletNotification(event)
        if (body) onNotification(body, event)
      } catch (err) {
        console.warn('[WalletTrails notif] handler failed', err)
      }
    })
    return () => {
      try {
        sub.remove()
      } catch {
        /* ignore */
      }
    }
  } catch {
    return () => undefined
  }
}

/**
 * Rebind the listener and pull bank alerts that arrived while it was unbound.
 * Safe to call on every foreground — already-imported keys are skipped natively.
 */
export async function catchUpWalletNotifications(): Promise<void> {
  const mod = loadNative()
  if (!mod) return
  try {
    mod.requestListenerRebind?.()
  } catch {
    /* ignore */
  }
  try {
    await Promise.resolve(mod.syncActiveNotifications?.())
  } catch {
    /* ignore */
  }
}

/**
 * Bank-app listening and the alert switch both have to be on, and notifications allowed.
 * The listener reads this flag with no JavaScript running.
 */
export async function refreshBankAlertBannerGate(): Promise<void> {
  const mod = loadNative()
  if (!mod?.setBankAlertBannerEnabled) return
  try {
    const [bankOn, alertsOn, perm] = await Promise.all([
      getBankNotifEnabled(),
      getDetectedTxAlertsEnabled(),
      getPermissionStatus(),
    ])
    mod.setBankAlertBannerEnabled(bankOn && alertsOn && perm === 'granted')
  } catch {
    /* ignore */
  }
}

/** Clear the "New bank alert" placeholder. Leaves a richer SMS banner in place. */
export async function cancelSimpleBankAlertBanner(): Promise<void> {
  const mod = loadNative()
  try {
    mod?.cancelBankAlertBanner?.()
  } catch {
    /* ignore */
  }
  try {
    await Notifications.dismissNotificationAsync(DETECTED_TX_SIMPLE_ID)
  } catch {
    /* ignore */
  }
}

export function markWalletNotificationHandled(key?: string): void {
  if (!key) return
  const mod = loadNative()
  if (!mod?.markNotificationSeen) return
  try {
    mod.markNotificationSeen(key)
  } catch {
    /* ignore */
  }
}

/**
 * Drain notifications captured while JS was frozen/killed.
 * Call on AppState active and when enabling bank-app listening.
 */
export async function drainQueuedWalletNotifications(): Promise<NotificationPayload[]> {
  const mod = loadNative()
  if (!mod?.drainQueuedNotifications) return []
  try {
    const raw = await Promise.resolve(mod.drainQueuedNotifications())
    if (!Array.isArray(raw)) return []
    return raw.filter((n) => n && typeof n === 'object' && n.packageName)
  } catch {
    return []
  }
}

/** Ingest any queued bank notifications (dedupe happens server-side). */
export async function processQueuedWalletNotifications(
  ingest: (body: string, meta: NotificationPayload) => Promise<boolean>,
): Promise<number> {
  await catchUpWalletNotifications()
  const queued = await drainQueuedWalletNotifications()
  let n = 0
  for (const event of queued) {
    try {
      if (!isBankishNotification(event)) continue
      const body = bodyFromWalletNotification(event)
      if (!body) continue
      const ok = await ingest(body, event)
      if (ok) {
        markWalletNotificationHandled(event.key)
        n += 1
      }
    } catch {
      /* continue next */
    }
  }
  return n
}
