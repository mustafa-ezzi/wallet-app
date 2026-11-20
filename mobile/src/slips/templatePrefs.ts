import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { DEFAULT_SLIP_TEMPLATE_ID, getSlipTemplate } from './templates'

const KEY = 'wallettrails_slip_template_id'

export async function getSlipTemplateId(): Promise<string> {
  try {
    const raw =
      Platform.OS === 'web'
        ? (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null)
        : await SecureStore.getItemAsync(KEY)
    return getSlipTemplate(raw).id
  } catch {
    return DEFAULT_SLIP_TEMPLATE_ID
  }
}

export async function setSlipTemplateId(id: string): Promise<void> {
  const safe = getSlipTemplate(id).id
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, safe)
      return
    }
    await SecureStore.setItemAsync(KEY, safe)
  } catch {
    /* ignore */
  }
}
