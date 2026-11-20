import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const KEY = 'wallettrails_slip_ask_after_payment'

/** Default on — ask after Save payment / Save receipt until the user turns it off. */
export async function getAskSlipAfterPayment(): Promise<boolean> {
  try {
    const raw =
      Platform.OS === 'web'
        ? (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null)
        : await SecureStore.getItemAsync(KEY)
    if (raw === '0') return false
    return true
  } catch {
    return true
  }
}

export async function setAskSlipAfterPayment(ask: boolean): Promise<void> {
  try {
    const value = ask ? '1' : '0'
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, value)
      return
    }
    await SecureStore.setItemAsync(KEY, value)
  } catch {
    /* ignore */
  }
}
