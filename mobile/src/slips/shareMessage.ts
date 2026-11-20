import { Platform, Share } from 'react-native'
import { buildSlipShareMessage } from './slipData'
import type { SlipData } from './types'

async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator?.clipboard
      if (!clip?.writeText) return false
      await clip.writeText(text)
      return true
    }
    // Share sheet is the reliable no-extra-dependency path on native (no expo-clipboard yet).
    const result = await Share.share(
      Platform.OS === 'ios'
        ? { message: text }
        : { message: text, title: 'WalletTrails slip' },
    )
    return result.action !== Share.dismissedAction
  } catch {
    return false
  }
}

/** Share or copy the §3.11 message. Returns how it was delivered. */
export async function shareOrCopySlipMessage(data: SlipData): Promise<'shared' | 'copied' | 'cancelled'> {
  const message = buildSlipShareMessage(data)
  if (Platform.OS === 'web') {
    const ok = await copyText(message)
    return ok ? 'copied' : 'cancelled'
  }
  const ok = await copyText(message)
  return ok ? 'shared' : 'cancelled'
}

export { buildSlipShareMessage }
