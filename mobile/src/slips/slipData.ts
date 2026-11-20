import { slipMoney } from './templates/shared'
import type { SlipData, SlipHistoryResponse, SlipKind } from './types'

export const DEFAULT_STORE_URL = 'https://play.google.com/store/apps/details?id=com.wallettrails.android'

/**
 * Text to share with the PDF (§3.11). expo-sharing cannot attach this to the file,
 * so the sheet offers a separate Share / Copy message action.
 */
export function buildSlipShareMessage(data: SlipData): string {
  const paidWord = data.direction === 'owe' ? 'paid' : 'received'
  const title = data.direction === 'owe' ? 'Payment slip' : 'Payment receipt'
  const paid = slipMoney(data.totalPaid, data.currencySymbol)
  const remaining = slipMoney(data.remaining, data.currencySymbol)
  const store = (data.storeUrl || '').trim() || DEFAULT_STORE_URL
  return (
    `${title} for ${data.counterparty} — ${paid} ${paidWord}, ${remaining} remaining.\n`
    + `Generated with WalletTrails: ${store}`
  )
}

const KIND_PREFIX: Record<SlipKind, string> = { payable: 'P', receivable: 'R', project: 'O' }

function num(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** `WT-P12-0004` = loan 12 with 4 payments recorded when the slip was made. */
export function buildSlipNumber(kind: SlipKind, id: number, paymentCount: number): string {
  return `WT-${KIND_PREFIX[kind]}${id}-${String(Math.max(0, paymentCount)).padStart(4, '0')}`
}

/** `Bike loan` → `WalletTrails_Slip_Bike_loan_19-Nov-2026.pdf` */
export function slipFileName(counterparty: string, at: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const safe = counterparty.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Record'
  const day = String(at.getDate()).padStart(2, '0')
  return `WalletTrails_Slip_${safe}_${day}-${months[at.getMonth()]}-${at.getFullYear()}.pdf`
}

export function buildSlipData(
  history: SlipHistoryResponse,
  opts: {
    preparedBy: string
    currencySymbol: string
    logoDataUri: string
    storeUrl?: string | null
    highlightTransactionId?: number | null
    generatedAt?: Date
  },
): SlipData {
  const hasInstallments = history.total_installments != null && history.total_installments > 0
  return {
    kind: history.kind,
    direction: history.direction,
    slipNumber: buildSlipNumber(history.kind, history.id, history.payment_count),
    preparedBy: opts.preparedBy.trim() || 'WalletTrails user',
    counterparty: history.name,
    totalAmount: num(history.total_amount),
    totalPaid: num(history.total_paid),
    remaining: num(history.remaining_amount),
    payments: history.payments.map((p) => ({
      index: p.index,
      transactionId: p.transaction_id,
      date: p.date,
      amount: num(p.amount),
      isAdvance: p.is_advance,
    })),
    paidInFull: history.paid_in_full,
    closedWithoutFullPayment: history.closed_without_full_payment,
    installments: hasInstallments
      ? { done: history.installments_done ?? 0, total: history.total_installments ?? 0 }
      : null,
    generatedAt: opts.generatedAt ?? new Date(),
    storeUrl: (opts.storeUrl || '').trim() || DEFAULT_STORE_URL,
    highlightTransactionId: opts.highlightTransactionId ?? null,
    currencySymbol: opts.currencySymbol,
    logoDataUri: opts.logoDataUri,
  }
}
