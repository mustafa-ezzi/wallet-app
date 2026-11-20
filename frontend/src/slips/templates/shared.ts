import type { SlipData, SlipDirection } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** `Rs 10,000` or `Rs 10,000.50`. Paisa shown only when present. */
export function slipMoney(amount: number, symbol: string): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100
  const hasCents = Math.round(rounded * 100) % 100 !== 0
  const text = rounded.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return `${symbol} ${text}`.trim()
}

/** `2026-09-05` → `05 Sep 2026`, parsed without time zones so the day never shifts. */
export function slipDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return iso || ''
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

/** `19 Nov 2026, 8:45 PM` in the phone's local time. */
export function slipDateTime(d: Date): string {
  const hours = d.getHours()
  const h12 = hours % 12 || 12
  const mins = String(d.getMinutes()).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h12}:${mins} ${hours < 12 ? 'AM' : 'PM'}`
}

export type SlipLabels = {
  title: string
  counterpartyLabel: string
  paymentColumn: string
  totalPaidLabel: string
  remainingLabel: string
  emptyText: string
}

export function slipLabels(direction: SlipDirection, kind: SlipData['kind']): SlipLabels {
  if (direction === 'owe') {
    return {
      title: 'Payment Slip',
      counterpartyLabel: 'Loan / payable',
      paymentColumn: 'Payment',
      totalPaidLabel: 'Total paid',
      remainingLabel: 'Remaining to pay',
      emptyText: 'No payments recorded yet.',
    }
  }
  return {
    title: 'Payment Receipt',
    counterpartyLabel: kind === 'project' ? 'Owed by (one-time payment)' : 'Owed by (installment plan)',
    paymentColumn: 'Payment received',
    totalPaidLabel: 'Total received',
    remainingLabel: 'Remaining to receive',
    emptyText: 'No payments received yet.',
  }
}
