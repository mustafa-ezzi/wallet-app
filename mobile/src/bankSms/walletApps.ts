/**
 * Bank / wallet apps whose posted notifications we may ingest
 * when SMS is missing or delayed.
 *
 * Native layer receives broadly; JS filters with package ID and/or
 * title/appName keywords (OEM builds sometimes use unexpected package IDs).
 */
export const BANK_NOTIFICATION_APPS: Record<string, string> = {
  // Wallets — include alternate / legacy package IDs seen on devices
  'com.nayapay.app': 'NayaPay',
  'com.nayapay': 'NayaPay',
  'pk.com.nayapay': 'NayaPay',
  'com.sadapay.app': 'SadaPay',
  'com.sadapay': 'SadaPay',
  'pk.sadapay.app': 'SadaPay',
  'com.techlogix.mobilinkcustomer': 'JazzCash',
  'pk.com.telenor.phoenix': 'Easypaisa',
  // Meezan (current + legacy + variants)
  'invo8.meezan.mb': 'Meezan',
  'com.ofss.tx.meezan': 'Meezan',
  'com.meezan.mb': 'Meezan',
  'com.meezanbank.app': 'Meezan',
  // Other banks
  'com.hbl.android.hblmobilebanking': 'HBL',
  'app.com.brd': 'UBL',
  'com.base.bankalfalah': 'Alfalah',
  'com.ofss.digx.mobile.android.allied': 'Allied',
  'com.mcb.mcblive': 'MCB',
  'com.avanza.ambitwizfbl': 'Faysal',
  'com.bi.digitalbanking': 'BankIslami',
}

export const WALLET_NOTIFICATION_PACKAGES = Object.keys(BANK_NOTIFICATION_APPS)

/** Package → parser bank_hint */
const PACKAGE_TO_HINT: Record<string, string> = {
  'com.nayapay.app': 'nayapay',
  'com.nayapay': 'nayapay',
  'pk.com.nayapay': 'nayapay',
  'com.sadapay.app': 'sadapay',
  'com.sadapay': 'sadapay',
  'pk.sadapay.app': 'sadapay',
  'com.techlogix.mobilinkcustomer': 'jazzcash',
  'pk.com.telenor.phoenix': 'easypaisa',
  'invo8.meezan.mb': 'meezan',
  'com.ofss.tx.meezan': 'meezan',
  'com.meezan.mb': 'meezan',
  'com.meezanbank.app': 'meezan',
  'com.hbl.android.hblmobilebanking': 'hbl',
  'app.com.brd': 'ubl',
  'com.base.bankalfalah': 'alfalah',
  'com.ofss.digx.mobile.android.allied': 'allied',
  'com.mcb.mcblive': 'mcb',
  'com.avanza.ambitwizfbl': 'faysal',
  'com.bi.digitalbanking': 'bankislami',
}

/** Title / appName fallbacks when package ID is unknown on device. */
const BANK_TEXT_HINTS: { re: RegExp; label: string }[] = [
  { re: /\bmeezan\b/i, label: 'Meezan' },
  { re: /\bnaya\s*pay\b|\bnayapay\b/i, label: 'NayaPay' },
  { re: /\bsada\s*pay\b|\bsadapay\b/i, label: 'SadaPay' },
  { re: /\bjazz\s*cash\b|\bjazzcash\b/i, label: 'JazzCash' },
  { re: /\beasypaisa\b/i, label: 'Easypaisa' },
  { re: /\bhbl\b|\bhabib\s*bank\b/i, label: 'HBL' },
  { re: /\bubl\b|\bunited\s*bank\b/i, label: 'UBL' },
  { re: /\balfalah\b/i, label: 'Alfalah' },
  { re: /\ballied\b|\bmyabl\b/i, label: 'Allied' },
  { re: /\bmcb\b/i, label: 'MCB' },
  { re: /\bfaysal\b/i, label: 'Faysal' },
  { re: /\bbank\s*islami\b|\bbsbl\b/i, label: 'BankIslami' },
]

export function bankLabelForPackage(packageName: string): string | null {
  return BANK_NOTIFICATION_APPS[packageName] ?? null
}

export function bankHintForPackage(packageName: string): string | null {
  return PACKAGE_TO_HINT[packageName] ?? null
}

export function bankLabelFromText(blob: string): string | null {
  for (const { re, label } of BANK_TEXT_HINTS) {
    if (re.test(blob)) return label
  }
  return null
}

export type NotifLike = {
  packageName?: string
  appName?: string
  title?: string
  text?: string
  bigText?: string
  subText?: string
  summaryText?: string
}

/** True if this notification looks like a bank/wallet money alert. */
export function isBankishNotification(n: NotifLike): boolean {
  const pkg = n.packageName || ''
  const blob = [n.appName, n.title, n.text, n.bigText, n.subText, n.summaryText]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ')

  if (!blob) return false

  // Hard ignore non-money / auth noise
  if (
    /\blogin\s+successful\b/i.test(blob)
    || /\botp\b|\bone[-\s]?time\b|\bverification code\b|\bdo not share\b/i.test(blob)
    || /\bincorrect (mpin|pin|password)\b/i.test(blob)
    || /\btry again\b/i.test(blob)
    || /\bbiometric\b/i.test(blob)
  ) {
    return false
  }

  const knownPkg = Boolean(BANK_NOTIFICATION_APPS[pkg])
  const knownText = Boolean(bankLabelFromText(blob))
  const moneyish =
    /\bpkr\b|\brs\.?\b|\b₨\b|\breceived\b|\bsent\b|\bpaid\b|\bspent\b|\bpayment\b|\bdebited\b|\bcredited\b|\bwithdraw|\btransfer|\braast\b|\bbank\s*alert\b|\bbalance\b|\btransaction\b/i.test(
      blob,
    )
      || /(?:PKR|Rs\.?|₨)\s*:?\s*[\d,]+/i.test(blob)
      || /[\d,]+\s*(?:PKR|Rs\.?)\b/i.test(blob)

  if (knownPkg && moneyish) return true
  if (knownText && moneyish) return true
  // Known bank/wallet app with any amount-like digits (short push may omit "Rs")
  if (knownPkg && /\d/.test(blob)) return true
  return false
}

export function resolveBankLabel(n: NotifLike): string | null {
  return (
    bankLabelForPackage(n.packageName || '')
    || bankLabelFromText(
      [n.appName, n.title, n.text, n.bigText].filter(Boolean).join(' '),
    )
  )
}
