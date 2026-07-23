import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  ListFilter,
  X,
} from 'lucide-react'
import { accountsApi, forecastApi, transactionsApi, asList } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtBalance, sumMoney, toMoney } from '../utils/format'
import { downloadLedgerCSV, downloadReportPDF, type LedgerRow, type ReportMeta } from '../utils/reportExport'

interface ForecastItem { label: string; amount: number; type: string }
interface Forecast {
  year: number; month: number
  forecast_income: ForecastItem[]
  forecast_outgoing: ForecastItem[]
  total_expected_income: number
  total_expected_outgoing: number
  net_forecast: number
  actual_income: number
  actual_expense: number
  actual_net: number
}

interface Account {
  id: number
  name: string
  type: string
  opening_balance: number
  current_balance: number
}

interface Tx {
  id: number
  type: string
  amount: number
  date: string
  account: number
  account_name: string
  category: string
  notes: string
  project_name: string | null
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May',
  'June', 'July', 'August', 'September', 'October', 'November', 'December',
]

const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

function isTransfer(tx: Tx) {
  return tx.category === 'Bank Transfer'
}

function dayLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return { day: String(d.getDate()).padStart(2, '0'), mon: SHORT_MONTH[d.getMonth()] }
}

function txTitle(tx: Tx) {
  return tx.project_name || tx.category || tx.notes || (tx.type === 'income' ? 'Income' : 'Expense')
}

export default function Reports() {
  const now = new Date()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [exportOpen, setExportOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [allTxs, setAllTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)

  // ledger UI state
  const [expanded, setExpanded] = useState<number | null>(null)
  const [walletFilter, setWalletFilter] = useState<number | 'all'>('all')

  // detailed outgoing breakdown modal
  const [detailOpen, setDetailOpen] = useState(false)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  const [fromDate, setFromDate] = useState(monthStart)
  const [toDate, setToDate] = useState(monthEnd)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      forecastApi.get(year, month),
      accountsApi.list(),
      transactionsApi.list(),
    ]).then(([fRes, aRes, tRes]) => {
      const d = fRes.data ?? {}
      setForecast({
        ...d,
        forecast_income: Array.isArray(d.forecast_income) ? d.forecast_income : [],
        forecast_outgoing: Array.isArray(d.forecast_outgoing) ? d.forecast_outgoing : [],
      })
      setAccounts(asList(aRes.data))
      setAllTxs(asList(tRes.data))
    }).catch(() => {
      setForecast(null)
      setAccounts([])
      setAllTxs([])
    }).finally(() => setLoading(false))
  }, [year, month])

  // keep detail range aligned with the selected month by default
  useEffect(() => {
    setFromDate(monthStart)
    setToDate(monthEnd)
  }, [monthStart, monthEnd])

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  const maxBar = Math.max(forecast?.total_expected_income ?? 0, forecast?.total_expected_outgoing ?? 0, 1)
  const net = forecast?.net_forecast ?? 0
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  // Running balance per wallet across ALL transactions (chronological)
  const balanceAfter = useMemo(() => {
    const map = new Map<number, number>()
    const running: Record<number, number> = {}
    accounts.forEach(a => { running[a.id] = toMoney(a.opening_balance) })
    const sorted = allTxs.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    sorted.forEach(tx => {
      const base = running[tx.account] ?? 0
      const next = tx.type === 'income' ? base + toMoney(tx.amount) : base - toMoney(tx.amount)
      running[tx.account] = next
      map.set(tx.id, next)
    })
    return map
  }, [allTxs, accounts])

  const monthTxs = useMemo(
    () => allTxs.filter(t => t.date >= monthStart && t.date <= monthEnd),
    [allTxs, monthStart, monthEnd],
  )

  const ledgerTxs = useMemo(() => {
    const rows = walletFilter === 'all' ? monthTxs : monthTxs.filter(t => t.account === walletFilter)
    return rows.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  }, [monthTxs, walletFilter])

  const monthIncomeTotal = sumMoney(monthTxs.filter(t => t.type === 'income' && !isTransfer(t)), t => t.amount)
  const monthExpenseTotal = sumMoney(monthTxs.filter(t => t.type === 'expense' && !isTransfer(t)), t => t.amount)

  // Detailed outgoing breakdown (date range)
  const detailRows = useMemo(() => {
    return allTxs
      .filter(t => t.type === 'expense' && !isTransfer(t) && t.date >= fromDate && t.date <= toDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  }, [allTxs, fromDate, toDate])

  const detailByCategory = useMemo(() => {
    const m = new Map<string, number>()
    detailRows.forEach(t => {
      const key = t.category || 'Uncategorized'
      m.set(key, (m.get(key) ?? 0) + toMoney(t.amount))
    })
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [detailRows])

  const detailTotal = sumMoney(detailRows, t => t.amount)

  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? '—'
  const accountType = (id: number) => (accounts.find(a => a.id === id)?.type === 'cash' ? 'Cash' : 'Bank')

  // ── Export ──
  const userName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || user?.email || 'CashTrail user'
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  const buildExport = (): { rows: LedgerRow[]; meta: ReportMeta } => {
    const rows: LedgerRow[] = ledgerTxs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      .map(tx => ({
        date: tx.date,
        description: txTitle(tx),
        account: accountName(tx.account),
        type: accountType(tx.account),
        category: isTransfer(tx) ? 'Bank Transfer' : (tx.category || ''),
        debit: tx.type === 'expense' ? toMoney(tx.amount) : 0,
        credit: tx.type === 'income' ? toMoney(tx.amount) : 0,
        balance: balanceAfter.get(tx.id) ?? 0,
      }))
    const meta: ReportMeta = {
      username: userName,
      monthLabel: walletFilter === 'all' ? monthLabel : `${monthLabel} — ${accountName(walletFilter)}`,
      income: monthIncomeTotal,
      expense: monthExpenseTotal,
      net: monthIncomeTotal - monthExpenseTotal,
      expectedIncome: forecast?.total_expected_income ?? 0,
      expectedExpense: forecast?.total_expected_outgoing ?? 0,
      netForecast: forecast?.net_forecast ?? 0,
    }
    return { rows, meta }
  }

  const handleCSV = () => {
    const { rows, meta } = buildExport()
    downloadLedgerCSV(rows, meta)
    setExportOpen(false)
  }

  const handlePDF = async () => {
    const { rows, meta } = buildExport()
    setPdfBusy(true)
    try {
      await downloadReportPDF(rows, meta)
    } finally {
      setPdfBusy(false)
      setExportOpen(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Reports</h1>
          <p className="page-subtitle">Forecast, breakdowns, and your wallet ledger.</p>
        </div>
        <div style={{ position: 'relative' }}>
          <button
            className="btn-primary"
            style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setExportOpen(o => !o)}
          >
            {pdfBusy ? <span className="spinner" /> : <Download size={15} strokeWidth={2} />}
            Export
            <ChevronDown size={14} strokeWidth={2} style={{ transform: exportOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {exportOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setExportOpen(false)} />
              <div className="glass" style={{ position: 'absolute', right: 0, top: 'calc(100% + 0.4rem)', zIndex: 50, minWidth: 190, padding: '0.35rem', borderRadius: 'var(--radius-md)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)' }}>
                <button className="export-menu-item" onClick={handleCSV}>
                  <FileSpreadsheet size={16} strokeWidth={1.9} /> Download CSV
                </button>
                <button className="export-menu-item" onClick={handlePDF} disabled={pdfBusy}>
                  <FileText size={16} strokeWidth={1.9} /> {pdfBusy ? 'Preparing…' : 'Download PDF'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Month selector */}
      <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
        <button className="btn-icon" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{MONTH_NAMES[month - 1]} {year}</span>
          {isCurrentMonth && <div style={{ fontSize: '0.7rem', color: 'var(--primary-light)', marginTop: '0.15rem' }}>Current month</div>}
        </div>
        <button className="btn-icon" onClick={nextMonth} aria-label="Next month">
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : (
        <>
          {/* ── Forecasted savings hero (TOP) ── */}
          {forecast && (
            <div className="hero-balance" style={{ marginBottom: '1rem' }}>
              <p className="text-label" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {net >= 0 ? 'Forecasted Savings' : 'Forecasted Shortfall'}
              </p>
              <div className="balance-amount" style={{ color: '#fff' }}>
                {net >= 0 ? '+' : ''}{fmtBalance(net)}
              </div>
              <div className="balance-chips">
                <div className="balance-chip">
                  <div className="chip-label">Income</div>
                  <div className="chip-value" style={{ color: '#34d399' }}>{fmt(forecast.total_expected_income)}</div>
                </div>
                <div className="balance-chip">
                  <div className="chip-label">Expense</div>
                  <div className="chip-value" style={{ color: '#fb7185' }}>{fmt(forecast.total_expected_outgoing)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Month actuals strip */}
          <div className="grid-3" style={{ marginBottom: '1rem' }}>
            <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
              <div className="stat-label">Income</div>
              <div className="stat-value amt-positive">{fmt(monthIncomeTotal)}</div>
            </div>
            <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
              <div className="stat-label">Expense</div>
              <div className="stat-value amt-negative">{fmt(monthExpenseTotal)}</div>
            </div>
            <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
              <div className="stat-label">Net</div>
              <div className={`stat-value ${monthIncomeTotal - monthExpenseTotal >= 0 ? 'amt-positive' : 'amt-negative'}`}>
                {fmtBalance(monthIncomeTotal - monthExpenseTotal)}
              </div>
            </div>
          </div>

          {forecast && (
            <>
              {/* ── Forecast vs Actual ── */}
              <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ marginBottom: '0.85rem' }}>Forecast vs Actual</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[
                    { label: 'Expected Income', value: forecast.total_expected_income, max: maxBar, color: 'var(--green-100)', tag: 'forecast', textColor: 'var(--green-700)' },
                    { label: 'Actual Income', value: forecast.actual_income, max: maxBar, color: 'var(--green-700)', tag: 'actual', textColor: 'var(--success)' },
                    { label: 'Expected Expense', value: forecast.total_expected_outgoing, max: maxBar, color: '#f5c4c0', tag: 'forecast', textColor: 'var(--text-secondary)' },
                    { label: 'Actual Expense', value: forecast.actual_expense, max: maxBar, color: 'var(--red-600)', tag: 'actual', textColor: 'var(--danger)' },
                  ].map(bar => (
                    <div key={bar.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {bar.label}
                          {bar.tag === 'actual' && (
                            <span className="badge badge-green" style={{ marginLeft: '0.4rem', fontSize: '0.6rem' }}>actual</span>
                          )}
                        </span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: bar.textColor }}>{fmt(bar.value)}</span>
                      </div>
                      <div className="progress-bar" style={{ height: '7px' }}>
                        <div style={{
                          height: '100%', borderRadius: '99px',
                          background: bar.color,
                          width: `${pct(bar.value, bar.max)}%`,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Income sources ── */}
              {(forecast.forecast_income?.length ?? 0) > 0 && (
                <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3>Income Sources</h3>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#34d399' }}>{fmt(forecast.total_expected_income)}</span>
                  </div>
                  <div className="list">
                    {(forecast.forecast_income ?? []).map((item, i) => (
                      <div key={i} className="list-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.88rem' }}>{item.label}</span>
                        </div>
                        <span className="amt-positive">{fmt(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Outgoing breakdown ── */}
              {(forecast.forecast_outgoing?.length ?? 0) > 0 && (
                <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3>Outgoing Breakdown</h3>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fb7185' }}>− {fmt(forecast.total_expected_outgoing)}</span>
                  </div>
                  <div className="list">
                    {(forecast.forecast_outgoing ?? []).map((item, i) => (
                      <div key={i} className="list-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: '#f43f5e', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.88rem' }}>{item.label}</span>
                        </div>
                        <span className="amt-negative">− {fmt(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn-glass"
                    style={{ width: '100%', marginTop: '0.85rem', justifyContent: 'center', gap: '0.4rem', display: 'inline-flex', alignItems: 'center', fontSize: '0.82rem' }}
                    onClick={() => setDetailOpen(true)}
                  >
                    <ListFilter size={15} strokeWidth={2} />
                    Detailed breakdown by date
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Wallet ledger (BOTTOM, one card) ── */}
          <div className="section-row" style={{ marginBottom: '0.6rem' }}>
            <h3>Wallet ledger</h3>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>{MONTH_NAMES[month - 1]} {year}</span>
          </div>

          {accounts.length > 1 && (
            <div className="rpt-chips">
              <button className={`rpt-chip ${walletFilter === 'all' ? 'active' : ''}`} onClick={() => setWalletFilter('all')}>
                All wallets
              </button>
              {accounts.map(a => (
                <button
                  key={a.id}
                  className={`rpt-chip ${walletFilter === a.id ? 'active' : ''}`}
                  onClick={() => setWalletFilter(a.id)}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}

          {ledgerTxs.length === 0 ? (
            <div className="glass empty-state">
              <div className="empty-icon"><BarChart3 size={36} strokeWidth={1.5} /></div>
              <p>No movements for this month.</p>
            </div>
          ) : (
            <div className="glass rpt-ledger">
              {ledgerTxs.map(tx => {
                const open = expanded === tx.id
                const { day, mon } = dayLabel(tx.date)
                const income = tx.type === 'income'
                const transfer = isTransfer(tx)
                return (
                  <div key={tx.id} className="rpt-led-item">
                    <button className="rpt-led-row" onClick={() => setExpanded(open ? null : tx.id)}>
                      <span className="rpt-led-date">{day}<small>{mon}</small></span>
                      <span className="rpt-led-desc">
                        <span className="rpt-led-desc-main">{txTitle(tx)}</span>
                        <span className="rpt-led-desc-sub">{accountName(tx.account)}</span>
                      </span>
                      <span className={`rpt-led-amt ${income ? 'amt-positive' : 'amt-negative'}`}>
                        {income ? '+' : '−'} {fmt(tx.amount)}
                      </span>
                      <span className={`rpt-led-chev ${open ? 'open' : ''}`}>
                        <ChevronDown size={15} strokeWidth={2} />
                      </span>
                    </button>
                    {open && (
                      <div className="rpt-led-detail">
                        <div>
                          <span className="rpt-led-dk">Account</span>
                          <span className="rpt-led-dv">{accountName(tx.account)}</span>
                        </div>
                        <div>
                          <span className="rpt-led-dk">Type</span>
                          <span className="rpt-led-dv">{accountType(tx.account)}{transfer ? ' · transfer' : ''}</span>
                        </div>
                        <div>
                          <span className="rpt-led-dk">Category</span>
                          <span className="rpt-led-dv">{tx.category || '—'}</span>
                        </div>
                        <div>
                          <span className="rpt-led-dk">Date</span>
                          <span className="rpt-led-dv">{tx.date}</span>
                        </div>
                        <div>
                          <span className="rpt-led-dk">Debit</span>
                          <span className="rpt-led-dv amt-negative">{income ? '—' : fmt(tx.amount)}</span>
                        </div>
                        <div>
                          <span className="rpt-led-dk">Credit</span>
                          <span className="rpt-led-dv amt-positive">{income ? fmt(tx.amount) : '—'}</span>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span className="rpt-led-dk">Balance after</span>
                          <span className="rpt-led-dv">{fmtBalance(balanceAfter.get(tx.id) ?? 0)}</span>
                        </div>
                        {tx.notes && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <span className="rpt-led-dk">Note</span>
                            <span className="rpt-led-dv" style={{ fontWeight: 500 }}>{tx.notes}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Detailed outgoing breakdown modal ── */}
      {detailOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetailOpen(false)}>
          <div className="modal-sheet" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>Expense breakdown</h2>
              <button className="modal-close" onClick={() => setDetailOpen(false)} aria-label="Close">
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="grid-2" style={{ marginBottom: '0.85rem' }}>
              <div className="form-group">
                <label>From</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>To</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </div>

            <div className="glass" style={{ padding: '0.75rem 0.85rem', marginBottom: '0.85rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Total spent</span>
              <span style={{ fontWeight: 800, color: 'var(--danger)' }}>{fmt(detailTotal)}</span>
            </div>

            {detailByCategory.length > 0 && (
              <>
                <div className="rpt-led-dk" style={{ marginBottom: '0.35rem' }}>By category</div>
                <div className="list" style={{ marginBottom: '0.85rem' }}>
                  {detailByCategory.map(([cat, amt]) => (
                    <div key={cat} className="list-item">
                      <span style={{ fontSize: '0.85rem' }}>{cat}</span>
                      <span className="amt-negative" style={{ fontWeight: 700 }}>{fmt(amt)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="rpt-led-dk" style={{ marginBottom: '0.35rem' }}>Transactions</div>
            {detailRows.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.85rem', padding: '0.5rem 0' }}>No expenses in this range.</p>
            ) : (
              <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                {detailRows.map(tx => {
                  const { day, mon } = dayLabel(tx.date)
                  return (
                    <div key={tx.id} className="rpt-detail-row">
                      <span className="rpt-led-date">{day}<small>{mon}</small></span>
                      <span style={{ minWidth: 0 }}>
                        <span className="rpt-led-desc-main">{txTitle(tx)}</span>
                        <span className="rpt-led-desc-sub">{accountName(tx.account)} · {tx.category || '—'}</span>
                      </span>
                      <span className="amt-negative" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        − {fmt(tx.amount)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
