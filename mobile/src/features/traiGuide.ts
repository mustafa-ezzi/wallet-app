import * as SecureStore from 'expo-secure-store'

const SEEN_KEY = 'wallettrails_seen_trai_guide_v1'

export async function hasSeenTraiGuide(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(SEEN_KEY)) === '1'
  } catch {
    return true
  }
}

export async function markTraiGuideSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
}
