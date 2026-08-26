/**
 * Bank / wallet apps whose posted notifications we may ingest
 * when SMS is missing or delayed. Keep allowlist explicit (never empty = all apps).
 */
export const BANK_NOTIFICATION_APPS: Record<string, string> = {
  // Wallets
  'com.nayapay.app': 'NayaPay',
  'com.sadapay.app': 'SadaPay',
  'com.techlogix.mobilinkcustomer': 'JazzCash',
  'pk.com.telenor.phoenix': 'Easypaisa',
  // Banks — current mobile apps
  'invo8.meezan.mb': 'Meezan',
  'com.ofss.tx.meezan': 'Meezan',
  'com.hbl.android.hblmobilebanking': 'HBL',
  'app.com.brd': 'UBL',
  'com.base.bankalfalah': 'Alfalah',
  'com.ofss.digx.mobile.android.allied': 'Allied',
  'com.mcb.mcblive': 'MCB',
  'com.avanza.ambitwizfbl': 'Faysal',
  'com.bi.digitalbanking': 'BankIslami',
}

export const WALLET_NOTIFICATION_PACKAGES = Object.keys(BANK_NOTIFICATION_APPS)

export function bankLabelForPackage(packageName: string): string | null {
  return BANK_NOTIFICATION_APPS[packageName] ?? null
}
