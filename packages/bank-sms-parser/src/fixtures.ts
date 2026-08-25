/**
 * Phase 0 fixture pack — redacted Pakistani bank SMS samples.
 * Real product samples + additional synthetic patterns for parser tests.
 */

export type FixtureSms = {
  id: string
  label: string
  bank?: string
  expectedKind: 'expense' | 'atm' | 'income' | 'reversal' | 'unknown' | 'ignore'
  expectedAmount?: number
  text: string
}

export const FIXTURE_SMS: FixtureSms[] = [
  // ── Product samples (user-provided) ──────────────────────────────────────
  {
    id: 'product-atm-tid',
    label: 'ATM debit with TID',
    bank: 'generic',
    expectedKind: 'atm',
    expectedAmount: 50000,
    text: 'PKR 50,000.00 has been debited at 16:58 on 20-Aug-2026 TID:302750, If you have not done this transaction, please inform us at 021111331331',
  },
  {
    id: 'product-card-debit',
    label: 'Online / card expense (debited, no TID)',
    bank: 'generic',
    expectedKind: 'expense',
    expectedAmount: 2041,
    text: 'PKR 2,041.00 has been debited at 00:02 on 25-Aug-2026, If you have not done this transaction, please inform us at 021111331331',
  },
  {
    id: 'product-raast-sent',
    label: 'RAAST sent (has TID but is outbound transfer)',
    bank: 'generic',
    expectedKind: 'expense',
    expectedAmount: 230,
    text: 'PKR 230.00 sent to M.SHAKIR PK07TMFBxx161 as RAAST payment from your AC# xxx2554 of KHY E TANZEEM BRANCH on 22-Aug-2026 at 01:20 TID:633081.',
  },
  {
    id: 'product-raast-received',
    label: 'RAAST received',
    bank: 'generic',
    expectedKind: 'income',
    expectedAmount: 141000,
    text: 'PKR 141,000.00 received from Z.UL AC# xxxPYMT PK07UNIL01090 as RAAST payment to your AC# 0108532554 of KHY E TANZEEM BRANCH on 25-Aug-2026 at 12:25',
  },
  {
    id: 'product-reversed',
    label: 'Reversal into account',
    bank: 'generic',
    expectedKind: 'reversal',
    expectedAmount: 3147,
    text: 'PKR 3,147.00 is reversed into your A/C xxx2554 of KHY E TANZEEM BRANCH on 02-Aug-2026 at 02:38 TID:265023',
  },

  // ── Ignore / non-money ───────────────────────────────────────────────────
  {
    id: 'ignore-otp',
    label: 'OTP must not import',
    expectedKind: 'ignore',
    text: 'Your OTP for Meezan Bank is 482913. Do not share with anyone.',
  },
  {
    id: 'ignore-failed',
    label: 'Failed transaction',
    expectedKind: 'ignore',
    text: 'PKR 1,500.00 transaction was unsuccessful. If you have not done this, call 111.',
  },
  {
    id: 'ignore-marketing',
    label: 'Marketing blast',
    expectedKind: 'ignore',
    text: 'Meezan Bank: Avail 10% cashback on groceries this weekend. T&Cs apply.',
  },

  // ── ATM keyword variants ─────────────────────────────────────────────────
  {
    id: 'atm-keyword',
    label: 'Explicit ATM keyword',
    bank: 'hbl',
    expectedKind: 'atm',
    expectedAmount: 10000,
    text: 'HBL: PKR 10,000.00 withdrawn from ATM on 15-Jul-2026 at 14:22. A/C xx8899. Helpline 111-111-425',
  },
  {
    id: 'atm-cash-withdrawal',
    label: 'Cash withdrawal wording',
    bank: 'ubl',
    expectedKind: 'atm',
    expectedAmount: 5000,
    text: 'UBL Alert: Cash Withdrawal of PKR 5,000.00 on 10-Jun-2026 18:05 from A/C ***4412. Call 111-825-888 if not you.',
  },

  // ── Expense variants ─────────────────────────────────────────────────────
  {
    id: 'expense-pos',
    label: 'POS purchase',
    bank: 'meezan',
    expectedKind: 'expense',
    expectedAmount: 890.5,
    text: 'Meezan: PKR 890.50 Purchase at POS AL-FATAH on 12-May-2026 19:40 from Card ending 1234.',
  },
  {
    id: 'expense-online',
    label: 'Online purchase',
    bank: 'mcb',
    expectedKind: 'expense',
    expectedAmount: 3200,
    text: 'MCB: PKR 3,200.00 debited for online purchase on 03-Apr-2026. Card xx7788.',
  },
  {
    id: 'expense-jazzcash',
    label: 'JazzCash send',
    bank: 'jazzcash',
    expectedKind: 'expense',
    expectedAmount: 500,
    text: 'JazzCash: PKR 500.00 sent to 03001234567 on 01-Mar-2026 09:15. TID 998877. Fee PKR 0.',
  },

  // ── Income variants ──────────────────────────────────────────────────────
  {
    id: 'income-credited',
    label: 'Amount credited',
    bank: 'allied',
    expectedKind: 'income',
    expectedAmount: 25000,
    text: 'Allied Bank: PKR 25,000.00 has been credited to your A/C xxx9910 on 28-Feb-2026 at 11:00.',
  },
  {
    id: 'income-deposit',
    label: 'Deposit',
    bank: 'hbl',
    expectedKind: 'income',
    expectedAmount: 15000,
    text: 'HBL: PKR 15,000.00 deposited in A/C xx4455 on 20-Jan-2026 16:30.',
  },
  {
    id: 'income-easypaisa',
    label: 'Easypaisa received',
    bank: 'easypaisa',
    expectedKind: 'income',
    expectedAmount: 1200,
    text: 'Easypaisa: You have received PKR 1,200.00 from Ali on 05-Aug-2026. TID:EP5566.',
  },

  // ── Bank brand hints for wallet matching ─────────────────────────────────
  {
    id: 'hint-meezan-debit',
    label: 'Meezan brand in body',
    bank: 'meezan',
    expectedKind: 'expense',
    expectedAmount: 750,
    text: 'Dear Customer, PKR 750.00 has been debited from your Meezan Bank account on 08-Aug-2026 at 21:10.',
  },
  {
    id: 'hint-account-mask',
    label: 'Account mask only',
    expectedKind: 'expense',
    expectedAmount: 99,
    text: 'PKR 99.00 has been debited at 10:00 on 01-Aug-2026 from AC# xxx2554.',
  },

  // ── Edge: Rs instead of PKR ──────────────────────────────────────────────
  {
    id: 'rs-prefix-atm',
    label: 'Rs. prefix ATM',
    expectedKind: 'atm',
    expectedAmount: 2000,
    text: 'Rs. 2,000.00 has been debited at 12:00 on 11-Aug-2026 TID:111222, Inform us if not you.',
  },
]
