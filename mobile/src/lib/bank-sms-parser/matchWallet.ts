import type { ParsedBankSms, WalletLike } from './types'

export type WalletAlias = {
  /** Bank wallet id */
  account_id: number
  /** Bank brand / keyword e.g. meezan, hbl */
  hint?: string
  /** Account mask or last-4 e.g. xxx2554 / 2554 */
  mask?: string
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Digits-only tail used for mask matching (last 4 when longer). */
export function normalizeMask(mask: string | null | undefined): string {
  if (!mask) return ''
  const digits = String(mask).replace(/\D/g, '')
  if (!digits) return norm(mask)
  return digits.length > 4 ? digits.slice(-4) : digits
}

export type WalletSuggestResult = {
  wallet: WalletLike | null
  /** How we matched */
  via: 'alias-mask' | 'alias-hint' | 'name-mask' | 'name-hint' | 'single' | 'none'
  confidence: number
}

/**
 * Suggest a bank wallet from SMS hints + user aliases.
 * Priority: alias mask → alias hint → name mask → name hint → sole bank wallet.
 */
export function suggestBankWallet(
  wallets: WalletLike[],
  parsed: Pick<ParsedBankSms, 'bankHint' | 'accountMask'>,
  aliases: WalletAlias[] = [],
): WalletLike | null {
  return suggestBankWalletDetailed(wallets, parsed, aliases).wallet
}

export function suggestBankWalletDetailed(
  wallets: WalletLike[],
  parsed: Pick<ParsedBankSms, 'bankHint' | 'accountMask'>,
  aliases: WalletAlias[] = [],
): WalletSuggestResult {
  const banks = wallets.filter((w) => w.type === 'bank')
  if (!banks.length) return { wallet: null, via: 'none', confidence: 0 }

  const byId = new Map(banks.map((w) => [w.id, w]))
  const maskKey = normalizeMask(parsed.accountMask)
  const hintKey = parsed.bankHint ? norm(parsed.bankHint) : ''

  if (maskKey) {
    for (const a of aliases) {
      if (!a.mask || !a.account_id) continue
      if (normalizeMask(a.mask) === maskKey && byId.has(a.account_id)) {
        return { wallet: byId.get(a.account_id)!, via: 'alias-mask', confidence: 0.98 }
      }
    }
  }

  if (hintKey) {
    for (const a of aliases) {
      if (!a.hint || !a.account_id) continue
      if (norm(a.hint) === hintKey && byId.has(a.account_id)) {
        return { wallet: byId.get(a.account_id)!, via: 'alias-hint', confidence: 0.95 }
      }
    }
  }

  if (maskKey) {
    const byMask = banks.find(
      (w) => norm(w.name).includes(maskKey) || normalizeMask(w.name) === maskKey
        || norm(w.name).endsWith(maskKey),
    )
    if (byMask) return { wallet: byMask, via: 'name-mask', confidence: 0.85 }
  }

  if (hintKey) {
    const byHint = banks.find((w) => norm(w.name).includes(hintKey))
    if (byHint) return { wallet: byHint, via: 'name-hint', confidence: 0.8 }
  }

  if (banks.length === 1) {
    return { wallet: banks[0], via: 'single', confidence: 0.55 }
  }

  return { wallet: null, via: 'none', confidence: 0 }
}

export function preferCashWallet(
  wallets: WalletLike[],
  defaultCashId?: number | null,
): WalletLike | null {
  const cash = wallets.filter((w) => w.type === 'cash')
  if (!cash.length) return null
  if (defaultCashId != null) {
    const preferred = cash.find((w) => w.id === defaultCashId)
    if (preferred) return preferred
  }
  const named = cash.find((w) => /^cash$/i.test(w.name.trim()))
  return named ?? cash[0]
}

/** Upsert a mask and/or hint binding for a wallet. */
export function upsertWalletAlias(
  aliases: WalletAlias[],
  binding: { account_id: number; hint?: string | null; mask?: string | null },
): WalletAlias[] {
  const account_id = binding.account_id
  if (!account_id) return aliases
  const hint = binding.hint ? norm(binding.hint) : ''
  const mask = normalizeMask(binding.mask)
  let next = [...aliases]

  if (mask) {
    next = next.filter((a) => !(a.mask && normalizeMask(a.mask) === mask))
    next.push({ account_id, mask })
  }
  if (hint) {
    next = next.filter((a) => !(a.hint && norm(a.hint) === hint && !a.mask))
    // Prefer a single hint→wallet row (keep mask rows separate)
    const hasHintRow = next.some((a) => a.hint && norm(a.hint) === hint && a.account_id === account_id)
    if (!hasHintRow) next.push({ account_id, hint })
  }
  return next
}

/** True when the user must explicitly pick type before approve. */
export function needsManualTypePick(parsed: Pick<ParsedBankSms, 'kind' | 'confidence'>): boolean {
  if (parsed.kind === 'unknown') return true
  return (parsed.confidence ?? 0) < 0.5
}
