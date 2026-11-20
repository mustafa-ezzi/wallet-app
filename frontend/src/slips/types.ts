export type SlipKind = 'payable' | 'receivable' | 'project'

/** `owe` = money you owe (you paid), `owed` = money owed to you (you received). */
export type SlipDirection = 'owe' | 'owed'

export type SlipPayment = {
  index: number
  transactionId: number | null
  /** YYYY-MM-DD */
  date: string
  amount: number
  isAdvance: boolean
}

/** Everything a slip template needs. Templates must not fetch or import app state. */
export type SlipData = {
  kind: SlipKind
  direction: SlipDirection
  slipNumber: string
  preparedBy: string
  counterparty: string
  totalAmount: number
  totalPaid: number
  remaining: number
  payments: SlipPayment[]
  paidInFull: boolean
  closedWithoutFullPayment: boolean
  installments: { done: number; total: number } | null
  generatedAt: Date
  storeUrl: string
  /** Payment to mark as "This payment" (the one just recorded). */
  highlightTransactionId: number | null
  currencySymbol: string
  logoDataUri: string
}

export type SlipTemplate = {
  id: string
  label: string
  render: (data: SlipData) => string
}

/** Shape returned by GET /api/{payables|receivables|projects}/<id>/payments/. */
export type SlipHistoryResponse = {
  kind: SlipKind
  direction: SlipDirection
  id: number
  name: string
  status: string
  total_amount: string
  advance_amount: string
  payments: {
    index: number
    transaction_id: number | null
    date: string
    amount: string
    is_advance: boolean
  }[]
  payment_count: number
  total_paid: string
  remaining_amount: string
  paid_in_full: boolean
  closed_without_full_payment: boolean
  monthly_amount: string | null
  total_installments: number | null
  installments_done: number | null
  generated_at: string
}
