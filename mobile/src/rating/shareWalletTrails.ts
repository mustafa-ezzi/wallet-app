import { Share, Platform } from 'react-native'
import { WALLETTRAILS_SHARE_URL } from './storage'

export async function shareWalletTrailsLink(): Promise<boolean> {
  const message =
    'I’ve been using WalletTrails to track money in PKR — wallets, bills, and household splits.\n\n'
    + `Try it: ${WALLETTRAILS_SHARE_URL}`

  try {
    const result = await Share.share(
      Platform.OS === 'ios'
        ? { message, url: WALLETTRAILS_SHARE_URL }
        : { message, title: 'WalletTrails' },
    )
    return result.action !== Share.dismissedAction
  } catch {
    return false
  }
}
