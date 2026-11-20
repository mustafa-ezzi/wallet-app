import type { SlipData, SlipTemplate } from '../types'
import { esc, slipDate, slipDateTime, slipLabels, slipMoney } from './shared'

function paymentRows(data: SlipData, emptyText: string): string {
  if (data.payments.length === 0) {
    return `<div class="empty">${esc(emptyText)}</div>`
  }
  return data.payments
    .map((p) => {
      const highlighted = !p.isAdvance && p.transactionId != null && p.transactionId === data.highlightTransactionId
      const tags = [
        p.isAdvance ? ' [Advance]' : '',
        highlighted ? ' ← This payment' : '',
      ].join('')
      return `<div class="line ${highlighted ? 'hl' : ''}">
        <span class="left">${p.index}. ${esc(slipDate(p.date))}${esc(tags)}</span>
        <span class="right">${esc(slipMoney(p.amount, data.currencySymbol))}</span>
      </div>`
    })
    .join('')
}

function render(data: SlipData): string {
  const labels = slipLabels(data.direction, data.kind)
  const money = (n: number) => esc(slipMoney(n, data.currencySymbol))
  const installments = data.installments
    ? `${data.installments.done} of ${data.installments.total} installments`
    : ''
  const stamp = data.paidInFull
    ? `<div class="stamp">*** ${data.direction === 'owe' ? 'PAID IN FULL' : 'RECEIVED IN FULL'} ***</div>`
    : ''
  const closedNote = data.closedWithoutFullPayment
    ? `<div class="closed">Closed without full payment · ${esc(labels.remainingLabel)}: ${money(data.remaining)}</div>`
    : ''
  const storeLink = data.storeUrl
    ? `<div class="get-app">Get the app:<br /><a href="${esc(data.storeUrl)}">${esc(data.storeUrl)}</a></div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(labels.title)} ${esc(data.slipNumber)}</title>
<style>
  @page { size: A4; margin: 24pt; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; display: flex; justify-content: center; background: #fff; }
  .ticket {
    width: 320px;
    max-width: 100%;
    font-family: 'Courier New', Courier, monospace;
    color: #111;
    font-size: 11px;
    padding: 18px 14px 22px;
    border: 1px dashed #bbb;
  }
  .center { text-align: center; }
  .logo { width: 40px; height: 40px; margin: 0 auto 8px; display: block; border-radius: 8px; }
  .brand-name { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
  .brand-tag { font-size: 9px; margin-top: 2px; }
  .doc-title { margin-top: 12px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .meta { font-size: 10px; margin-top: 4px; line-height: 1.45; }
  .dash { border: 0; border-top: 1px dashed #999; margin: 12px 0; }
  .row { display: flex; justify-content: space-between; gap: 10px; margin: 4px 0; }
  .muted { color: #555; }
  .stamp { text-align: center; font-weight: 800; margin: 10px 0; letter-spacing: 0.5px; }
  .closed { text-align: center; font-size: 10px; margin: 8px 0; }
  .section-title { text-align: center; font-weight: 700; margin: 4px 0 8px; letter-spacing: 0.6px; text-transform: uppercase; font-size: 10px; }
  .line { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; page-break-inside: avoid; }
  .line.hl { font-weight: 700; background: #f2f2f2; }
  .left { flex: 1; word-break: break-word; }
  .right { white-space: nowrap; font-weight: 700; }
  .empty { text-align: center; color: #666; padding: 12px 0; }
  .totals .row { font-weight: 700; }
  .totals .remaining { font-size: 12px; margin-top: 6px; }
  .get-app { font-size: 9px; margin-top: 6px; word-break: break-all; }
  .get-app a { color: #111; }
  .fine { font-size: 8.5px; color: #666; margin-top: 8px; line-height: 1.4; }
</style>
</head>
<body>
  <div class="ticket">
    <div class="center">
      <img class="logo" src="${data.logoDataUri}" alt="WalletTrails" />
      <div class="brand-name">WalletTrails</div>
      <div class="brand-tag">Follow every rupee</div>
      <div class="doc-title">${esc(labels.title)}</div>
      <div class="meta"># ${esc(data.slipNumber)}<br />${esc(slipDateTime(data.generatedAt))}</div>
    </div>
    <hr class="dash" />
    <div class="row"><span class="muted">Prepared by</span><span>${esc(data.preparedBy)}</span></div>
    <div class="row"><span class="muted">${esc(labels.counterpartyLabel)}</span><span>${esc(data.counterparty)}</span></div>
    ${installments ? `<div class="row"><span class="muted">Installments</span><span>${installments}</span></div>` : ''}
    ${stamp}
    ${closedNote}
    <hr class="dash" />
    <div class="row"><span class="muted">Total amount</span><span>${money(data.totalAmount)}</span></div>
    <div class="row"><span class="muted">${esc(labels.totalPaidLabel)}</span><span>${money(data.totalPaid)}</span></div>
    <div class="row remaining"><span class="muted">${esc(labels.remainingLabel)}</span><span><strong>${money(data.remaining)}</strong></span></div>
    <hr class="dash" />
    <div class="section-title">${esc(labels.paymentColumn)}s</div>
    ${paymentRows(data, labels.emptyText)}
    <hr class="dash" />
    <div class="totals">
      <div class="row"><span>${esc(labels.totalPaidLabel)}</span><span>${money(data.totalPaid)}</span></div>
      <div class="row remaining"><span>${esc(labels.remainingLabel)}</span><span>${money(data.remaining)}</span></div>
    </div>
    <hr class="dash" />
    <div class="center">
      <div><strong>Generated with WalletTrails</strong></div>
      ${storeLink}
      <div class="fine">Slip # ${esc(data.slipNumber)} · personal record, not a bank receipt.</div>
    </div>
  </div>
</body>
</html>`
}

export const receiptTemplate: SlipTemplate = {
  id: 'receipt',
  label: 'Receipt',
  render,
}
