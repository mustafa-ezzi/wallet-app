import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface LedgerRow {
  date: string
  description: string
  account: string
  type: string
  category: string
  debit: number
  credit: number
  balance: number
}

export interface ReportMeta {
  username: string
  monthLabel: string
  income: number
  expense: number
  net: number
  expectedIncome: number
  expectedExpense: number
  netForecast: number
}

// Brand palette
const GREEN: [number, number, number] = [15, 61, 36]
const GREEN_LIGHT: [number, number, number] = [52, 168, 98]
const RED: [number, number, number] = [201, 48, 44]
const MUTED: [number, number, number] = [110, 120, 115]
const INK: [number, number, number] = [24, 30, 27]

function nf(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
function money(n: number): string {
  return `PKR ${nf(Math.abs(n))}`
}
function balanceStr(n: number): string {
  return n < 0 ? `-PKR ${nf(Math.abs(n))}` : `PKR ${nf(n)}`
}

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeName(s: string) {
  return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'CashTrail'
}

/** ── CSV export ───────────────────────────────────────────────── */
export function downloadLedgerCSV(rows: LedgerRow[], meta: ReportMeta) {
  const lines: string[] = []
  lines.push(`CashTrail — Financial Report`)
  lines.push(`Prepared for,${csvCell(meta.username)}`)
  lines.push(`Period,${csvCell(meta.monthLabel)}`)
  lines.push(`Generated,${csvCell(new Date().toLocaleString('en-PK'))}`)
  lines.push('')
  lines.push(`Income,${meta.income}`)
  lines.push(`Expense,${meta.expense}`)
  lines.push(`Net,${meta.net}`)
  lines.push('')
  lines.push(['Date', 'Description', 'Account', 'Type', 'Category', 'Debit', 'Credit', 'Balance'].join(','))
  rows.forEach(r => {
    lines.push([
      csvCell(r.date),
      csvCell(r.description),
      csvCell(r.account),
      csvCell(r.type),
      csvCell(r.category),
      r.debit || '',
      r.credit || '',
      r.balance,
    ].join(','))
  })
  lines.push('')
  lines.push(`Totals,,,,,${meta.expense},${meta.income},`)

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${safeName('CashTrail_' + meta.username + '_' + meta.monthLabel)}.csv`)
}

async function loadDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>(resolve => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** ── PDF export (branded) ─────────────────────────────────────── */
export async function downloadReportPDF(rows: LedgerRow[], meta: ReportMeta) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40

  const logo = await loadDataUrl('/logo.png')

  // ── Header band ──
  const bandH = 92
  doc.setFillColor(...GREEN)
  doc.rect(0, 0, pageW, bandH, 'F')
  // subtle accent stripe
  doc.setFillColor(...GREEN_LIGHT)
  doc.rect(0, bandH - 5, pageW, 5, 'F')

  let textX = margin
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', margin, 22, 48, 48, undefined, 'FAST')
      textX = margin + 62
    } catch { /* ignore logo failure */ }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('CashTrail', textX, 44)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(200, 230, 210)
  doc.text('Financial Report', textX, 62)

  // right side — period
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(255, 255, 255)
  doc.text(meta.monthLabel, pageW - margin, 44, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200, 230, 210)
  doc.text(`Generated ${new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}`, pageW - margin, 60, { align: 'right' })

  // ── Prepared for ──
  let y = bandH + 26
  doc.setTextColor(...MUTED)
  doc.setFontSize(9)
  doc.text('PREPARED FOR', margin, y)
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(meta.username, margin, y + 16)

  // ── Summary cards ──
  y += 34
  const gap = 12
  const cardW = (pageW - margin * 2 - gap * 2) / 3
  const cardH = 58
  const cards: { label: string; value: string; color: [number, number, number] }[] = [
    { label: 'INCOME', value: money(meta.income), color: GREEN_LIGHT },
    { label: 'EXPENSE', value: money(meta.expense), color: RED },
    { label: 'NET', value: balanceStr(meta.net), color: meta.net >= 0 ? GREEN : RED },
  ]
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + gap)
    doc.setFillColor(246, 249, 247)
    doc.setDrawColor(225, 233, 228)
    doc.roundedRect(x, y, cardW, cardH, 6, 6, 'FD')
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(c.label, x + 12, y + 20)
    doc.setTextColor(...c.color)
    doc.setFontSize(15)
    doc.text(c.value, x + 12, y + 42)
  })

  // ── Forecast line ──
  y += cardH + 22
  doc.setDrawColor(225, 233, 228)
  doc.line(margin, y, pageW - margin, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(
    `Forecast — Expected income ${money(meta.expectedIncome)}   •   Expected expense ${money(meta.expectedExpense)}   •   Forecast net ${balanceStr(meta.netForecast)}`,
    margin, y,
  )

  // ── Ledger table ──
  y += 14
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Description', 'Account', 'Type', 'Category', 'Debit', 'Credit', 'Balance']],
    body: rows.map(r => [
      r.date,
      r.description,
      r.account,
      r.type,
      r.category || '—',
      r.debit ? money(r.debit) : '—',
      r.credit ? money(r.credit) : '—',
      balanceStr(r.balance),
    ]),
    theme: 'striped',
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 5, textColor: INK, lineColor: [230, 236, 232] },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [246, 249, 247] },
    columnStyles: {
      0: { cellWidth: 48 },
      3: { cellWidth: 40 },
      5: { halign: 'right', textColor: RED },
      6: { halign: 'right', textColor: GREEN_LIGHT },
      7: { halign: 'right', fontStyle: 'bold' },
    },
    foot: [[
      { content: 'Totals', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: money(meta.expense), styles: { halign: 'right', textColor: RED, fontStyle: 'bold' } },
      { content: money(meta.income), styles: { halign: 'right', textColor: GREEN_LIGHT, fontStyle: 'bold' } },
      { content: '', styles: {} },
    ]],
    footStyles: { fillColor: [237, 244, 239], textColor: INK },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight()
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      doc.text('Generated by CashTrail — follow every rupee', margin, h - 18)
      const page = doc.getNumberOfPages()
      doc.text(`Page ${page}`, pageW - margin, h - 18, { align: 'right' })
    },
  })

  if (rows.length === 0) {
    const afterY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
    doc.setTextColor(...MUTED)
    doc.setFontSize(10)
    doc.text('No transactions for this period.', margin, afterY + 24)
  }

  doc.save(`${safeName('CashTrail_' + meta.username + '_' + meta.monthLabel)}.pdf`)
}
