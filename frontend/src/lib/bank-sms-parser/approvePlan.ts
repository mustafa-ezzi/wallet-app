import { defaultCategoryForKind, todayIsoDate } from './parse'
import { preferCashWallet, suggestBankWallet } from './matchWallet'
import type { WalletAlias } from './matchWallet'
import type { ApproveDraft, BankSmsKind, ParsedBankSms, WalletLike } from './types'

export type ApprovePlanStep = {
  type: 'expense' | 'income'
  amount: number
  date: string
  /** Resolved before post; null means create cash first. */
  accountId: number | null
  accountRole: 'bank' | 'cash'
  category: string
  notes: string
}

export type ApprovePlan = {
  steps: ApprovePlanStep[]
  createCashNamed: string | null
  summary: string
}

/** Build editable draft defaults from a parse + wallets (+ optional aliases). */
export function buildApproveDraft(
  parsed: ParsedBankSms,
  wallets: WalletLike[],
  overrides?: Partial<ApproveDraft>,
  opts?: { aliases?: WalletAlias[]; defaultCashId?: number | null },
): ApproveDraft {
  const bank = suggestBankWallet(wallets, parsed, opts?.aliases ?? [])
  const cash = preferCashWallet(wallets, opts?.defaultCashId)
  const kind = (overrides?.kind ?? parsed.kind) as BankSmsKind
  const amount = overrides?.amount ?? parsed.amount ?? 0
  const date = overrides?.date ?? parsed.date ?? todayIsoDate()

  const noteBits = [
    parsed.counterparty ? `To/From: ${parsed.counterparty}` : null,
    parsed.tid ? `TID:${parsed.tid}` : null,
    'via bank SMS',
  ].filter(Boolean)

  return {
    kind: kind === 'unknown' ? 'expense' : kind,
    amount,
    date,
    bankAccountId: overrides?.bankAccountId ?? bank?.id ?? null,
    cashAccountId: overrides?.cashAccountId ?? cash?.id ?? null,
    category: overrides?.category ?? defaultCategoryForKind(kind === 'unknown' ? 'expense' : kind),
    notes: overrides?.notes ?? noteBits.join(' · '),
    createCashNamed: cash ? null : 'Cash',
    recordAtmAsExpense: overrides?.recordAtmAsExpense ?? false,
  }
}

/**
 * Turn an approval draft into concrete transaction steps.
 * ATM → bank expense + cash income (Bank Transfer), unless recordAtmAsExpense.
 */
export function buildApprovePlan(draft: ApproveDraft): ApprovePlan {
  const amount = draft.amount
  const date = draft.date
  const notes = draft.notes.trim() || 'Bank SMS'

  if (!(amount > 0)) {
    return { steps: [], createCashNamed: null, summary: 'Invalid amount' }
  }

  if (draft.kind === 'atm' && !draft.recordAtmAsExpense) {
    const needCash = draft.cashAccountId == null
    return {
      createCashNamed: needCash ? (draft.createCashNamed || 'Cash') : null,
      summary: needCash
        ? `ATM: create ${draft.createCashNamed || 'Cash'} and transfer PKR ${amount}`
        : `ATM: transfer PKR ${amount} bank → cash`,
      steps: [
        {
          type: 'expense',
          amount,
          date,
          accountId: draft.bankAccountId,
          accountRole: 'bank',
          category: 'Bank Transfer',
          notes: `${notes} (ATM out)`,
        },
        {
          type: 'income',
          amount,
          date,
          accountId: draft.cashAccountId,
          accountRole: 'cash',
          category: 'Bank Transfer',
          notes: `${notes} (ATM in)`,
        },
      ],
    }
  }

  if (draft.kind === 'income' || draft.kind === 'reversal') {
    return {
      createCashNamed: null,
      summary: draft.kind === 'reversal'
        ? `Reversal income PKR ${amount}`
        : `Income PKR ${amount}`,
      steps: [
        {
          type: 'income',
          amount,
          date,
          accountId: draft.bankAccountId,
          accountRole: 'bank',
          category: draft.category || 'Other',
          notes: draft.kind === 'reversal' ? `${notes} (reversal)` : notes,
        },
      ],
    }
  }

  // expense (including ATM-as-expense)
  return {
    createCashNamed: null,
    summary: `Expense PKR ${amount}`,
    steps: [
      {
        type: 'expense',
        amount,
        date,
        accountId: draft.bankAccountId,
        accountRole: 'bank',
        category: draft.category || 'Miscellaneous',
        notes,
      },
    ],
  }
}
