import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import api from '@/src/api/client'
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

/**
 * Fetch Expo push token and POST to backend /api/devices/.
 * Call whenever OS notification permission is granted — not only for due reminders.
 */
export async function registerDeviceToken(): Promise<string | null> {
  const token = await getExpoPushToken()
  if (!token) {
    console.warn('[CashTrail] no Expo push token (permission denied or getExpoPushTokenAsync failed)')
    return null
  }
  lastToken = token
  try {
    await api.post('/devices/', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown',
    })
  } catch (err) {
    console.warn('[CashTrail] device register failed', err)
    return null
  }
  return token
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
