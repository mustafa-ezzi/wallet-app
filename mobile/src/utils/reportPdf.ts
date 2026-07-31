import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'

export type ReportLedgerRow = {
  date: string
  description: string
  account: string
  type: string
  category: string
  debit: number
  credit: number
  balance: number
}

export type ReportPdfMeta = {
  username: string
  monthLabel: string
  income: number
  expense: number
  net: number
  expectedIncome?: number
  expectedExpense?: number
  netForecast?: number
}

function nf(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

function money(n: number): string {
  return `PKR ${nf(Math.abs(n))}`
}

function balanceStr(n: number): string {
  return n < 0 ? `-PKR ${nf(Math.abs(n))}` : `PKR ${nf(n)}`
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeName(s: string) {
  return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'CashTrail'
}

function buildHtml(rows: ReportLedgerRow[], meta: ReportPdfMeta): string {
  const generated = new Date().toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const netColor = meta.net >= 0 ? '#0f9d6e' : '#c9302c'
  const forecastLine =
    meta.expectedIncome !== undefined
      ? `<p class="forecast">Forecast — Expected income ${esc(money(meta.expectedIncome))}
         &nbsp;•&nbsp; Expected expense ${esc(money(meta.expectedExpense ?? 0))}
         &nbsp;•&nbsp; Forecast net ${esc(balanceStr(meta.netForecast ?? 0))}</p>`
      : ''

  const bodyRows =
    rows.length === 0
      ? `<tr><td colspan="8" class="empty">No transactions for this period.</td></tr>`
      : rows
          .map(
            (r) => `<tr>
          <td>${esc(r.date)}</td>
          <td>${esc(r.description)}</td>
          <td>${esc(r.account)}</td>
          <td>${esc(r.type)}</td>
          <td>${esc(r.category || '—')}</td>
          <td class="num debit">${r.debit ? esc(money(r.debit)) : '—'}</td>
          <td class="num credit">${r.credit ? esc(money(r.credit)) : '—'}</td>
          <td class="num bal">${esc(balanceStr(r.balance))}</td>
        </tr>`,
          )
          .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 36pt; }
    body { font-family: Helvetica, Arial, sans-serif; color: #181e1b; font-size: 10px; margin: 0; }
    .band { background: #0f3d24; color: #fff; padding: 22px 28px 18px; border-radius: 0 0 8px 8px; }
    .band-accent { height: 5px; background: #34a862; margin-top: 14px; margin-left: -28px; margin-right: -28px; margin-bottom: -18px; }
    .brand { font-size: 22px; font-weight: 700; margin: 0; }
    .sub { color: #c8e6d2; font-size: 11px; margin: 4px 0 0; }
    .row-between { display: flex; justify-content: space-between; align-items: flex-start; }
    .period { text-align: right; }
    .period strong { display: block; font-size: 13px; }
    .muted { color: #6e7873; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; }
    .prepared { margin: 22px 8px 8px; }
    .prepared .name { font-size: 14px; font-weight: 700; margin-top: 4px; }
    .cards { display: flex; gap: 10px; margin: 14px 4px 18px; }
    .card { flex: 1; background: #f6f9f7; border: 1px solid #e1e9e4; border-radius: 8px; padding: 12px; }
    .card .lab { color: #6e7873; font-size: 8px; font-weight: 700; letter-spacing: 0.05em; }
    .card .val { font-size: 14px; font-weight: 700; margin-top: 8px; }
    .forecast { color: #6e7873; font-size: 9px; margin: 0 8px 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #0f3d24; color: #fff; text-align: left; padding: 7px 6px; font-size: 8px; }
    td { padding: 6px; border-bottom: 1px solid #e6ece8; vertical-align: top; }
    tr:nth-child(even) td { background: #f6f9f7; }
    .num { text-align: right; white-space: nowrap; }
    .debit { color: #c9302c; }
    .credit { color: #34a862; }
    .bal { font-weight: 700; }
    .empty { text-align: center; color: #6e7873; padding: 18px !important; }
    tfoot td { background: #edf4ef; font-weight: 700; padding: 8px 6px; }
    .foot { margin-top: 18px; color: #6e7873; font-size: 8px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="band">
    <div class="row-between">
      <div>
        <p class="brand">CashTrail</p>
        <p class="sub">Financial Report</p>
      </div>
      <div class="period">
        <strong>${esc(meta.monthLabel)}</strong>
        <p class="sub">Generated ${esc(generated)}</p>
      </div>
    </div>
    <div class="band-accent"></div>
  </div>

  <div class="prepared">
    <div class="muted">Prepared for</div>
    <div class="name">${esc(meta.username)}</div>
  </div>

  <div class="cards">
    <div class="card"><div class="lab">Income</div><div class="val" style="color:#34a862">${esc(money(meta.income))}</div></div>
    <div class="card"><div class="lab">Expense</div><div class="val" style="color:#c9302c">${esc(money(meta.expense))}</div></div>
    <div class="card"><div class="lab">Net</div><div class="val" style="color:${netColor}">${esc(balanceStr(meta.net))}</div></div>
  </div>

  ${forecastLine}

  <table>
    <thead>
      <tr>
        <th>Date</th><th>Description</th><th>Account</th><th>Type</th>
        <th>Category</th><th>Debit</th><th>Credit</th><th>Balance</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align:right">Totals</td>
        <td class="num debit">${esc(money(meta.expense))}</td>
        <td class="num credit">${esc(money(meta.income))}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="foot">
    <span>Generated by CashTrail — follow every rupee</span>
    <span>${esc(meta.monthLabel)}</span>
  </div>
</body>
</html>`
}

/** Build branded PDF and open the native share sheet. */
export async function shareReportPdf(rows: ReportLedgerRow[], meta: ReportPdfMeta) {
  const html = buildHtml(rows, meta)
  const filename = `${safeName(`CashTrail_${meta.username}_${meta.monthLabel}`)}.pdf`
  const { uri } = await Print.printToFileAsync({ html, base64: false })

  if (Platform.OS === 'web') {
    // expo-print on web may download already; still try share if available
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: filename,
        UTI: 'com.adobe.pdf',
      })
    }
    return uri
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: filename,
      UTI: 'com.adobe.pdf',
    })
  } else {
    throw new Error('Sharing is not available on this device.')
  }
  return uri
}
