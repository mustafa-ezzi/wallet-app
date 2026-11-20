import type { SlipData, SlipTemplate } from '../types'
import { esc, slipDate, slipDateTime, slipLabels, slipMoney } from './shared'

function paymentRows(data: SlipData, emptyText: string, paymentColumn: string): string {
  if (data.payments.length === 0) {
    return `<tr><td colspan="3" class="empty">${esc(emptyText)}</td></tr>`
  }
  return data.payments
    .map((p) => {
      const highlighted = !p.isAdvance && p.transactionId != null && p.transactionId === data.highlightTransactionId
      const tags = [
        p.isAdvance ? '<span class="tag">Advance</span>' : '',
        highlighted ? '<span class="tag current">This payment</span>' : '',
      ].join('')
      return `<tr class="${highlighted ? 'hl' : ''}">
        <td class="sno">${p.index}</td>
        <td>${esc(slipDate(p.date))}${tags}</td>
        <td class="num">${esc(slipMoney(p.amount, data.currencySymbol))}</td>
      </tr>`
    })
    .join('')
}

function render(data: SlipData): string {
  const labels = slipLabels(data.direction, data.kind)
  const money = (n: number) => esc(slipMoney(n, data.currencySymbol))
  const installments = data.installments
    ? `<div class="meta-line">${data.installments.done} of ${data.installments.total} installments</div>`
    : ''
  const stamp = data.paidInFull
    ? `<div class="stamp">${data.direction === 'owe' ? 'Paid in full' : 'Received in full'}</div>`
    : ''
  const closedNote = data.closedWithoutFullPayment
    ? `<p class="closed">This record was closed without full payment. ${esc(labels.remainingLabel)}: ${money(data.remaining)}.</p>`
    : ''
  const storeLink = data.storeUrl
    ? `<div class="get-app">Get the app: <a href="${esc(data.storeUrl)}">${esc(data.storeUrl)}</a></div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(labels.title)} ${esc(data.slipNumber)}</title>
<style>
  @page { size: A4; margin: 36pt 40pt; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; font-size: 11.5px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { width: 36px; height: 36px; }
  .brand-name { font-size: 18px; font-weight: 700; letter-spacing: -0.2px; }
  .brand-tag { font-size: 9.5px; color: #666; margin-top: 2px; font-family: Helvetica, Arial, sans-serif; }
  .doc-title { font-size: 13px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; text-align: right; }
  .doc-meta { font-size: 9.5px; color: #666; margin-top: 4px; text-align: right; line-height: 1.5; font-family: Helvetica, Arial, sans-serif; }
  .rule { border: 0; border-top: 1.5px solid #1a1a1a; margin: 10px 0 18px; }
  .parties { position: relative; display: flex; gap: 28px; margin-bottom: 16px; }
  .party { flex: 1; }
  .label { font-size: 8.5px; font-weight: 700; color: #666; letter-spacing: 0.8px; text-transform: uppercase; font-family: Helvetica, Arial, sans-serif; }
  .value { font-size: 15px; font-weight: 700; margin-top: 4px; word-break: break-word; }
  .meta-line { font-size: 10px; color: #666; margin-top: 3px; font-family: Helvetica, Arial, sans-serif; }
  .stamp { position: absolute; right: 0; top: 0; transform: rotate(-8deg); border: 2px solid #1a1a1a; color: #1a1a1a; font-weight: 800; font-size: 12px; letter-spacing: 1.4px; text-transform: uppercase; padding: 4px 10px; font-family: Helvetica, Arial, sans-serif; }
  .summary { display: flex; gap: 0; margin-bottom: 16px; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; }
  .sum { flex: 1; padding: 10px 0; }
  .sum + .sum { padding-left: 16px; border-left: 1px solid #ddd; margin-left: 16px; }
  .sum .value { font-size: 15px; font-family: Helvetica, Arial, sans-serif; }
  .sum.remaining .value { font-size: 16px; }
  .closed { margin: 0 0 14px; padding: 8px 0; color: #8a5300; font-size: 10px; font-family: Helvetica, Arial, sans-serif; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { font-family: Helvetica, Arial, sans-serif; font-size: 8.5px; letter-spacing: 0.8px; text-transform: uppercase; text-align: left; padding: 8px 0; border-bottom: 1.5px solid #1a1a1a; }
  th.num, td.num { text-align: right; white-space: nowrap; font-family: Helvetica, Arial, sans-serif; }
  td { padding: 8px 0; border-bottom: 1px solid #e8e8e8; font-size: 11.5px; }
  tr { page-break-inside: avoid; }
  tbody tr.hl td { font-weight: 700; background: #f4f4f4; }
  td.sno { width: 48px; color: #666; font-family: Helvetica, Arial, sans-serif; }
  .tag { display: inline-block; margin-left: 8px; font-size: 8.5px; font-weight: 700; font-family: Helvetica, Arial, sans-serif; color: #666; }
  .tag.current { color: #1a1a1a; }
  .empty { text-align: center; color: #666; padding: 22px 0; font-family: Helvetica, Arial, sans-serif; }
  tfoot td { font-weight: 700; border-bottom: none; padding-top: 10px; font-family: Helvetica, Arial, sans-serif; }
  tfoot tr.remaining-row td { border-top: 1.5px solid #1a1a1a; font-size: 13px; padding-top: 12px; }
  .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; page-break-inside: avoid; }
  .footer-brand { display: flex; align-items: center; gap: 8px; }
  .footer-brand img { width: 24px; height: 24px; }
  .made-with { font-size: 11px; font-weight: 700; }
  .get-app { font-size: 9px; color: #666; margin-top: 2px; font-family: Helvetica, Arial, sans-serif; }
  .get-app a { color: #1a1a1a; text-decoration: underline; }
  .footer-meta { text-align: right; font-size: 8.5px; color: #888; line-height: 1.5; max-width: 46%; font-family: Helvetica, Arial, sans-serif; }
</style>
</head>
<body>
  <div class="top">
    <div class="brand">
      <img src="${data.logoDataUri}" alt="WalletTrails" />
      <div>
        <div class="brand-name">WalletTrails</div>
        <div class="brand-tag">Follow every rupee</div>
      </div>
    </div>
    <div>
      <div class="doc-title">${esc(labels.title)}</div>
      <div class="doc-meta">Slip # ${esc(data.slipNumber)}<br />${esc(slipDateTime(data.generatedAt))}</div>
    </div>
  </div>
  <hr class="rule" />

  <div class="parties">
    <div class="party">
      <div class="label">Prepared by</div>
      <div class="value">${esc(data.preparedBy)}</div>
    </div>
    <div class="party">
      <div class="label">${esc(labels.counterpartyLabel)}</div>
      <div class="value">${esc(data.counterparty)}</div>
      ${installments}
    </div>
    ${stamp}
  </div>

  <div class="summary">
    <div class="sum"><div class="label">Total amount</div><div class="value">${money(data.totalAmount)}</div></div>
    <div class="sum"><div class="label">${esc(labels.totalPaidLabel)}</div><div class="value">${money(data.totalPaid)}</div></div>
    <div class="sum remaining"><div class="label">${esc(labels.remainingLabel)}</div><div class="value">${money(data.remaining)}</div></div>
  </div>

  ${closedNote}

  <table>
    <thead>
      <tr><th>S.No</th><th>Payment date</th><th class="num">${esc(labels.paymentColumn)}</th></tr>
    </thead>
    <tbody>${paymentRows(data, labels.emptyText, labels.paymentColumn)}</tbody>
    <tfoot>
      <tr><td></td><td>${esc(labels.totalPaidLabel)}</td><td class="num">${money(data.totalPaid)}</td></tr>
      <tr class="remaining-row"><td></td><td>${esc(labels.remainingLabel)}</td><td class="num">${money(data.remaining)}</td></tr>
    </tfoot>
  </table>

  <div class="footer">
    <div class="footer-brand">
      <img src="${data.logoDataUri}" alt="" />
      <div>
        <div class="made-with">Generated with WalletTrails</div>
        ${storeLink}
      </div>
    </div>
    <div class="footer-meta">
      Slip # ${esc(data.slipNumber)} · ${esc(slipDateTime(data.generatedAt))}<br />
      This slip is a personal record kept in WalletTrails. It is not a bank receipt.
    </div>
  </div>
</body>
</html>`
}

export const minimalTemplate: SlipTemplate = {
  id: 'minimal',
  label: 'Minimal',
  render,
}
