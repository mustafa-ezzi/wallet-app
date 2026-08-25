/**
 * Thin wrapper around expo-sms-listener (Android + EAS build only).
 * Safe stubs on iOS / web / Expo Go when the native module is missing.
 */
import { Linking, Platform } from 'react-native'

type SmsMsg = { body?: string; originatingAddress?: string; timestamp?: number }
type ListenerApi = {
  requestSmsPermissionAsync: () => Promise<{ granted: boolean } | boolean>
  checkSmsPermissionAsync?: () => Promise<{ granted: boolean } | boolean>
  startSmsListenerServiceAsync?: () => Promise<unknown>
  stopSmsListenerServiceAsync?: () => Promise<unknown>
  addSmsListener?: (cb: (msg: SmsMsg) => void) => { remove: () => void }
}

function grantedOf(r: { granted: boolean } | boolean | undefined): boolean {
  if (typeof r === 'boolean') return r
  return Boolean(r?.granted)
}

function loadNative(): ListenerApi | null {
  if (Platform.OS !== 'android') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-sms-listener') as ListenerApi
  } catch {
    return null
  }
}

export function isBankSmsNativeAvailable(): boolean {
  return loadNative() != null
}

export async function getSmsPermissionGranted(): Promise<boolean> {
  const mod = loadNative()
  if (!mod?.checkSmsPermissionAsync) return false
  try {
    return grantedOf(await mod.checkSmsPermissionAsync())
  } catch {
    return false
  }
}

export async function requestSmsPermission(): Promise<boolean> {
  const mod = loadNative()
  if (!mod?.requestSmsPermissionAsync) return false
  try {
    return grantedOf(await mod.requestSmsPermissionAsync())
  } catch {
    return false
  }
}

export async function startSmsBackgroundService(): Promise<void> {
  const mod = loadNative()
  if (!mod?.startSmsListenerServiceAsync) return
  try {
    await mod.startSmsListenerServiceAsync()
  } catch {
    /* optional */
  }
}

export async function stopSmsBackgroundService(): Promise<void> {
  const mod = loadNative()
  if (!mod?.stopSmsListenerServiceAsync) return
  try {
    await mod.stopSmsListenerServiceAsync()
  } catch {
    /* optional */
  }
}

/** Subscribe to incoming SMS while JS is alive. Returns unsubscribe. */
export function subscribeIncomingSms(onMessage: (body: string, meta?: SmsMsg) => void): () => void {
  const mod = loadNative()
  if (!mod?.addSmsListener) return () => undefined
  try {
    const sub = mod.addSmsListener((msg) => {
      const body = (msg?.body || '').trim()
      if (body) onMessage(body, msg)
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

export async function openAppPermissionSettings(): Promise<void> {
  try {
    await Linking.openSettings()
  } catch {
    /* ignore */
  }
}
