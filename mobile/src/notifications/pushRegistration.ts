import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import api, { apiErrorMessage, wakeServer } from '@/src/api/client'
import { ensureAndroidChannel } from './schedule'

/** Fallback if Constants.extra is stripped in a bad build — keep in sync with app.json extra.eas.projectId */
const EAS_PROJECT_ID = 'bf847a85-3034-464b-8ac3-b7018dc543ab'

let lastToken: string | null = null

function projectId(): string {
  return (
    Constants.expoConfig?.extra?.eas?.projectId
    || (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
    || process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    || EAS_PROJECT_ID
  )
}

function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient'
}

function isPhysicalDevice(): boolean {
  // Constants.isDevice is true on real hardware; false on emulators / some simulators.
  const flag = (Constants as { isDevice?: boolean }).isDevice
  if (typeof flag === 'boolean') return flag
  return true
}

export async function getExpoPushToken(): Promise<{ token: string | null; error?: string }> {
  if (Platform.OS === 'web') {
    return { token: null, error: 'Push is not available on web.' }
  }
  if (!isPhysicalDevice()) {
    return { token: null, error: 'Push needs a physical phone (emulators usually cannot register).' }
  }
  if (isExpoGo()) {
    return {
      token: null,
      error: 'Expo Go cannot register CashTrail push. Install a native APK from EAS Build, then tap “Link this device for push”.',
    }
  }

  try {
    await ensureAndroidChannel()
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') {
      const next = await Notifications.requestPermissionsAsync()
      if (!next.granted) {
        return { token: null, error: 'Notifications permission is off. Enable it in system settings for CashTrail.' }
      }
    }

    const result = await Notifications.getExpoPushTokenAsync({ projectId: projectId() })
    const token = result.data || null
    if (!token) {
      return {
        token: null,
        error: 'Expo returned an empty push token. Rebuild the APK after adding Firebase FCM (google-services.json).',
      }
    }
    return { token }
  } catch (err) {
    console.warn('[CashTrail] push token failed', err)
    const msg = err instanceof Error ? err.message : String(err)
    const lower = msg.toLowerCase()
    if (
      lower.includes('firebase')
      || lower.includes('fcm')
      || lower.includes('default firebase app')
      || lower.includes('google-services')
      || lower.includes('senderid')
    ) {
      return {
        token: null,
        error:
          'Android FCM is not configured for this build. Add google-services.json + upload an FCM V1 service account in EAS credentials, then rebuild the APK.',
      }
    }
    if (lower.includes('projectid') || lower.includes('project id')) {
      return {
        token: null,
        error: 'Missing Expo projectId. Rebuild with app.json extra.eas.projectId set, then try again.',
      }
    }
    return {
      token: null,
      error: `Could not get push token: ${msg.slice(0, 160)}`,
    }
  }
}

export type RegisterDeviceResult = {
  token: string | null
  ok: boolean
  error?: string
}

/**
 * Fetch Expo push token and POST to backend /api/devices/.
 * Wakes Railway first and relies on client retries for cold starts.
 */
export async function registerDeviceToken(): Promise<string | null> {
  const result = await registerDeviceTokenDetailed()
  return result.token
}

export async function registerDeviceTokenDetailed(): Promise<RegisterDeviceResult> {
  const { token, error } = await getExpoPushToken()
  if (!token) {
    return {
      token: null,
      ok: false,
      error: error || 'No push token available.',
    }
  }
  lastToken = token
  try {
    await wakeServer(true)
    await api.post('/devices/', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown',
    })
    return { token, ok: true }
  } catch (err) {
    console.warn('[CashTrail] device register failed', err)
    return {
      token: null,
      ok: false,
      error: apiErrorMessage(err, 'Could not link this device to the server.'),
    }
  }
}

export async function revokeDeviceToken(): Promise<void> {
  const token = lastToken
  lastToken = null
  if (!token) return
  try {
    await api.post('/devices/revoke/', { token })
  } catch {
    /* ignore on logout */
  }
}
