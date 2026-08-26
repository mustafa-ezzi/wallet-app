/**
 * Bank / wallet apps whose posted notifications we may ingest
 * when SMS is missing or delayed.
 *
 * Native layer receives broadly; JS filters with package ID and/or
 * title/appName keywords (OEM builds sometimes use unexpected package IDs).
 */
export const BANK_NOTIFICATION_APPS: Record<string, string> = {
  // Wallets
  'com.nayapay.app': 'NayaPay',
  'com.sadapay.app': 'SadaPay',
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

/** Title / appName fallbacks when package ID is unknown on device. */
const BANK_TEXT_HINTS: { re: RegExp; label: string }[] = [
  { re: /\bmeezan\b/i, label: 'Meezan' },
  { re: /\bnayapay\b/i, label: 'NayaPay' },
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
  ) {
    return false
  }

  const knownPkg = Boolean(BANK_NOTIFICATION_APPS[pkg])
  const knownText = Boolean(bankLabelFromText(blob))
  const moneyish =
    /\bpkr\b|\brs\.?\s*\d|\breceived\b|\bsent\b|\bdebited\b|\bcredited\b|\bwithdraw|\btransfer|\braast\b|\bbank\s*alert\b/i.test(
      blob,
    )

  if (knownPkg && moneyish) return true
  if (knownText && moneyish) return true
  // Known bank app posting truncated money alert
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
