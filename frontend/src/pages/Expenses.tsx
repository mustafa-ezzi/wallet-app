import { useEffect, useState, useCallback } from 'react'
import { Banknote, ClipboardList, CircleDollarSign, X } from 'lucide-react'
import { expensesApi, payablesApi, receivablesApi, accountsApi, projectsApi, transactionsApi, asList, apiErrorMessage } from '../api/client'
import { fmt, fmtNum } from '../utils/format'

// ── Helpers ────────────────────────────────────────────────────────────────

function nextDueDate(dueDay: number): string {
  if (!dueDay || dueDay < 1) return '—'
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay)
  const target = thisMonth > today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  return target.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(dueDay: number): number {
  if (!dueDay || dueDay < 1) return 999
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay)
  const target = thisMonth > today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function dueBadgeClass(days: number): string {
  if (days <= 3) return 'badge badge-red'
  if (days <= 7) return 'badge badge-yellow'
  return 'badge badge-blue'
}

// ── Types ──────────────────────────────────────────────────────────────────

interface RecurringExpense {
  id: number; name: string; amount: number; frequency: string
  due_day: number | null; account: number | null; account_name: string | null
  active: boolean; paid_this_month: boolean
}
interface Payable {
  id: number; name: string; total_amount: number; monthly_amount: number
  total_installments: number; installments_paid: number; remaining_amount: number
  due_day: number; account: number | null; account_name: string | null
  status: string; paid_this_month: boolean
}
interface Receivable {
  id: number; linked_project: number; project_name: string
  total_amount: number; monthly_amount: number; total_installments: number
  installments_received: number; remaining_amount: number
  start_date: string; status: string; received_this_month: boolean
}

type ActiveTab = 'expenses' | 'payables' | 'receivables'

// ── Main component ─────────────────────────────────────────────────────────

export default function Expenses() {
  const [tab, setTab] = useState<ActiveTab>('expenses')

  // ── data ──
  const [expenses, setExpenses] = useState<RecurringExpense[]>([])
  const [payables, setPayables] = useState<Payable[]>([])
  const [receivables, setReceivables] = useState<Receivable[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // ── modals ──
  const [expModal, setExpModal] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [recModal, setRecModal] = useState(false)
  const [recordPayModal, setRecordPayModal] = useState<{ type: 'payable' | 'receivable' | 'recurring_expense'; id: number; name: string; amount: number; defaultAccount?: string } | null>(null)

  // ── editing ──
  const [editingExp, setEditingExp] = useState<RecurringExpense | null>(null)
  const [editingPay, setEditingPay] = useState<Payable | null>(null)
  const [editingRec, setEditingRec] = useState<Receivable | null>(null)

  // ── forms ──
  const EMPTY_EXP = { name: '', amount: '', frequency: 'monthly', due_day: '1', account: '' }
  const EMPTY_PAY = { name: '', total_amount: '', monthly_amount: '', total_installments: '', due_day: '1', account: '' }
  const EMPTY_REC = { linked_project: '', total_amount: '', monthly_amount: '', total_installments: '', start_date: new Date().toISOString().split('T')[0] }

  const [expForm, setExpForm] = useState({ ...EMPTY_EXP })
  const [payForm, setPayForm] = useState({ ...EMPTY_PAY })
  const [recForm, setRecForm] = useState({ ...EMPTY_REC })
  const [recordAmount, setRecordAmount] = useState('')
  const [recordAccount, setRecordAccount] = useState('')
  const [recordDate, setRecordDate] = useState(new Date().toISOString().split('T')[0])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── load ──
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [eR, pR, rR, aR, prR] = await Promise.all([
        expensesApi.list(),
        payablesApi.list(),
        receivablesApi.list(),
        accountsApi.list(),
        projectsApi.list(),
      ])
      setExpenses(asList(eR.data))
      setPayables(asList(pR.data))
      setReceivables(asList(rR.data))
      setAccounts(asList(aR.data))
      setProjects(asList(prR.data))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── setters ──
  const sE = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setExpForm(f => ({ ...f, [k]: e.target.value }))
  const sP = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setPayForm(f => ({ ...f, [k]: e.target.value }))
  const sR = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setRecForm(f => ({ ...f, [k]: e.target.value }))

  // ── open modals ──
  const openAddExp = () => { setEditingExp(null); setExpForm({ ...EMPTY_EXP }); setError(''); setExpModal(true) }
  const openEditExp = (e: RecurringExpense) => {
    setEditingExp(e)
    setExpForm({ name: e.name, amount: String(e.amount), frequency: e.frequency, due_day: String(e.due_day ?? 1), account: e.account ? String(e.account) : '' })
    setError(''); setExpModal(true)
  }
  const openAddPay = () => { setEditingPay(null); setPayForm({ ...EMPTY_PAY }); setError(''); setPayModal(true) }
  const openEditPay = (p: Payable) => {
    setEditingPay(p)
    setPayForm({ name: p.name, total_amount: String(p.total_amount), monthly_amount: String(p.monthly_amount), total_installments: String(p.total_installments), due_day: String(p.due_day), account: p.account ? String(p.account) : '' })
    setError(''); setPayModal(true)
  }
  const openAddRec = () => { setEditingRec(null); setRecForm({ ...EMPTY_REC }); setError(''); setRecModal(true) }
  const openEditRec = (r: Receivable) => {
    setEditingRec(r)
    setRecForm({ linked_project: String(r.linked_project), total_amount: String(r.total_amount), monthly_amount: String(r.monthly_amount), total_installments: String(r.total_installments), start_date: r.start_date })
    setError(''); setRecModal(true)
  }

  // ── submit handlers ──
  const submitExp = async (ev: React.FormEvent) => {
    ev.preventDefault(); setSaving(true); setError('')
    const payload = { name: expForm.name, amount: parseFloat(expForm.amount), frequency: expForm.frequency, due_day: expForm.due_day ? parseInt(expForm.due_day) : null, account: expForm.account ? parseInt(expForm.account) : null, active: true }
    try {
      if (editingExp) await expensesApi.update(editingExp.id, payload)
      else await expensesApi.create(payload)
      setExpModal(false); load()
    } catch (err: any) { setError(apiErrorMessage(err, 'Failed.')) }
    finally { setSaving(false) }
  }

  const submitPay = async (ev: React.FormEvent) => {
    ev.preventDefault(); setSaving(true); setError('')
    const payload = { name: payForm.name, total_amount: parseFloat(payForm.total_amount), monthly_amount: parseFloat(payForm.monthly_amount), total_installments: parseInt(payForm.total_installments), due_day: parseInt(payForm.due_day), account: payForm.account ? parseInt(payForm.account) : null }
    try {
      if (editingPay) await payablesApi.update(editingPay.id, payload)
      else await payablesApi.create(payload)
      setPayModal(false); load()
    } catch (err: any) { setError(apiErrorMessage(err, 'Failed.')) }
    finally { setSaving(false) }
  }

  const submitRec = async (ev: React.FormEvent) => {
    ev.preventDefault(); setSaving(true); setError('')
    const payload = { linked_project: parseInt(recForm.linked_project), total_amount: parseFloat(recForm.total_amount), monthly_amount: parseFloat(recForm.monthly_amount), total_installments: parseInt(recForm.total_installments), start_date: recForm.start_date }
    try {
      if (editingRec) await receivablesApi.update(editingRec.id, payload)
      else await receivablesApi.create(payload)
      setRecModal(false); load()
    } catch (err: any) { setError(apiErrorMessage(err, 'Failed.')) }
    finally { setSaving(false) }
  }

  const toggleActive = async (exp: RecurringExpense) => {
    await expensesApi.update(exp.id, { active: !exp.active }); load()
  }

  const markPayableComplete = async (p: Payable) => {
    if (!confirm(`Mark "${p.name}" as completed?`)) return
    await payablesApi.update(p.id, { status: 'completed' }); load()
  }

  const markReceivableStuck = async (r: Receivable) => {
    const newStatus = r.status === 'stuck' ? 'ongoing' : 'stuck'
    await receivablesApi.update(r.id, { status: newStatus }); load()
  }

  const submitRecordPayment = async (ev: React.FormEvent) => {
    ev.preventDefault(); if (!recordPayModal) return
    setSaving(true); setError('')
    try {
      const payload: any = {
        type: recordPayModal.type === 'receivable' ? 'income' : 'expense',
        amount: parseFloat(recordAmount),
        date: recordDate,
        account: parseInt(recordAccount),
      }
      if (recordPayModal.type === 'payable') {
        payload.linked_payable = recordPayModal.id
        payload.category = 'Loan Repayment'
      } else if (recordPayModal.type === 'receivable') {
        payload.linked_receivable = recordPayModal.id
        payload.category = 'Installment Receipt'
      } else {
        // recurring_expense — just a regular expense transaction tagged by name
        payload.category = recordPayModal.name
        payload.notes = `Recurring expense payment: ${recordPayModal.name}`
      }
      await transactionsApi.create(payload)
      setRecordPayModal(null); setRecordAmount(''); load()
    } catch (err: any) { setError(Object.values(err.response?.data ?? {}).flat().join(' ') || 'Failed.') }
    finally { setSaving(false) }
  }

  // ── computed summaries ──
  const monthlyExpTotal = expenses.filter(e => e.active && e.frequency === 'monthly').reduce((s, e) => s + e.amount, 0)
  const monthlyPayTotal = payables.filter(p => p.status === 'ongoing').reduce((s, p) => s + p.monthly_amount, 0)
  const totalRecRemaining = receivables.filter(r => r.status !== 'completed').reduce((s, r) => s + r.remaining_amount, 0)

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
      <h1>Bills</h1>
      <p className="page-subtitle">Fixed costs, loans you pay, and money still owed to you.</p>
        </div>
      </div>

      {/* ── Summary strips ── */}
      <div className="grid-3" style={{ marginBottom: '1rem' }}>
        <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
          <div className="stat-label">Monthly Expenses</div>
          <div className="stat-value amt-negative">{fmt(monthlyExpTotal)}</div>
          <div className="stat-sub">fixed / month</div>
        </div>
        <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
          <div className="stat-label">Loan Payments</div>
          <div className="stat-value amt-negative">{fmt(monthlyPayTotal)}</div>
          <div className="stat-sub">payable / month</div>
        </div>
        <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
          <div className="stat-label">Still Owed to Me</div>
          <div className="stat-value amt-positive">{fmt(totalRecRemaining)}</div>
          <div className="stat-sub">remaining receivable</div>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="tab-bar">
        {(['expenses', 'payables', 'receivables'] as ActiveTab[]).map(t => (
          <button
            key={t}
            className={`tab-bar-item ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'expenses' ? (
              <><ClipboardList size={14} strokeWidth={1.75} /> Monthly costs</>
            ) : t === 'payables' ? (
              <><Banknote size={14} strokeWidth={1.75} /> Loans you pay</>
            ) : (
              <><CircleDollarSign size={14} strokeWidth={1.75} /> Money owed to you</>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════
          TAB 1 — Recurring Expenses
      ══════════════════════════════════════ */}
      {tab === 'expenses' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3>Recurring Expenses</h3>
            <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }} onClick={openAddExp}>+ Add</button>
          </div>

          {expenses.length === 0 ? (
            <div className="glass empty-state">
              <div className="empty-icon"><ClipboardList size={36} strokeWidth={1.5} /></div>
              <p>No fixed monthly costs yet.</p>
              <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={openAddExp}>Add first expense</button>
            </div>
          ) : (
            <div className="list">
              {expenses.map(exp => {
                const days = exp.due_day ? daysUntil(exp.due_day) : 999
                return (
                  <div key={exp.id} className="glass" style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-md)', opacity: exp.active ? 1 : 0.55 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{exp.name}</span>
                          <span className={exp.active ? 'badge badge-green' : 'badge badge-gray'}>
                            {exp.active ? 'active' : 'inactive'}
                          </span>
                          <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>
                            {exp.frequency}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          {exp.due_day && (
                            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                              Due day {exp.due_day}
                            </span>
                          )}
                          {exp.account_name && (
                            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                              via {exp.account_name}
                            </span>
                          )}
                        </div>
                        {exp.active && exp.due_day && (
                          <div style={{ marginTop: '0.35rem' }}>
                            <span className={dueBadgeClass(days)} style={{ fontSize: '0.68rem' }}>
                              Next due: {nextDueDate(exp.due_day)}
                              {days <= 7 ? ` (${days}d)` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="amt-negative" style={{ fontSize: '1rem', fontWeight: 800 }}>
                          {fmt(exp.amount)}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                          {exp.frequency === 'monthly' ? '/ month' : 'one-time'}
                        </div>
                      </div>
                    </div>
                    <div className="divider" style={{ margin: '0.65rem 0 0.5rem' }} />
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {exp.active && (
                        exp.paid_this_month ? (
                          <button
                            className="btn-glass"
                            disabled
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem', opacity: 0.65, cursor: 'not-allowed', color: 'var(--success)', borderColor: 'rgba(52,211,153,0.35)' }}
                            title="Already recorded this month"
                          >
                            ✓ Paid this month
                          </button>
                        ) : (
                          <button
                            className="btn-primary"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem' }}
                            onClick={() => {
                              setRecordPayModal({ type: 'recurring_expense', id: exp.id, name: exp.name, amount: exp.amount, defaultAccount: exp.account ? String(exp.account) : '' })
                              setRecordAmount(String(exp.amount))
                              setRecordAccount(exp.account ? String(exp.account) : '')
                              setError('')
                            }}
                          >
                            Record Payment
                          </button>
                        )
                      )}
                      <button className="btn-glass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }} onClick={() => openEditExp(exp)}>Edit</button>
                      <button
                        className="btn-glass"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', color: exp.active ? '#fbbf24' : '#34d399', borderColor: exp.active ? 'rgba(251,191,36,0.3)' : 'rgba(52,211,153,0.3)' }}
                        onClick={() => toggleActive(exp)}
                      >
                        {exp.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn-glass"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', color: '#fb7185', borderColor: 'rgba(251,113,133,0.3)' }}
                        onClick={async () => { if (confirm(`Delete "${exp.name}"?`)) { await expensesApi.remove(exp.id); load() } }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════
          TAB 2 — Payables / Loans
      ══════════════════════════════════════ */}
      {tab === 'payables' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3>Payables & Loans</h3>
            <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }} onClick={openAddPay}>+ Add Loan</button>
          </div>

          {payables.length === 0 ? (
            <div className="glass empty-state">
              <div className="empty-icon"><Banknote size={36} strokeWidth={1.5} /></div>
              <p>No payable installments yet.</p>
              <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={openAddPay}>Add first loan</button>
            </div>
          ) : (
            <div className="list">
              {payables.map(p => {
                const prog = p.total_installments > 0 ? (p.installments_paid / p.total_installments) * 100 : 0
                const days = daysUntil(p.due_day)
                const amtPaid = p.installments_paid * p.monthly_amount
                return (
                  <div key={p.id} className="glass" style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-md)', opacity: p.status === 'completed' ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</span>
                          <span className={p.status === 'completed' ? 'badge badge-green' : 'badge badge-blue'}>
                            {p.status}
                          </span>
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                          {p.installments_paid} of {p.total_installments} paid · PKR {fmtNum(amtPaid)} paid so far
                        </div>
                        {p.status === 'ongoing' && (
                          <div style={{ marginTop: '0.35rem' }}>
                            <span className={dueBadgeClass(days)} style={{ fontSize: '0.68rem' }}>
                              Next due: {nextDueDate(p.due_day)}{days <= 7 ? ` (${days}d)` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--danger)' }}>
                          {fmt(p.monthly_amount)}<span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)' }}>/mo</span>
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                          Remaining: {fmt(p.remaining_amount)}
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: '0.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {Math.round(prog)}% complete · Total: {fmt(p.total_amount)}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {p.total_installments - p.installments_paid} left
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: `${prog}%` }} />
                      </div>
                    </div>

                    <div className="divider" style={{ margin: '0.55rem 0 0.45rem' }} />
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {p.status === 'ongoing' && (
                        p.paid_this_month ? (
                          <button
                            className="btn-glass"
                            disabled
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem', opacity: 0.65, cursor: 'not-allowed', color: 'var(--success)', borderColor: 'rgba(52,211,153,0.35)' }}
                            title="This month's installment is already recorded"
                          >
                            ✓ Paid this month
                          </button>
                        ) : (
                          <button
                            className="btn-primary"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem' }}
                            onClick={() => { setRecordPayModal({ type: 'payable', id: p.id, name: p.name, amount: p.monthly_amount }); setRecordAmount(String(p.monthly_amount)); setRecordAccount(p.account ? String(p.account) : ''); setError('') }}
                          >
                            Record Payment
                          </button>
                        )
                      )}
                      <button className="btn-glass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }} onClick={() => openEditPay(p)}>Edit</button>
                      {p.status === 'ongoing' && (
                        <button className="btn-glass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', color: '#34d399', borderColor: 'rgba(52,211,153,0.3)' }} onClick={() => markPayableComplete(p)}>
                          Mark Complete
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════
          TAB 3 — Receivables
      ══════════════════════════════════════ */}
      {tab === 'receivables' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3>Receivable Installments</h3>
            <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }} onClick={openAddRec}>+ Add</button>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.85rem' }}>
            Money clients owe you, being paid in installments.
          </p>

          {receivables.length === 0 ? (
            <div className="glass empty-state">
              <div className="empty-icon"><CircleDollarSign size={36} strokeWidth={1.5} /></div>
              <p>No receivable installments yet.</p>
              <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={openAddRec}>Add receivable</button>
            </div>
          ) : (
            <div className="list">
              {receivables.map(r => {
                const prog = r.total_installments > 0 ? (r.installments_received / r.total_installments) * 100 : 0
                const amtReceived = r.installments_received * r.monthly_amount
                return (
                  <div key={r.id} className="glass" style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-md)', opacity: r.status === 'completed' ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.project_name}</span>
                          <span className={
                            r.status === 'completed' ? 'badge badge-green' :
                            r.status === 'stuck' ? 'badge badge-red' :
                            'badge badge-blue'
                          }>
                            {r.status}
                          </span>
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                          {r.installments_received} of {r.total_installments} received · PKR {fmtNum(amtReceived)} received so far
                        </div>
                        {r.status === 'stuck' && (
                          <div style={{ marginTop: '0.3rem', fontSize: '0.78rem', color: '#fb7185' }}>
                            ⚠ Payment is stuck / overdue
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--success)' }}>
                          {fmt(r.monthly_amount)}<span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)' }}>/installment</span>
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                          Remaining: {fmt(r.remaining_amount)}
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: '0.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {Math.round(prog)}% received · Total: {fmt(r.total_amount)}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {r.total_installments - r.installments_received} remaining
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div style={{ height: '100%', borderRadius: '99px', width: `${prog}%`, background: r.status === 'stuck' ? 'linear-gradient(90deg,var(--red-600),#e05555)' : 'linear-gradient(90deg,var(--green-700),var(--green-600))', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>

                    <div className="divider" style={{ margin: '0.55rem 0 0.45rem' }} />
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {r.status === 'ongoing' && (
                        r.received_this_month ? (
                          <button
                            className="btn-glass"
                            disabled
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem', opacity: 0.65, cursor: 'not-allowed', color: 'var(--success)', borderColor: 'rgba(52,211,153,0.35)' }}
                            title="This month's receipt is already recorded"
                          >
                            ✓ Received this month
                          </button>
                        ) : (
                          <button
                            className="btn-primary"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem' }}
                            onClick={() => { setRecordPayModal({ type: 'receivable', id: r.id, name: r.project_name, amount: r.monthly_amount }); setRecordAmount(String(r.monthly_amount)); setRecordAccount(''); setError('') }}
                          >
                            Record Receipt
                          </button>
                        )
                      )}
                      <button className="btn-glass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }} onClick={() => openEditRec(r)}>Edit</button>
                      {r.status !== 'completed' && (
                        <button
                          className="btn-glass"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', color: r.status === 'stuck' ? '#34d399' : '#fb7185', borderColor: r.status === 'stuck' ? 'rgba(52,211,153,0.3)' : 'rgba(251,113,133,0.3)' }}
                          onClick={() => markReceivableStuck(r)}
                        >
                          {r.status === 'stuck' ? 'Resume' : 'Mark Stuck'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════
          MODAL — Add/Edit Recurring Expense
      ══════════════════════════════════════ */}
      {expModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setExpModal(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{editingExp ? 'Edit Expense' : 'Add Recurring Expense'}</h2>
              <button className="modal-close" onClick={() => setExpModal(false)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
            </div>
            {error && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <form onSubmit={submitExp} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Expense Name</label>
                <input type="text" placeholder="e.g. Utilities, Server Charges" value={expForm.name} onChange={sE('name')} required />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input type="number" min="0" step="any" placeholder="0.00" value={expForm.amount} onChange={sE('amount')} required />
                </div>
                <div className="form-group">
                  <label>Frequency</label>
                  <select value={expForm.frequency} onChange={sE('frequency')}>
                    <option value="monthly">Monthly</option>
                    <option value="one_time">One-Time</option>
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Due Day of Month</label>
                  <input type="number" min="1" max="31" placeholder="1–31" value={expForm.due_day} onChange={sE('due_day')} />
                </div>
                <div className="form-group">
                  <label>Default Account</label>
                  <select value={expForm.account} onChange={sE('account')}>
                    <option value="">None</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : editingExp ? 'Save Changes' : 'Add Expense'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          MODAL — Add/Edit Payable
      ══════════════════════════════════════ */}
      {payModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPayModal(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{editingPay ? 'Edit Payable' : 'Add Payable / Loan'}</h2>
              <button className="modal-close" onClick={() => setPayModal(false)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
            </div>
            {error && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <form onSubmit={submitPay} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Loan / Commitment Name</label>
                <input type="text" placeholder="e.g. Engagement Loan, Land Payment" value={payForm.name} onChange={sP('name')} required />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Total Amount (PKR)</label>
                  <input type="number" min="0" step="any" placeholder="e.g. 100,000" value={payForm.total_amount} onChange={sP('total_amount')} required />
                </div>
                <div className="form-group">
                  <label>Monthly Payment (PKR)</label>
                  <input type="number" min="0" step="any" placeholder="e.g. 10,000" value={payForm.monthly_amount} onChange={sP('monthly_amount')} required />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Total Installments</label>
                  <input type="number" min="1" placeholder="e.g. 10" value={payForm.total_installments} onChange={sP('total_installments')} required />
                </div>
                <div className="form-group">
                  <label>Due Day of Month</label>
                  <input type="number" min="1" max="31" placeholder="1–31" value={payForm.due_day} onChange={sP('due_day')} />
                </div>
              </div>
              <div className="form-group">
                <label>Default Payment Account</label>
                <select value={payForm.account} onChange={sP('account')}>
                  <option value="">None</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : editingPay ? 'Save Changes' : 'Add Payable'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          MODAL — Add/Edit Receivable
      ══════════════════════════════════════ */}
      {recModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setRecModal(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{editingRec ? 'Edit Receivable' : 'Add Receivable Installment'}</h2>
              <button className="modal-close" onClick={() => setRecModal(false)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
            </div>
            {error && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <form onSubmit={submitRec} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Linked income (optional)</label>
                <select value={recForm.linked_project} onChange={sR('linked_project')} required>
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Total Amount (PKR)</label>
                  <input type="number" min="0" step="any" placeholder="e.g. 30,000" value={recForm.total_amount} onChange={sR('total_amount')} required />
                </div>
                <div className="form-group">
                  <label>Per Installment (PKR)</label>
                  <input type="number" min="0" step="any" placeholder="e.g. 5,000" value={recForm.monthly_amount} onChange={sR('monthly_amount')} required />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Total Installments</label>
                  <input type="number" min="1" placeholder="e.g. 6" value={recForm.total_installments} onChange={sR('total_installments')} required />
                </div>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={recForm.start_date} onChange={sR('start_date')} required />
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : editingRec ? 'Save Changes' : 'Add Receivable'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          MODAL — Record Payment / Receipt
      ══════════════════════════════════════ */}
      {recordPayModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setRecordPayModal(null)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{recordPayModal.type === 'receivable' ? 'Record Receipt' : 'Record Payment'}</h2>
              <button className="modal-close" onClick={() => setRecordPayModal(null)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
            </div>
            <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
              {recordPayModal.type === 'receivable' ? 'Receipt from' : 'Payment for'}: <strong>{recordPayModal.name}</strong>
            </p>
            {error && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <form onSubmit={submitRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input type="number" min="0" step="any" value={recordAmount} onChange={e => setRecordAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} required />
                </div>
              </div>
              <div className="form-group">
                <label>Account</label>
                <select value={recordAccount} onChange={e => setRecordAccount(e.target.value)} required>
                  <option value="">Select account…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : recordPayModal.type === 'receivable' ? 'Record Receipt' : 'Record Payment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
