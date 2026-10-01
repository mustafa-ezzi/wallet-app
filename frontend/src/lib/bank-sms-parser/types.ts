/** Shared kinds for bank SMS import (Phase 0/1). */

export type BankSmsKind =
  | 'expense'
  | 'atm'
  | 'income'
  | 'reversal'
  | 'unknown'

/** Payment instrument: bank account vs credit card (Phase B). */
export type BankSmsInstrument = 'account' | 'credit_card' | 'unknown'

/** UI buckets shown on approve screen. */
export type BankSmsUiBucket = 'expense' | 'atm' | 'received' | 'reversed'

export type ParsedBankSms = {
  ok: boolean
  kind: BankSmsKind
  /** Whether SMS is about a credit card vs bank account. */
  instrument: BankSmsInstrument
  amount: number | null
  occurredAt: string | null
  /** ISO date YYYY-MM-DD when parseable */
  date: string | null
  tid: string | null
  counterparty: string | null
  accountMask: string | null
  bankHint: string | null
  confidence: number
  /** Why this kind was chosen (debug / UI hint). */
  reason: string
  /** Normalized fingerprint for dedupe (Phase 2). */
  fingerprint: string
  raw: string
  ignore: boolean
  ignoreReason?: string
}

export type WalletLike = {
  id: number
  name: string
  type: 'bank' | 'cash' | 'credit_card' | string
}

export type ApproveDraft = {
  kind: BankSmsKind
  amount: number
  date: string
  /** Primary wallet (bank or credit card destination). */
  bankAccountId: number | null
  cashAccountId: number | null
  /** Phase C: bank wallet money came from for card bill payment. */
  sourceBankAccountId: number | null
  category: string
  notes: string
  /** When ATM and no cash wallet — create one named this on approve. */
  createCashNamed: string | null
  /** Force expense instead of ATM transfer. */
  recordAtmAsExpense: boolean
  /**
   * Phase C: card payment as income-only on the card (no bank→card transfer).
   * Default false when a source bank is available.
   */
  recordCardPaymentAsIncomeOnly: boolean
}
