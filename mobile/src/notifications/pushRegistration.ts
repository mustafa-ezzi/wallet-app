import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import api, { apiErrorMessage, wakeServer } from '@/src/api/client'
import { ensureAndroidChannel } from './schedule'

let lastToken: string | null = null

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId
    || (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  )
}

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null
  try {
    await ensureAndroidChannel()
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') {
      const next = await Notifications.requestPermissionsAsync()
      if (!next.granted) return null
    }
    const pid = projectId()
    const result = pid
      ? await Notifications.getExpoPushTokenAsync({ projectId: pid })
      : await Notifications.getExpoPushTokenAsync()
    return result.data || null
  } catch (err) {
    console.warn('[CashTrail] push token failed', err)
    return null
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
  const token = await getExpoPushToken()
  if (!token) {
    return {
      token: null,
      ok: false,
      error: 'No push token (allow notifications, or rebuild a native APK — Expo Go may not register).',
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
