/** Shared kinds for bank SMS import (Phase 0/1). */

export type BankSmsKind =
  | 'expense'
  | 'atm'
  | 'income'
  | 'reversal'
  | 'unknown'

/** UI buckets shown on approve screen. */
export type BankSmsUiBucket = 'expense' | 'atm' | 'received' | 'reversed'

export type ParsedBankSms = {
  ok: boolean
  kind: BankSmsKind
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
  type: 'bank' | 'cash' | string
}

export type ApproveDraft = {
  kind: BankSmsKind
  amount: number
  date: string
  bankAccountId: number | null
  cashAccountId: number | null
  category: string
  notes: string
  /** When ATM and no cash wallet — create one named this on approve. */
  createCashNamed: string | null
  /** Force expense instead of ATM transfer. */
  recordAtmAsExpense: boolean
}
