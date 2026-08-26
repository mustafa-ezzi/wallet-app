/**
 * Thin wrapper around expo-android-notification-listener-service.
 * Safe stubs on iOS / web / Expo Go when the native module is missing.
 *
 * Native allowlist is left empty so OEM package-ID variants still reach JS;
 * we filter to bank-like alerts in JS (see walletApps.isBankishNotification).
 */
import { Platform } from 'react-native'
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
      if (!isBankishNotification(event)) return
      const body = bodyFromWalletNotification(event)
      if (body) onNotification(body, event)
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
