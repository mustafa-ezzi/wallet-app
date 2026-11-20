// Writes sample slip HTML files to mobile/slip-samples/ for visual review (npm run slips:samples).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SLIP_LOGO_DATA_URI } from '../src/slips/logo.ts'
import { buildSlipData } from '../src/slips/slipData.ts'
import { classicTemplate } from '../src/slips/templates/classic.ts'

const outDir = join(import.meta.dirname, '..', 'slip-samples')
mkdirSync(outDir, { recursive: true })

function payments(count, amount, startMonth = 1, advance = 0) {
  const rows = []
  if (advance) rows.push({ transaction_id: null, date: '2025-12-20', amount: advance.toFixed(2), is_advance: true })
  for (let i = 0; i < count; i++) {
    const year = 2026 + Math.floor((startMonth - 1 + i) / 12)
    const month = ((startMonth - 1 + i) % 12) + 1
    rows.push({ transaction_id: 500 + i, date: `${year}-${String(month).padStart(2, '0')}-05`, amount: amount.toFixed(2), is_advance: false })
  }
  return rows.map((r, i) => ({ index: i + 1, ...r }))
}

function sample(file, h, highlight = null) {
  const paid = h.payments.reduce((s, p) => s + Number(p.amount), 0)
  const total = Number(h.total_amount)
  const remaining = Math.max(0, total - paid)
  const full = {
    status: remaining === 0 ? 'completed' : 'ongoing',
    advance_amount: '0.00',
    payment_count: h.payments.filter((p) => !p.is_advance).length,
    total_paid: paid.toFixed(2),
    remaining_amount: remaining.toFixed(2),
    paid_in_full: remaining === 0,
    closed_without_full_payment: false,
    monthly_amount: null,
    total_installments: null,
    installments_done: null,
    generated_at: new Date().toISOString(),
    ...h,
  }
  const data = buildSlipData(full, {
    preparedBy: 'Mustafa Moiz',
    currencySymbol: 'Rs',
    logoDataUri: SLIP_LOGO_DATA_URI,
    highlightTransactionId: highlight,
  })
  writeFileSync(join(outDir, file), classicTemplate.render(data))
  console.log(`  ${file}  (${data.payments.length} rows, remaining Rs ${remaining.toLocaleString()})`)
}

console.log(`Writing samples to ${outDir}`)
sample('1-loan-no-payments.html', {
  kind: 'payable', direction: 'owe', id: 4, name: 'Car loan — Meezan Bank', total_amount: '850000.00',
  payments: [], total_installments: 36, installments_done: 0,
})
sample('2-loan-one-payment.html', {
  kind: 'payable', direction: 'owe', id: 12, name: 'Bike loan', total_amount: '120000.00',
  payments: payments(1, 10000, 11), total_installments: 12, installments_done: 1,
}, 500)
sample('3-loan-paid-in-full-12.html', {
  kind: 'payable', direction: 'owe', id: 12, name: 'Bike loan', total_amount: '120000.00',
  payments: payments(12, 10000), total_installments: 12, installments_done: 12,
}, 511)
sample('4-installment-owed-40.html', {
  kind: 'receivable', direction: 'owed', id: 7, name: 'Ali Raza — laptop & phone', total_amount: '200000.00',
  payments: payments(40, 2500), total_installments: 80, installments_done: 40,
}, 539)
sample('5-one-time-with-advance.html', {
  kind: 'project', direction: 'owed', id: 3, name: 'Website for Ahmed Traders', total_amount: '150000.00',
  advance_amount: '50000.00', payments: payments(2, 25000, 2, 50000),
})
sample('6-closed-without-full-payment.html', {
  kind: 'payable', direction: 'owe', id: 9, name: 'Committee (BC)', total_amount: '60000.00',
  payments: payments(4, 10000), status: 'completed', closed_without_full_payment: true,
})
