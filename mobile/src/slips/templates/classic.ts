import type { SlipData, SlipTemplate } from '../types'
import { esc, slipDate, slipDateTime, slipLabels, slipMoney } from './shared'

function paymentRows(data: SlipData, emptyText: string): string {
  if (data.payments.length === 0) {
    return `<tr><td colspan="3" class="empty">${esc(emptyText)}</td></tr>`
  }
  return data.payments
    .map((p) => {
      const highlighted = !p.isAdvance && p.transactionId != null && p.transactionId === data.highlightTransactionId
      const tags = [
        p.isAdvance ? '<span class="tag tag-advance">Advance</span>' : '',
        highlighted ? '<span class="tag tag-current">This payment</span>' : '',
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
  @page { size: A4; margin: 28pt 30pt; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #14201c; font-size: 11px; }
  .header { background: #04333b; color: #fff; border-radius: 12px; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 46px; height: 46px; border-radius: 10px; }
  .brand-name { font-size: 20px; font-weight: 700; letter-spacing: 0.2px; }
  .brand-tag { font-size: 10px; color: #9fe0c4; margin-top: 2px; }
  .doc { text-align: right; }
  .doc-title { font-size: 15px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; }
  .doc-meta { font-size: 10px; color: #cde9df; margin-top: 4px; line-height: 1.5; }
  .accent { height: 4px; background: linear-gradient(90deg, #0f9d6e, #7ed9b4); border-radius: 0 0 4px 4px; margin: 0 14px 18px; }
  .parties { position: relative; display: flex; gap: 12px; margin-bottom: 14px; }
  .party { flex: 1; border: 1px solid #dfe8e4; border-radius: 10px; padding: 12px 14px; background: #f7faf9; }
  .label { font-size: 8.5px; font-weight: 700; color: #6b7a74; letter-spacing: 0.9px; text-transform: uppercase; }
  .value { font-size: 14px; font-weight: 700; margin-top: 5px; word-break: break-word; }
  .meta-line { font-size: 10px; color: #6b7a74; margin-top: 4px; }
  .stamp { position: absolute; right: 18px; top: -6px; transform: rotate(-8deg); border: 2.5px solid #0f9d6e; color: #0f9d6e; font-weight: 800; font-size: 13px; letter-spacing: 1.8px; text-transform: uppercase; padding: 5px 12px; border-radius: 8px; background: rgba(255,255,255,0.92); }
  .summary { display: flex; gap: 12px; margin-bottom: 18px; }
  .sum { flex: 1; border-radius: 10px; padding: 10px 14px; border: 1px solid #dfe8e4; }
  .sum .value { font-size: 15px; }
  .sum.remaining { background: #04333b; border-color: #04333b; color: #fff; }
  .sum.remaining .label { color: #9fe0c4; }
  .closed { margin: -6px 0 14px; padding: 8px 12px; border-radius: 8px; background: #fff4e5; color: #8a5300; font-size: 10px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #dfe8e4; border-radius: 10px; overflow: hidden; }
  thead { display: table-header-group; }
  th { background: #04333b; color: #fff; font-size: 9px; letter-spacing: 0.9px; text-transform: uppercase; text-align: left; padding: 9px 12px; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  td { padding: 9px 12px; border-top: 1px solid #edf2f0; font-size: 11px; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f7faf9; }
  tbody tr.hl td { background: #e3f6ee; font-weight: 700; }
  td.sno { width: 52px; color: #6b7a74; }
  .tag { display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 999px; font-size: 8.5px; font-weight: 700; vertical-align: 1px; }
  .tag-advance { background: #e8eefc; color: #2f4fa8; }
  .tag-current { background: #0f9d6e; color: #fff; }
  .empty { text-align: center; color: #6b7a74; padding: 22px 12px; }
  tfoot td { font-weight: 700; background: #f0f5f3; }
  tfoot tr.remaining-row td { background: #04333b; color: #fff; font-size: 13px; }
  .footer { margin-top: 26px; padding-top: 14px; border-top: 1px solid #dfe8e4; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; page-break-inside: avoid; }
  .footer-brand { display: flex; align-items: center; gap: 10px; }
  .footer-brand img { width: 30px; height: 30px; border-radius: 7px; }
  .made-with { font-size: 11px; font-weight: 700; color: #04333b; }
  .get-app { font-size: 9.5px; color: #6b7a74; margin-top: 2px; }
  .get-app a { color: #0f9d6e; text-decoration: none; }
  .footer-meta { text-align: right; font-size: 8.5px; color: #8a9893; line-height: 1.5; max-width: 46%; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img src="${data.logoDataUri}" alt="WalletTrails" />
      <div>
        <div class="brand-name">WalletTrails</div>
        <div class="brand-tag">Follow every rupee</div>
      </div>
    </div>
    <div class="doc">
      <div class="doc-title">${esc(labels.title)}</div>
      <div class="doc-meta">Slip # ${esc(data.slipNumber)}<br />${esc(slipDateTime(data.generatedAt))}</div>
    </div>
  </div>
  <div class="accent"></div>

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
    <tbody>${paymentRows(data, labels.emptyText)}</tbody>
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

export const classicTemplate: SlipTemplate = {
  id: 'classic',
  label: 'Classic',
  render,
}
