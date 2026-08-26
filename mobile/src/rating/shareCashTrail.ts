import { Share, Platform } from 'react-native'
import { CASHTRAIL_SHARE_URL } from './storage'

export async function shareCashTrailLink(): Promise<boolean> {
  const message =
    'I’ve been using CashTrail to track money in PKR — wallets, bills, and household splits.\n\n'
    + `Try it: ${CASHTRAIL_SHARE_URL}`

  try {
    const result = await Share.share(
      Platform.OS === 'ios'
        ? { message, url: CASHTRAIL_SHARE_URL }
        : { message, title: 'CashTrail' },
    )
    return result.action !== Share.dismissedAction
  } catch {
    return false
  }
}
