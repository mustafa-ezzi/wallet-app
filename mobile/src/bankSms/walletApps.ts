/**
 * Wallet apps that push transaction alerts as notifications (not SMS).
 * Package IDs from Play Store.
 */
export const WALLET_NOTIFICATION_PACKAGES = [
  'com.nayapay.app',
  'com.sadapay.app',
] as const

export type WalletNotificationPackage = (typeof WALLET_NOTIFICATION_PACKAGES)[number]

export function bankLabelForPackage(packageName: string): string | null {
  if (packageName === 'com.nayapay.app') return 'NayaPay'
  if (packageName === 'com.sadapay.app') return 'SadaPay'
  return null
}
