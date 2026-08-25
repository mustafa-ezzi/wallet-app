import {
  buildApproveDraft,
  parseBankSms,
  suggestBankWallet,
  preferCashWallet,
  type KindOverride,
  type WalletAlias,
  type WalletLike,
} from '@/src/lib/bank-sms-parser'
import { accountsApi, asList, bankSmsApi } from '@/src/api/client'

type Acc = { id: number; name: string; type: string }

async function loadWallets(): Promise<WalletLike[]> {
  try {
    const res = await accountsApi.list({ type: 'bank,cash' })
    return asList<Acc>(res.data)
      .filter((a) => a.type === 'bank' || a.type === 'cash')
      .map((a) => ({ id: a.id, name: a.name, type: a.type }))
  } catch {
    return []
  }
}

async function loadSettings(): Promise<{
  aliases: WalletAlias[]
  defaultCashId: number | null
  kindOverrides: KindOverride[]
}> {
  try {
    const res = await bankSmsApi.settings()
    return {
      aliases: (res.data.wallet_aliases || []) as WalletAlias[],
      defaultCashId: res.data.default_cash_wallet_id ?? null,
      kindOverrides: (res.data.kind_overrides || []) as KindOverride[],
    }
  } catch {
    return { aliases: [], defaultCashId: null, kindOverrides: [] }
  }
}

export type IngestResult =
  | { ok: true; id: number; kind: string }
  | { ok: false; reason: string }

/**
 * Parse a bank SMS body and create a pending import (no auto-approve).
 * Safe to call from UI or headless background task.
 */
export async function ingestBankSmsBody(
  body: string,
  source: 'android_sms' | 'notification' | 'paste' | 'share' = 'android_sms',
): Promise<IngestResult> {
  const text = (body || '').trim()
  if (!text) return { ok: false, reason: 'empty' }

  const { aliases, defaultCashId, kindOverrides } = await loadSettings()
  const parsed = parseBankSms(text, { kindOverrides })
  if (parsed.ignore) return { ok: false, reason: parsed.ignoreReason || 'ignored' }
  if (!parsed.amount) return { ok: false, reason: 'no-amount' }

  const wallets = await loadWallets()
  const draft = buildApproveDraft(parsed, wallets, undefined, { aliases, defaultCashId })
  const bank = suggestBankWallet(wallets, parsed, aliases)
  const cash = preferCashWallet(wallets, defaultCashId)

  try {
    const res = await bankSmsApi.create({
      kind: draft.kind,
      amount: draft.amount,
      tx_date: draft.date,
      fingerprint: parsed.fingerprint,
      tid: parsed.tid || '',
      counterparty: parsed.counterparty || '',
      bank_hint: parsed.bankHint || '',
      account_mask: parsed.accountMask || '',
      raw_snippet: parsed.raw.slice(0, 280),
      source,
      category: draft.category,
      notes: draft.notes,
      confidence: parsed.confidence,
      parse_reason: parsed.reason,
      parser_version: '1',
      suggested_account_id: bank?.id ?? draft.bankAccountId,
      resolved_account_id: bank?.id ?? draft.bankAccountId,
      cash_account_id: cash?.id ?? draft.cashAccountId,
      record_atm_as_expense: draft.recordAtmAsExpense,
    })
    return { ok: true, id: res.data.id, kind: res.data.kind }
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    return { ok: false, reason: typeof detail === 'string' ? detail : 'create-failed' }
  }
}
