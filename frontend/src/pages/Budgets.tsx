import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, PieChart, X } from 'lucide-react'
import { budgetsApi, apiErrorMessage, type BudgetPayload, type BudgetRow } from '../api/client'
import { EXPENSE_CATEGORIES, getCategoryMeta } from '../constants/categories'
import { fmt } from '../utils/format'
import { track } from '../lib/analytics'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function statusColor(status: string): string {
  if (status === 'over') return 'var(--danger, #ef4444)'
  if (status === 'warning') return '#f59e0b'
  if (status === 'ok') return 'var(--success, #22c55e)'
  return 'var(--border, #e2e8f0)'
}

function barFill(status: string): string {
  if (status === 'over') return '#ef4444'
  if (status === 'warning') return '#f59e0b'
  return '#22c55e'
}

export default function BudgetsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<BudgetPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState<BudgetRow | null>(null)
  const [limitInput, setLimitInput] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await budgetsApi.get(year, month)
      setData(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load budgets.'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    track('budget_screen_viewed', { year, month })
    void load()
  }, [load, year, month])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1

  const visibleRows = useMemo(() => {
    if (!data) return []
    const [allRow, ...rest] = data.rows
    const filtered = showAll
      ? rest
      : rest.filter(r => r.has_limit || r.spent > 0)
    return allRow ? [allRow, ...filtered] : filtered
  }, [data, showAll])

  const openEdit = (row: BudgetRow) => {
    setEditing(row)
    setLimitInput(row.has_limit && row.limit != null ? String(row.limit) : '')
    setError('')
  }

  const saveLimit = async () => {
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      const raw = limitInput.trim()
      const amount = raw === '' ? null : Number(raw)
      if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
        setError('Enter a valid PKR amount.')
        setSaving(false)
        return
      }
      const res = await budgetsApi.upsert({
        year,
        month,
        category: editing.category,
        limit_amount: amount != null && amount > 0 ? amount : null,
      })
      setData(res.data)
      track(amount && amount > 0 ? 'budget_limit_set' : 'budget_limit_cleared', {
        category: editing.category,
        limit: amount,
        month,
      })
      setEditing(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save budget.'))
    } finally {
      setSaving(false)
    }
  }

  const clearLimit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.id) {
        const res = await budgetsApi.remove(editing.id, year, month)
        setData(res.data)
      } else {
        const res = await budgetsApi.upsert({
          year, month, category: editing.category, limit_amount: null,
        })
        setData(res.data)
      }
      track('budget_limit_cleared', { category: editing.category, month })
      setEditing(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not clear budget.'))
    } finally {
      setSaving(false)
    }
  }

  const copyPrevious = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await budgetsApi.copyFromPrevious(year, month)
      setData(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not copy previous month.'))
    } finally {
      setSaving(false)
    }
  }

  const summaryPct = data?.total_limit
    ? Math.min(100, Math.round((data.total_spent / data.total_limit) * 100))
    : null

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Budgets</h1>
          <p className="text-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
            Set monthly limits. Spent updates from your expenses automatically.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button type="button" className="btn-glass" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="btn-glass"
            style={{ minWidth: 140, fontWeight: 700 }}
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }}
          >
            {isCurrent ? 'This month' : `${MONTH_NAMES[month - 1]} ${year}`}
          </button>
          <button type="button" className="btn-glass" onClick={nextMonth} aria-label="Next month" disabled={isCurrent}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {error && !editing ? <div className="auth-error" style={{ marginBottom: '0.85rem' }}>{error}</div> : null}

      {loading && !data ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : null}

      {data ? (
        <>
          <div className="glass" style={{ padding: '1.1rem 1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                  {data.period_label}
                </div>
                <div style={{ fontSize: '1.55rem', fontWeight: 800, marginTop: 4 }}>
                  {fmt(data.total_spent)}
                  <span className="text-muted" style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                    {data.total_limit != null ? ` / ${fmt(data.total_limit)}` : ' spent'}
                  </span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  {data.total_limit != null
                    ? `${summaryPct}% of budget used`
                    : 'Set category limits below — or an overall cap on All expenses'}
                </div>
              </div>
              <button type="button" className="btn-glass" style={{ fontSize: '0.78rem' }} disabled={saving} onClick={() => void copyPrevious()}>
                Copy last month
              </button>
            </div>
            {data.total_limit != null ? (
              <div style={{ marginTop: '0.85rem', height: 8, borderRadius: 99, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${summaryPct ?? 0}%`,
                    height: '100%',
                    background: (summaryPct ?? 0) > 100 ? '#ef4444' : (summaryPct ?? 0) > 80 ? '#f59e0b' : '#22c55e',
                    borderRadius: 99,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Set a budget</h2>
            <button type="button" className="btn-glass" style={{ fontSize: '0.75rem' }} onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Hide empty' : 'Show all categories'}
            </button>
          </div>

          <div className="glass" style={{ borderRadius: 'var(--radius-md)', padding: '0.35rem 0.85rem' }}>
            {visibleRows.length === 0 ? (
              <p className="text-muted" style={{ padding: '1rem 0.25rem', margin: 0 }}>No spending this month yet. Add expenses, then set limits.</p>
            ) : (
              visibleRows.map(row => {
                const isAll = row.category === '__all__'
                const meta = isAll
                  ? null
                  : getCategoryMeta(row.category)
                const Icon = isAll ? PieChart : meta!.icon
                const color = isAll ? '#22c55e' : meta!.color
                const label = isAll ? 'All expenses' : (meta?.label || row.label)
                const pctW = row.has_limit && row.percent != null
                  ? Math.min(100, Math.max(2, row.percent))
                  : 0
                return (
                  <div
                    key={row.category}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 0.15rem',
                      borderBottom: '1px solid var(--border, rgba(0,0,0,0.06))',
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: `${color}22`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={18} color={color} strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{label}</div>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', flexShrink: 0 }}>
                          {fmt(row.spent)}
                          {row.has_limit ? (
                            <span className="text-muted" style={{ fontWeight: 600, fontSize: '0.78rem' }}> / {fmt(row.limit!)}</span>
                          ) : null}
                        </div>
                      </div>
                      {row.has_limit ? (
                        <>
                          <div style={{ marginTop: 6, height: 6, borderRadius: 99, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                            <div style={{ width: `${pctW}%`, height: '100%', background: barFill(row.status), borderRadius: 99 }} />
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 4, color: statusColor(row.status) }}>
                            {row.status === 'over'
                              ? `Over by ${fmt(row.over ?? 0)}`
                              : row.status === 'warning'
                                ? `${row.percent}% used — almost there`
                                : `${fmt(row.remaining ?? 0)} left`}
                          </div>
                        </>
                      ) : (
                        <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>No limit set</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={row.has_limit ? 'btn-glass' : 'btn-primary'}
                      style={{ fontSize: '0.78rem', flexShrink: 0, minWidth: 64 }}
                      onClick={() => openEdit(row)}
                    >
                      {row.has_limit ? 'Edit' : 'Set'}
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.85rem' }}>
            Bank transfers and people lend/borrow are excluded. Limits are per calendar month in PKR.
            {EXPENSE_CATEGORIES.length ? ` ${EXPENSE_CATEGORIES.length} standard categories.` : ''}
          </p>
        </>
      ) : null}

      {editing ? (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && setEditing(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                {editing.category === '__all__' ? 'Overall monthly budget' : `Budget · ${editing.label}`}
              </h2>
              <button type="button" className="modal-close" onClick={() => setEditing(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
              Spent this month: <strong>{fmt(editing.spent)}</strong>
            </p>
            {error ? <div className="auth-error" style={{ marginBottom: '0.65rem' }}>{error}</div> : null}
            <label className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 6 }}>Monthly limit (PKR)</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={limitInput}
              onChange={e => setLimitInput(e.target.value)}
              placeholder="e.g. 15000"
              autoFocus
              style={{ width: '100%', marginBottom: '0.85rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveLimit()} style={{ flex: 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {editing.has_limit ? (
                <button type="button" className="btn-glass" disabled={saving} onClick={() => void clearLimit()}>
                  Clear limit
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
