import type { BankSmsKind, BankSmsUiBucket, ParsedBankSms } from './types'
import { applyBankTemplate } from './templates'
import { applyKindOverrides, type KindOverride } from './corrections'

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const BANK_HINTS: { re: RegExp; hint: string }[] = [
  { re: /\bmeezan\b/i, hint: 'meezan' },
  { re: /\bhbl\b|\bhabib\s*bank\s*limited\b/i, hint: 'hbl' },
  { re: /\bubl\b|\bunited\s*bank\b/i, hint: 'ubl' },
  { re: /\bmcb\b/i, hint: 'mcb' },
  { re: /\ballied\b/i, hint: 'allied' },
  { re: /\bjazz\s*cash\b|\bjazzcash\b/i, hint: 'jazzcash' },
  { re: /\beasypaisa\b/i, hint: 'easypaisa' },
  { re: /\bnayapay\b/i, hint: 'nayapay' },
  { re: /\bsada\s*pay\b|\bsadapay\b/i, hint: 'sadapay' },
  { re: /\bbank\s*alfalah\b|\balfalah\b/i, hint: 'alfalah' },
  { re: /\bhabib\s*metro\b|\bhmb\b/i, hint: 'habibmetro' },
  { re: /\baskari\b/i, hint: 'askari' },
  { re: /\bfaysal\b/i, hint: 'faysal' },
  { re: /\bstandard\s*chartered\b|\bstan\s*chart\b|\bscb\b/i, hint: 'scb' },
  { re: /\bcitibank\b|\bciti\b/i, hint: 'citi' },
  { re: /\bbsbl\b|\bbankislami\b|\bbank\s*islami\b/i, hint: 'bankislami' },
  { re: /\bdubai\s*islamic\b|\bdib\b/i, hint: 'dib' },
  { re: /\bsilk\s*bank\b/i, hint: 'silk' },
  { re: /\bsoneri\b/i, hint: 'soneri' },
  { re: /\bsnmbl\b|\bsindh\s*bank\b/i, hint: 'sindh' },
  { re: /\bnbp\b|\bnational\s*bank\b/i, hint: 'nbp' },
  { re: /\bkeenu?\b|\braast\b/i, hint: '' }, // skip — not a bank wallet brand
]

const IGNORE_RES = [
  /\botp\b/i,
  /\bone[-\s]?time\s+password\b/i,
  /\bverification\s+code\b/i,
  /\bauth(?:entication)?\s+code\b/i,
  /\blogin\s+successful\b/i,
  /\byou have successfully\s+log/i,
  /\bdo not share\b/i,
  /\bdon'?t share\b/i,
  /\bunsuccessful\b/i,
  /\bfailed\b/i,
  /\bdeclined\b/i,
  /\brejected\b/i,
  /\bcould not be processed\b/i,
  /\bcashback\b/i,
  /\bT&Cs?\b/i,
  /\bterms\s+(?:and|&)\s+conditions\b/i,
  /\bavail\b.*\b%/i,
  /\bpromo(?:tion)?\b/i,
  /\boffer\b.*\b%|\b%\s*off\b/i,
  /\bclick\s+here\b/i,
  /\bdownload\s+(?:our\s+)?app\b/i,
  /\bunsubscribe\b/i,
  /\bmarketing\b/i,
  /\blucky\s+draw\b/i,
  /\bpin\s+(?:is|code)\b/i,
  /\byour\s+code\s+is\b/i,
]

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function parseAmount(text: string): number | null {
  const m = text.match(/(?:PKR|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/i)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseTid(text: string): string | null {
  const m = text.match(/\bTID\s*[:=]?\s*([A-Za-z0-9-]+)/i)
  return m ? m[1] : null
}

function parseAccountMask(text: string): string | null {
  const m = text.match(/(?:AC#|A\/C|account)\s*[#:]?\s*(x+\d{2,}|\*{2,}\d{2,}|\d{4,})/i)
    || text.match(/\b(x{2,}\d{3,}|\*{2,}\d{3,})\b/i)
  return m ? m[1].toLowerCase() : null
}

function parseCounterparty(text: string): string | null {
  const sent = text.match(/\bsent to\s+([A-Z0-9 .'-]{2,40}?)(?:\s+PK|\s+as\s+|\s+on\s+)/i)
  if (sent) return sent[1].trim()
  const recv = text.match(/\breceived from\s+([A-Z0-9 .'-]{2,40}?)(?:\s+AC|\s+PK|\s+as\s+|\s+on\s+)/i)
  if (recv) return recv[1].trim()
  return null
}

function parseBankHint(text: string): string | null {
  for (const { re, hint } of BANK_HINTS) {
    if (!hint) continue
    if (re.test(text)) return hint
  }
  return null
}

function parseOccurred(text: string): { isoDate: string | null; occurredAt: string | null } {
  const m = text.match(/\bon\s+(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{4})(?:\s+at\s+(\d{1,2}):(\d{2}))?/i)
  if (!m) {
    const m2 = text.match(/\bat\s+(\d{1,2}):(\d{2})\s+on\s+(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{4})/i)
    if (!m2) return { isoDate: null, occurredAt: null }
    const day = Number(m2[3])
    const mon = MONTHS[m2[4].toLowerCase()]
    const year = Number(m2[5])
    const hh = m2[1].padStart(2, '0')
    const mm = m2[2]
    if (!mon) return { isoDate: null, occurredAt: null }
    const isoDate = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return { isoDate, occurredAt: `${isoDate}T${hh}:${mm}:00` }
  }
  const day = Number(m[1])
  const mon = MONTHS[m[2].toLowerCase()]
  const year = Number(m[3])
  if (!mon) return { isoDate: null, occurredAt: null }
  const isoDate = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (m[4] && m[5]) {
    return { isoDate, occurredAt: `${isoDate}T${m[4].padStart(2, '0')}:${m[5]}:00` }
  }
  return { isoDate, occurredAt: isoDate }
}

function fingerprint(parts: {
  amount: number | null
  date: string | null
  tid: string | null
  kind: string
  mask: string | null
  raw: string
}): string {
  const base = [
    parts.kind,
    parts.amount ?? '',
    parts.date ?? '',
    parts.tid ?? '',
    parts.mask ?? '',
    parts.raw.slice(0, 120).toLowerCase().replace(/\s+/g, ' '),
  ].join('|')
  let h = 0
  for (let i = 0; i < base.length; i += 1) {
    h = ((h << 5) - h) + base.charCodeAt(i)
    h |= 0
  }
  return `sms_${Math.abs(h).toString(16)}`
}

function classify(text: string, tid: string | null): { kind: BankSmsKind; reason: string; confidence: number } {
  const t = text

  if (/\breversed?\b/i.test(t) || /\bis reversed into\b/i.test(t)) {
    return { kind: 'reversal', reason: 'keyword:reversed', confidence: 0.92 }
  }
  if (/\breceived from\b/i.test(t) || /\byou have received\b/i.test(t) || /\bhas been credited\b/i.test(t) || /\bcredited to\b/i.test(t) || /\bdeposited\b/i.test(t)) {
    return { kind: 'income', reason: 'keyword:received/credited', confidence: 0.9 }
  }
  if (/\bsent to\b/i.test(t) || /\braast payment from your\b/i.test(t) || /\btransfer(?:red)? to\b/i.test(t)) {
    return { kind: 'expense', reason: 'keyword:sent/raast', confidence: 0.9 }
  }
  if (/\batm\b/i.test(t) || /\bcash withdraw(?:al)?\b/i.test(t) || /\bwithdrawn from atm\b/i.test(t) || /\bcwdr\b/i.test(t)) {
    return { kind: 'atm', reason: 'keyword:atm', confidence: 0.93 }
  }
  // Debited + TID (and not already matched as sent/received) → ATM
  if (/\bdebited\b/i.test(t) && tid) {
    return { kind: 'atm', reason: 'debited+TID', confidence: 0.78 }
  }
  if (/\bpurchase\b/i.test(t) || /\bpos\b/i.test(t) || /\bonline\b/i.test(t)) {
    return { kind: 'expense', reason: 'keyword:purchase/pos', confidence: 0.85 }
  }
  if (/\bdebited\b/i.test(t)) {
    return { kind: 'expense', reason: 'debited', confidence: 0.65 }
  }
  if (/\bwithdrawn\b/i.test(t)) {
    return { kind: 'atm', reason: 'keyword:withdrawn', confidence: 0.7 }
  }

  return { kind: 'unknown', reason: 'no-match', confidence: 0.2 }
}

/**
 * Parse a bank SMS / alert body into a structured draft.
 * Phase 1: on-device / paste only — no network.
 * Phase 5: optional kindOverrides from user corrections.
 */
export function parseBankSms(
  rawInput: string,
  opts?: { kindOverrides?: KindOverride[] },
): ParsedBankSms {
  const raw = normalize(rawInput)
  const empty: ParsedBankSms = {
    ok: false,
    kind: 'unknown',
    amount: null,
    occurredAt: null,
    date: null,
    tid: null,
    counterparty: null,
    accountMask: null,
    bankHint: null,
    confidence: 0,
    reason: 'empty',
    fingerprint: 'sms_empty',
    raw,
    ignore: true,
    ignoreReason: 'empty',
  }
  if (!raw) return empty

  for (const re of IGNORE_RES) {
    if (re.test(raw)) {
      return {
        ...empty,
        ok: false,
        ignore: true,
        ignoreReason: `filtered:${re.source}`,
        fingerprint: fingerprint({
          amount: null, date: null, tid: null, kind: 'ignore', mask: null, raw,
        }),
        reason: 'ignored',
      }
    }
  }

  const amount = parseAmount(raw)
  const tid = parseTid(raw)
  const accountMask = parseAccountMask(raw)
  const counterparty = parseCounterparty(raw)
  const bankHint = parseBankHint(raw)
  const { isoDate, occurredAt } = parseOccurred(raw)
  const base = classify(raw, tid)
  const { kind, reason, confidence } = applyBankTemplate(raw, bankHint, base)

  const ok = amount != null && kind !== 'unknown'
  const parsed: ParsedBankSms = {
    ok,
    kind,
    amount,
    occurredAt,
    date: isoDate,
    tid,
    counterparty,
    accountMask,
    bankHint,
    confidence: ok ? confidence : Math.min(confidence, 0.4),
    reason,
    fingerprint: fingerprint({
      amount, date: isoDate, tid, kind, mask: accountMask, raw,
    }),
    raw,
    ignore: false,
  }
  return applyKindOverrides(parsed, opts?.kindOverrides ?? [])
}

export function kindToUiBucket(kind: BankSmsKind): BankSmsUiBucket {
  if (kind === 'atm') return 'atm'
  if (kind === 'income') return 'received'
  if (kind === 'reversal') return 'reversed'
  return 'expense'
}

export function defaultCategoryForKind(kind: BankSmsKind): string {
  if (kind === 'atm') return 'Bank Transfer'
  if (kind === 'income') return 'Other'
  if (kind === 'reversal') return 'Other'
  if (kind === 'expense') return 'Miscellaneous'
  return 'Miscellaneous'
}

export function todayIsoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
