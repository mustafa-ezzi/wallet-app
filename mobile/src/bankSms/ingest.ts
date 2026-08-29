import {
  buildApproveDraft,
  needsManualTypePick,
  parseBankSms,
  suggestBankWallet,
  preferCashWallet,
  type BankSmsKind,
  type KindOverride,
  type WalletAlias,
  type WalletLike,
} from '@/src/lib/bank-sms-parser'
import { accountsApi, asList, bankSmsApi } from '@/src/api/client'
import { getBankSmsAutoApprove } from './storage'
import { bankHintForPackage, bankLabelFromText } from './walletApps'

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

export type IngestMeta = {
  packageName?: string
  appName?: string
}

function guessKindFromBody(text: string): BankSmsKind {
  if (/\breceived\b|\bcredited\b|\bincoming\b|\bdeposited\b/i.test(text)) return 'income'
  if (/\breversed?\b/i.test(text)) return 'reversal'
  if (/\batm\b|\bwithdraw/i.test(text)) return 'atm'
  return 'expense'
}

/**
 * Parse a bank SMS / alert body and create a pending import.
 * If the user enabled "Add automatically" and a bank wallet can be resolved,
 * also approve immediately (SMS / notification only — not manual paste).
 * Safe to call from UI or headless background task.
 */
export async function ingestBankSmsBody(
  body: string,
  source: 'android_sms' | 'notification' | 'paste' | 'share' = 'android_sms',
  meta?: IngestMeta,
): Promise<IngestResult> {
  const text = (body || '').trim()
  if (!text) return { ok: false, reason: 'empty' }

  const { aliases, defaultCashId, kindOverrides } = await loadSettings()
  let parsed = parseBankSms(text, { kindOverrides })

  // Force bank hint from notification package when parser missed brand in body
  const pkgHint = meta?.packageName ? bankHintForPackage(meta.packageName) : null
  const labelHint = bankLabelFromText(text)
  const forcedHint =
    pkgHint
    || (labelHint === 'NayaPay'
      ? 'nayapay'
      : labelHint === 'SadaPay'
        ? 'sadapay'
        : labelHint === 'JazzCash'
          ? 'jazzcash'
          : labelHint === 'Easypaisa'
            ? 'easypaisa'
            : null)

  if (forcedHint && !parsed.bankHint) {
    parsed = { ...parsed, bankHint: forcedHint }
  }

  if (parsed.ignore) return { ok: false, reason: parsed.ignoreReason || 'ignored' }
  if (!parsed.amount) return { ok: false, reason: 'no-amount' }

  // Auto-capture: paste can be weak; SMS still needs a clear parse.
  // Wallet notifications often omit classic bank verbs — accept amount + known wallet.
  if (source !== 'paste' && !parsed.ok) {
    const walletPush =
      source === 'notification'
      && Boolean(forcedHint || parsed.bankHint)
    if (walletPush) {
      const kind = parsed.kind === 'unknown' ? guessKindFromBody(text) : parsed.kind
      parsed = {
        ...parsed,
        ok: true,
        kind,
        confidence: Math.max(parsed.confidence, 0.7),
        reason: parsed.reason === 'no-match' ? `wallet-notif:${forcedHint || parsed.bankHint}` : parsed.reason,
      }
    } else {
      return { ok: false, reason: 'weak-parse' }
    }
  }

  const wallets = await loadWallets()
  const draft = buildApproveDraft(parsed, wallets, undefined, { aliases, defaultCashId })
  const bank = suggestBankWallet(wallets, parsed, aliases)
  const cash = preferCashWallet(wallets, defaultCashId)

  const bankId = bank?.id ?? draft.bankAccountId
  const cashId = cash?.id ?? draft.cashAccountId

  try {
    const res = await bankSmsApi.create({
      kind: draft.kind,
      amount: draft.amount,
      tx_date: draft.date,
      fingerprint: parsed.fingerprint,
      tid: parsed.tid || '',
      counterparty: parsed.counterparty || '',
      bank_hint: parsed.bankHint || forcedHint || '',
      account_mask: parsed.accountMask || '',
      raw_snippet: parsed.raw.slice(0, 280),
      source,
      category: draft.category,
      notes: draft.notes,
      confidence: parsed.confidence,
      parse_reason: parsed.reason,
      parser_version: '1',
      suggested_account_id: bankId,
      resolved_account_id: bankId,
      cash_account_id: cashId,
      record_atm_as_expense: draft.recordAtmAsExpense,
    })

    const id = res.data.id
    const kind = res.data.kind
    const autoOn = await getBankSmsAutoApprove()
    const canAuto =
      autoOn
      && (source === 'android_sms' || source === 'notification')
      && Boolean(bankId)
      && !needsManualTypePick(parsed)

    if (canAuto && bankId) {
      try {
        await bankSmsApi.approve(id, {
          kind: draft.kind,
          amount: draft.amount,
          tx_date: draft.date,
          category: draft.category,
          notes: draft.notes,
          resolved_account_id: bankId,
          cash_account_id: cashId,
          record_atm_as_expense: draft.recordAtmAsExpense,
          create_cash: draft.kind === 'atm' && !draft.recordAtmAsExpense && !cashId,
          create_cash_name: draft.createCashNamed || 'Cash',
        })
      } catch {
        // Leave pending for inbox review if approve fails.
      }
    }

    return { ok: true, id, kind }
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    return { ok: false, reason: typeof detail === 'string' ? detail : 'create-failed' }
  }
}
