// Run: npm run test:slips
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classicTemplate } from '../templates/classic.ts'
import { minimalTemplate } from '../templates/minimal.ts'
import { receiptTemplate } from '../templates/receipt.ts'
import { getSlipTemplate, SLIP_TEMPLATES } from '../templates/index.ts'
import { slipDate, slipMoney } from '../templates/shared.ts'
import { buildSlipData, buildSlipNumber, buildSlipShareMessage, DEFAULT_STORE_URL, slipFileName } from '../slipData.ts'

const LOGO = 'data:image/png;base64,TEST'

function history(overrides = {}) {
  return {
    kind: 'payable',
    direction: 'owe',
    id: 12,
    name: 'Bike loan',
    status: 'ongoing',
    total_amount: '120000.00',
    advance_amount: '0.00',
    payments: [
      { index: 1, transaction_id: 101, date: '2026-09-05', amount: '10000.00', is_advance: false },
      { index: 2, transaction_id: 102, date: '2026-10-05', amount: '10000.00', is_advance: false },
      { index: 3, transaction_id: 103, date: '2026-11-05', amount: '10000.00', is_advance: false },
    ],
    payment_count: 3,
    total_paid: '30000.00',
    remaining_amount: '90000.00',
    paid_in_full: false,
    closed_without_full_payment: false,
    monthly_amount: '10000.00',
    total_installments: 12,
    installments_done: 3,
    generated_at: '2026-11-19T15:00:00Z',
    ...overrides,
  }
}

function render(h, opts = {}) {
  const data = buildSlipData(h, {
    preparedBy: 'Mustafa Moiz',
    currencySymbol: 'Rs',
    logoDataUri: LOGO,
    generatedAt: new Date(2026, 10, 19, 20, 45),
    ...opts,
  })
  return { data, html: classicTemplate.render(data) }
}

function bodyRows(html) {
  const tbody = html.split('<tbody>')[1].split('</tbody>')[0]
  return [...tbody.matchAll(/<td class="sno">(\d+)<\/td>/g)].map((m) => Number(m[1]))
}

test('money and dates format without time zone shifts', () => {
  assert.equal(slipMoney(10000, 'Rs'), 'Rs 10,000')
  assert.equal(slipMoney(10000.5, 'Rs'), 'Rs 10,000.50')
  assert.equal(slipMoney(0, 'Rs'), 'Rs 0')
  assert.equal(slipDate('2026-09-05'), '05 Sep 2026')
  assert.equal(slipDate('2026-01-01'), '01 Jan 2026')
})

test('slip number and file name', () => {
  assert.equal(buildSlipNumber('payable', 12, 4), 'WT-P12-0004')
  assert.equal(buildSlipNumber('receivable', 7, 0), 'WT-R7-0000')
  assert.equal(buildSlipNumber('project', 3, 15), 'WT-O3-0015')
  assert.equal(slipFileName('Bike loan / Honda', new Date(2026, 10, 19)), 'WalletTrails_Slip_Bike_loan_Honda_19-Nov-2026.pdf')
  assert.equal(slipFileName('***', new Date(2026, 0, 2)), 'WalletTrails_Slip_Record_02-Jan-2026.pdf')
})

test('money you owe: names, numbered rows, totals, footer', () => {
  const { data, html } = render(history())
  assert.equal(data.slipNumber, 'WT-P12-0003')
  assert.match(html, /Payment Slip/)
  assert.match(html, /Mustafa Moiz/)
  assert.match(html, /Loan \/ payable/)
  assert.match(html, /Bike loan/)
  assert.deepEqual(bodyRows(html), [1, 2, 3])
  assert.match(html, /05 Sep 2026/)
  assert.match(html, /Total paid/)
  assert.match(html, /Remaining to pay/)
  assert.match(html, /Rs 90,000/)
  assert.match(html, /3 of 12 installments/)
  assert.match(html, /Generated with WalletTrails/)
  assert.ok(html.includes(DEFAULT_STORE_URL), 'falls back to the Play Store link')
  assert.ok(html.includes(LOGO), 'logo embedded')
  assert.doesNotMatch(html, /Paid in full/)
  assert.doesNotMatch(html, /closed without full payment/)
})

test('money owed to you uses received wording', () => {
  const { html } = render(history({ kind: 'receivable', direction: 'owed', name: 'Ali — laptop sale' }))
  assert.match(html, /Payment Receipt/)
  assert.match(html, /Owed by \(installment plan\)/)
  assert.match(html, /Payment received/)
  assert.match(html, /Total received/)
  assert.match(html, /Remaining to receive/)
  assert.doesNotMatch(html, /Remaining to pay/)
})

test('one-time payment shows the advance tag and no installments line', () => {
  const { html } = render(history({
    kind: 'project',
    direction: 'owed',
    name: 'Website for Ahmed',
    payments: [
      { index: 1, transaction_id: null, date: '2026-08-01', amount: '30000.00', is_advance: true },
      { index: 2, transaction_id: 201, date: '2026-09-15', amount: '20000.00', is_advance: false },
    ],
    total_installments: null,
    installments_done: null,
  }))
  assert.match(html, /Owed by \(one-time payment\)/)
  assert.match(html, /tag-advance">Advance/)
  assert.deepEqual(bodyRows(html), [1, 2])
  assert.doesNotMatch(html, /installments<\/div>/)
})

test('paid in full shows the stamp; old Mark Complete shows the closed note', () => {
  const owe = render(history({ remaining_amount: '0.00', total_paid: '120000.00', paid_in_full: true, status: 'completed' })).html
  assert.match(owe, /class="stamp">Paid in full/)
  const owed = render(history({ direction: 'owed', kind: 'receivable', remaining_amount: '0.00', paid_in_full: true })).html
  assert.match(owed, /class="stamp">Received in full/)
  const closed = render(history({ status: 'completed', closed_without_full_payment: true })).html
  assert.match(closed, /closed without full payment/)
  assert.doesNotMatch(closed, /class="stamp"/)
})

test('highlights only the payment just recorded', () => {
  const { html } = render(history(), { highlightTransactionId: 103 })
  assert.equal((html.match(/<tr class="hl">/g) || []).length, 1)
  assert.equal((html.match(/tag-current">This payment/g) || []).length, 1)
  const none = render(history()).html
  assert.doesNotMatch(none, /tag-current">/)
  assert.doesNotMatch(none, /<tr class="hl">/)
})

test('no payments yet', () => {
  const { html } = render(history({ payments: [], payment_count: 0, total_paid: '0.00', remaining_amount: '120000.00' }))
  assert.match(html, /No payments recorded yet\./)
  assert.deepEqual(bodyRows(html), [])
})

test('names are escaped so they cannot break the PDF', () => {
  const { html } = render(history({ name: '<Ali & Sons> "Shop"' }), { preparedBy: "<script>alert('x')</script>" })
  assert.ok(html.includes('&lt;Ali &amp; Sons&gt; &quot;Shop&quot;'))
  assert.ok(html.includes('&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;'))
  assert.ok(!html.includes('<script>'))
})

test('custom store link and empty name fallback', () => {
  const { html } = render(history(), { storeUrl: 'https://example.com/get', preparedBy: '   ' })
  assert.ok(html.includes('https://example.com/get'))
  assert.ok(!html.includes(DEFAULT_STORE_URL))
  assert.match(html, /WalletTrails user/)
})

test('40 payments render in order', () => {
  const payments = Array.from({ length: 40 }, (_, i) => ({
    index: i + 1,
    transaction_id: 1000 + i,
    date: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
    amount: '1000.00',
    is_advance: false,
  }))
  const { html } = render(history({ payments, payment_count: 40, total_paid: '40000.00', remaining_amount: '80000.00' }))
  assert.deepEqual(bodyRows(html), Array.from({ length: 40 }, (_, i) => i + 1))
})

test('share message uses paid/received wording and store link', () => {
  const owe = buildSlipShareMessage(render(history()).data)
  assert.match(owe, /^Payment slip for Bike loan — Rs 30,000 paid, Rs 90,000 remaining\./)
  assert.ok(owe.includes(`Generated with WalletTrails: ${DEFAULT_STORE_URL}`))

  const owed = buildSlipShareMessage(render(history({ kind: 'receivable', direction: 'owed', name: 'Ali' }), { storeUrl: 'https://example.com/app' }).data)
  assert.match(owed, /^Payment receipt for Ali — Rs 30,000 received, Rs 90,000 remaining\./)
  assert.ok(owed.includes('Generated with WalletTrails: https://example.com/app'))
})

test('template registry includes Classic, Minimal, and Receipt', () => {
  assert.deepEqual(SLIP_TEMPLATES.map((t) => t.id), ['classic', 'minimal', 'receipt'])
  assert.equal(getSlipTemplate('minimal').id, 'minimal')
  assert.equal(getSlipTemplate('receipt').id, 'receipt')
  assert.equal(getSlipTemplate('missing').id, 'classic')
})

test('minimal and receipt templates escape names and show totals', () => {
  const data = render(history({ name: '<Ali & Sons>' })).data
  for (const tmpl of [minimalTemplate, receiptTemplate]) {
    const html = tmpl.render(data)
    assert.ok(html.includes('&lt;Ali &amp; Sons&gt;'))
    assert.ok(!html.includes('<Ali & Sons>'))
    assert.match(html, /Rs 30,000/)
    assert.match(html, /Rs 90,000/)
    assert.match(html, /Generated with WalletTrails/)
    assert.match(html, /Payment Slip/)
  }
})

test('receipt template uses ticket layout; minimal has no teal header bar', () => {
  const data = render(history()).data
  const receipt = receiptTemplate.render(data)
  assert.match(receipt, /class="ticket"/)
  assert.match(receipt, /Courier New/)
  const minimal = minimalTemplate.render(data)
  assert.doesNotMatch(minimal, /background: #04333b/)
  assert.match(minimal, /Georgia/)
})
