import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const ENABLED = 'cashtrail_bank_sms_enabled'
const PROMPTED = 'cashtrail_bank_sms_prompted'
/** Bank / wallet app alerts via Android Notification Listener */
const NOTIF_ENABLED = 'cashtrail_bank_notif_enabled'
/** When on, detected SMS/notifications create transactions without inbox approval. Default off. */
const AUTO_APPROVE = 'cashtrail_bank_sms_auto_approve'

async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return null
      return localStorage.getItem(key)
    }
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function getBankSmsEnabled(): Promise<boolean> {
  return (await getItem(ENABLED)) === '1'
}

export async function setBankSmsEnabled(on: boolean): Promise<void> {
  await setItem(ENABLED, on ? '1' : '0')
}

export async function getBankSmsPromptSeen(): Promise<boolean> {
  return (await getItem(PROMPTED)) === '1'
}

export async function setBankSmsPromptSeen(): Promise<void> {
  await setItem(PROMPTED, '1')
}

export async function getBankNotifEnabled(): Promise<boolean> {
  return (await getItem(NOTIF_ENABLED)) === '1'
}

export async function setBankNotifEnabled(on: boolean): Promise<void> {
  await setItem(NOTIF_ENABLED, on ? '1' : '0')
}

/** Default false — user must opt in to skip approve/reject. */
export async function getBankSmsAutoApprove(): Promise<boolean> {
  return (await getItem(AUTO_APPROVE)) === '1'
}

export async function setBankSmsAutoApprove(on: boolean): Promise<void> {
  await setItem(AUTO_APPROVE, on ? '1' : '0')
}
