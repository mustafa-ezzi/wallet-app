import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { householdsApi, apiErrorMessage } from '../api/client'
import { fmt } from '../utils/format'
import { downloadHouseholdReportCSV } from '../utils/reportExport'
import HouseholdSettlementPanel from './HouseholdSettlementPanel'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May',
  'June', 'July', 'August', 'September', 'October', 'November', 'December',
]

interface Ledger {
  id: number
  name: string
  kind: string
  status: string
}

interface ReportData {
  total_spent: number
  expense_count: number
  period: string
  year: number | null
  month: number | null
  by_member: { name: string; amount: number }[]
  by_category: { name: string; amount: number }[]
  timeline: {
    date: string
    total: number
    count: number
    items: {
      id: number
      amount: number
      category: string
      notes: string
      paid_by_name: string
      account_name: string | null
    }[]
  }[]
  snapshot_total: number | null
  live_total: number | null
  snapshot_matches: boolean | null
}

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

interface Props {
  ledger: Ledger
  householdName: string
  /** Bump to force reload after expense changes */
  refreshKey?: number
}

export default function HouseholdReportPanel({ ledger, householdName, refreshKey = 0 }: Props) {
  const now = new Date()
  const isMonthlyView = ledger.kind === 'ongoing' && ledger.status === 'open'
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scope, setScope] = useState<'month' | 'all'>(isMonthlyView ? 'month' : 'all')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params =
        scope === 'month' ? { year, month } : undefined
      const res = await householdsApi.ledgerReport(ledger.id, params)
      setReport(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load report.'))
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [ledger.id, year, month, scope])

  useEffect(() => { load() }, [load, refreshKey])

  useEffect(() => {
    // When switching ledgers, default scope
    setScope(ledger.kind === 'ongoing' && ledger.status === 'open' ? 'month' : 'all')
  }, [ledger.id, ledger.kind, ledger.status])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const periodLabel =
    scope === 'month'
      ? `${MONTH_NAMES[month - 1]} ${year}`
      : ledger.status === 'closed'
        ? 'Full event (closed)'
        : 'All time'

  const exportCsv = () => {
    if (!report) return
    const rows = report.timeline.flatMap(day =>
      day.items.map(item => ({
        date: day.date,
        category: item.category,
        notes: item.notes,
        paid_by: item.paid_by_name,
        account: item.account_name || '',
        amount: item.amount,
      })),
    )
    downloadHouseholdReportCSV(rows, {
      householdName,
      ledgerName: ledger.name,
      periodLabel,
      totalSpent: report.total_spent,
      byMember: report.by_member,
      byCategory: report.by_category,
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
        <div className="rpt-chips" style={{ marginBottom: 0 }}>
          {(ledger.kind === 'ongoing') && (
            <button
              type="button"
              className={`rpt-chip ${scope === 'month' ? 'active' : ''}`}
              onClick={() => setScope('month')}
            >
              Month
            </button>
          )}
          <button
            type="button"
            className={`rpt-chip ${scope === 'all' ? 'active' : ''}`}
            onClick={() => setScope('all')}
          >
            {ledger.kind === 'event' || ledger.status === 'closed' ? 'Full event' : 'All time'}
          </button>
        </div>
        <button
          type="button"
          className="btn-glass"
          style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          onClick={exportCsv}
          disabled={!report || loading}
        >
          <Download size={14} strokeWidth={2} /> CSV
        </button>
      </div>

      {scope === 'month' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <button type="button" className="btn-icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div style={{ textAlign: 'center', minWidth: '9rem' }}>
            <div style={{ fontWeight: 700 }}>{MONTH_NAMES[month - 1]} {year}</div>
            {isCurrentMonth && (
              <div style={{ fontSize: '0.7rem', color: 'var(--primary-light)' }}>Current month</div>
            )}
          </div>
          <button type="button" className="btn-icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {error && <div className="auth-error" style={{ marginBottom: '0.85rem' }}>{error}</div>}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <div className="spinner spinner-dark" style={{ width: '1.75rem', height: '1.75rem' }} />
        </div>
      )}

      {!loading && report && (
        <>
          <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
            <div className="stat-label">{periodLabel}</div>
            <div className="stat-value amt-negative">{fmt(report.total_spent)}</div>
            <div className="stat-sub">
              {report.expense_count} expense{report.expense_count !== 1 ? 's' : ''}
              {report.by_member[0] ? ` · top payer ${report.by_member[0].name}` : ''}
            </div>
          </div>

          {report.snapshot_matches === false && (
            <div className="auth-error" style={{ marginBottom: '0.85rem' }}>
              Closed snapshot ({fmt(report.snapshot_total ?? 0)}) differs from live total ({fmt(report.live_total ?? 0)}). History may have changed after close.
            </div>
          )}
          {report.snapshot_matches === true && (
            <p className="text-muted" style={{ fontSize: '0.78rem', marginBottom: '0.85rem' }}>
              Closed snapshot matches live history ({fmt(report.snapshot_total ?? 0)}).
            </p>
          )}

          <div className="grid-2" style={{ gap: '0.85rem', marginBottom: '1rem' }}>
            <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.95rem' }}>By category</h3>
              {report.by_category.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>No expenses</p>
              ) : (
                report.by_category.map(c => (
                  <div key={c.name} style={{ marginBottom: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.82rem' }}>{c.name}</span>
                      <span className="amt-negative" style={{ fontSize: '0.82rem', fontWeight: 700 }}>{fmt(c.amount)}</span>
                    </div>
                    <div className="progress-bar" style={{ height: '6px' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '99px',
                          background: 'var(--red-500, #f43f5e)',
                          width: `${pct(c.amount, report.total_spent)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.95rem' }}>Who paid</h3>
              {report.by_member.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>No expenses</p>
              ) : (
                <div className="list">
                  {report.by_member.map(m => (
                    <div key={m.name} className="list-item" style={{ padding: '0.4rem 0' }}>
                      <span style={{ fontSize: '0.85rem' }}>{m.name}</span>
                      <span className="amt-negative" style={{ fontWeight: 700 }}>{fmt(m.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <h3 style={{ margin: '0 0 0.65rem' }}>Timeline</h3>
          {report.timeline.length === 0 ? (
            <div className="glass empty-state"><p>No shared expenses for this period.</p></div>
          ) : (
            <div className="list">
              {report.timeline.map(day => (
                <div key={day.date} className="glass" style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{day.date}</span>
                    <span className="amt-negative" style={{ fontWeight: 800 }}>{fmt(day.total)}</span>
                  </div>
                  {day.items.map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        fontSize: '0.82rem',
                        padding: '0.3rem 0',
                        borderTop: '1px solid var(--border, rgba(0,0,0,0.06))',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{item.category}</div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                          {item.paid_by_name}
                          {item.account_name ? ` · ${item.account_name}` : ''}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </div>
                      </div>
                      <span className="amt-negative" style={{ fontWeight: 700, flexShrink: 0 }}>{fmt(item.amount)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <HouseholdSettlementPanel ledgerId={ledger.id} refreshKey={refreshKey} />
        </>
      )}
    </div>
  )
}
