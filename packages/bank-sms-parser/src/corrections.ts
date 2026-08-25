import type { BankSmsKind, ParsedBankSms } from './types'
import { normalizeMask } from './matchWallet'

/**
 * Learned corrections: “always treat matching SMS as this kind”.
 * Stored on BankSmsImportSettings.kind_overrides (synced).
 */
export type KindOverride = {
  kind: Exclude<BankSmsKind, 'unknown'>
  /** Match bank hint (e.g. meezan) */
  hint?: string
  /** Match account last-4 / mask */
  mask?: string
  /** Substring in raw body (lowercase match) */
  phrase?: string
}

function normHint(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Apply the first matching override; returns a shallow-updated parse. */
export function applyKindOverrides(
  parsed: ParsedBankSms,
  overrides: KindOverride[] = [],
): ParsedBankSms {
  if (parsed.ignore || !overrides.length) return parsed
  const maskKey = normalizeMask(parsed.accountMask)
  const hintKey = parsed.bankHint ? normHint(parsed.bankHint) : ''
  const rawLower = (parsed.raw || '').toLowerCase()

  for (const o of overrides) {
    if (!o?.kind || o.kind === 'unknown') continue
    let matched = false
    if (o.mask && maskKey && normalizeMask(o.mask) === maskKey) matched = true
    if (o.hint && hintKey && normHint(o.hint) === hintKey) matched = true
    if (o.phrase && rawLower.includes(o.phrase.toLowerCase())) matched = true
    // Require at least one criterion
    if (!o.mask && !o.hint && !o.phrase) continue
    if (!matched) continue
    return {
      ...parsed,
      kind: o.kind,
      confidence: Math.max(parsed.confidence, 0.88),
      reason: `override:${o.kind}`,
      ok: parsed.amount != null,
    }
  }
  return parsed
}

export function upsertKindOverride(
  overrides: KindOverride[],
  next: KindOverride,
): KindOverride[] {
  if (!next?.kind) return overrides
  const hint = next.hint ? normHint(next.hint) : ''
  const mask = next.mask ? normalizeMask(next.mask) : ''
  const phrase = (next.phrase || '').trim().toLowerCase()
  if (!hint && !mask && !phrase) return overrides

  const filtered = overrides.filter((o) => {
    const oh = o.hint ? normHint(o.hint) : ''
    const om = o.mask ? normalizeMask(o.mask) : ''
    const op = (o.phrase || '').trim().toLowerCase()
    // Replace same binding key
    if (mask && om === mask) return false
    if (!mask && hint && oh === hint && !om && !op) return false
    if (!mask && !hint && phrase && op === phrase) return false
    return true
  })
  const entry: KindOverride = { kind: next.kind }
  if (mask) entry.mask = mask
  if (hint) entry.hint = hint
  if (phrase) entry.phrase = phrase
  return [...filtered, entry]
}
