import type { BankSmsKind } from './types'

/** Bank-specific patterns that refine classification after generic rules. */
export type BankTemplateRule = {
  /** Substring / regex against message body */
  re: RegExp
  kind: BankSmsKind
  confidence: number
  reason: string
}

export type BankTemplate = {
  hint: string
  rules: BankTemplateRule[]
}

/**
 * Per-bank templates (Phase 5). Matched when `bankHint` equals `hint`.
 * First matching rule wins for that bank.
 */
export const BANK_TEMPLATES: BankTemplate[] = [
  {
    hint: 'meezan',
    rules: [
      { re: /\batm\b/i, kind: 'atm', confidence: 0.95, reason: 'meezan:atm' },
      { re: /\bpos\b|\bpurchase\b/i, kind: 'expense', confidence: 0.9, reason: 'meezan:pos' },
      { re: /\braast\b.*\bsent\b|\bsent to\b/i, kind: 'expense', confidence: 0.92, reason: 'meezan:raast-out' },
      { re: /\breceived from\b|\bcredited\b/i, kind: 'income', confidence: 0.92, reason: 'meezan:in' },
    ],
  },
  {
    hint: 'hbl',
    rules: [
      { re: /\batm\b|\bcash\s*withdraw/i, kind: 'atm', confidence: 0.95, reason: 'hbl:atm' },
      { re: /\bpurchase\b|\bpos\b|\bonline\b/i, kind: 'expense', confidence: 0.9, reason: 'hbl:purchase' },
      { re: /\breversed?\b/i, kind: 'reversal', confidence: 0.93, reason: 'hbl:reversal' },
    ],
  },
  {
    hint: 'ubl',
    rules: [
      { re: /\bcash\s*withdrawal|\batm\b/i, kind: 'atm', confidence: 0.95, reason: 'ubl:atm' },
      { re: /\bdebited\b/i, kind: 'expense', confidence: 0.72, reason: 'ubl:debit' },
    ],
  },
  {
    hint: 'jazzcash',
    rules: [
      { re: /\bsent\b|\bpaid\b|\btransfer/i, kind: 'expense', confidence: 0.9, reason: 'jazzcash:out' },
      { re: /\breceived\b|\bcredited\b/i, kind: 'income', confidence: 0.9, reason: 'jazzcash:in' },
    ],
  },
  {
    hint: 'easypaisa',
    rules: [
      { re: /\bsent\b|\bpaid\b/i, kind: 'expense', confidence: 0.9, reason: 'easypaisa:out' },
      { re: /\breceived\b/i, kind: 'income', confidence: 0.9, reason: 'easypaisa:in' },
    ],
  },
  {
    hint: 'alfalah',
    rules: [
      { re: /\batm\b|\bcwdr\b/i, kind: 'atm', confidence: 0.94, reason: 'alfalah:atm' },
      { re: /\breversed?\b/i, kind: 'reversal', confidence: 0.93, reason: 'alfalah:reversal' },
    ],
  },
]

export function applyBankTemplate(
  text: string,
  bankHint: string | null,
  base: { kind: BankSmsKind; reason: string; confidence: number },
): { kind: BankSmsKind; reason: string; confidence: number } {
  if (!bankHint) return base
  const tmpl = BANK_TEMPLATES.find((t) => t.hint === bankHint.toLowerCase())
  if (!tmpl) return base
  for (const rule of tmpl.rules) {
    if (rule.re.test(text)) {
      // Prefer template when equal/higher confidence, or when base is weak/unknown
      if (
        base.kind === 'unknown'
        || rule.confidence >= base.confidence
        || (base.confidence < 0.7 && rule.confidence >= 0.85)
      ) {
        return { kind: rule.kind, reason: rule.reason, confidence: rule.confidence }
      }
    }
  }
  return base
}
