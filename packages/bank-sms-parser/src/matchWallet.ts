import type { ParsedBankSms, WalletLike } from './types'

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Suggest a bank wallet from SMS hints (name / alias / account mask in name).
 * Cash wallets are never suggested as the bank side.
 */
export function suggestBankWallet(
  wallets: WalletLike[],
  parsed: Pick<ParsedBankSms, 'bankHint' | 'accountMask'>,
): WalletLike | null {
  const banks = wallets.filter((w) => w.type === 'bank')
  if (!banks.length) return null

  const mask = parsed.accountMask ? norm(parsed.accountMask).replace(/^x+/, '').replace(/^\*+/, '') : ''
  if (mask) {
    const byMask = banks.find((w) => norm(w.name).includes(mask) || norm(w.name).endsWith(mask.slice(-4)))
    if (byMask) return byMask
  }

  const hint = parsed.bankHint ? norm(parsed.bankHint) : ''
  if (hint) {
    const byHint = banks.find((w) => norm(w.name).includes(hint))
    if (byHint) return byHint
  }

  return banks.length === 1 ? banks[0] : null
}

export function preferCashWallet(wallets: WalletLike[]): WalletLike | null {
  const cash = wallets.filter((w) => w.type === 'cash')
  if (!cash.length) return null
  const named = cash.find((w) => /^cash$/i.test(w.name.trim()))
  return named ?? cash[0]
}
