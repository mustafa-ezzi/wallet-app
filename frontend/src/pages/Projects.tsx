import { useEffect, useState } from 'react'
import { Coins, X } from 'lucide-react'
import { projectsApi, accountsApi, transactionsApi, asList, apiErrorMessage } from '../api/client'
import { fmt } from '../utils/format'
import { useConfirm } from '../hooks/useConfirm'

interface Project {
  id: number
  name: string
  income_type: string
  amount: number
  installment_amount: number | null
  advance_amount: number
  remaining_amount: number
  months_to_complete: number | null
  installments_received: number | null
  received_this_month: boolean
  status: string
  start_date: string
  default_account: number | null
  default_account_name: string | null
  notes: string
}

/** Friendly labels — avoid jargon like “recurring”. */
const TYPE_LABELS: Record<string, string> = {
  recurring_monthly:      'Every month',
  contract_monthly:       'Salary',
  one_time:               'One-time payment',
  one_time_installments:  'Paid in parts',
}

const TYPE_HINTS: Record<string, string> = {
  recurring_monthly:      'Salary, retainer, or anything that lands each month',
  contract_monthly:       'A fixed monthly amount from a client or deal',
  one_time:               'A single payment — add any advance already received',
  one_time_installments:  'Total due, collected in smaller payments over time',
}

const STATUS_BADGE: Record<string, string> = {
  active:    'badge-green',
  paused:    'badge-yellow',
  completed: 'badge-gray',
}

const EMPTY_FORM = {
  name: '', income_type: 'recurring_monthly', amount: '',
  installment_amount: '', advance_amount: '', status: 'active',
  start_date: new Date().toISOString().split('T')[0],
  default_account: '', notes: '',
}

export default function Projects() {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [projects, setProjects] = useState<Project[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Project | null>(null)
  const [form, setForm]           = useState({ ...EMPTY_FORM })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  interface ReceiptModal {
    projectId: number
    projectName: string
    defaultAmount: number
    defaultAccount: string
    incomeType: string
  }
  const [receiptModal, setReceiptModal]   = useState<ReceiptModal | null>(null)
  const [receiptAmount, setReceiptAmount] = useState('')
  const [receiptAccount, setReceiptAccount] = useState('')
  const [receiptDate, setReceiptDate]     = useState(new Date().toISOString().split('T')[0])
  const [receiptNote, setReceiptNote]     = useState('')
  const [receiptSaving, setReceiptSaving] = useState(false)
  const [receiptError, setReceiptError]   = useState('')

  const openReceiptModal = (p: Project) => {
    const isOneTime = p.income_type === 'one_time'
    const defaultAmt = isOneTime
      ? (p.remaining_amount ?? Math.max(0, p.amount - (Number(p.advance_amount) || 0)))
      : p.amount
    setReceiptModal({
      projectId: p.id,
      projectName: p.name,
      defaultAmount: defaultAmt,
      defaultAccount: p.default_account ? String(p.default_account) : '',
      incomeType: p.income_type,
    })
    setReceiptAmount(String(defaultAmt))
    setReceiptAccount(p.default_account ? String(p.default_account) : '')
    setReceiptDate(new Date().toISOString().split('T')[0])
    setReceiptNote('')
    setReceiptError('')
  }

  const submitReceipt = async (ev: React.FormEvent) => {
    ev.preventDefault(); if (!receiptModal) return
    if (!receiptAccount) { setReceiptError('Please select an account.'); return }
    setReceiptSaving(true); setReceiptError('')
    const isOneTime = receiptModal.incomeType === 'one_time'
    try {
      await transactionsApi.create({
        type: 'income',
        amount: parseFloat(receiptAmount),
        date: receiptDate,
        account: parseInt(receiptAccount),
        linked_project: receiptModal.projectId,
        category: isOneTime ? 'One-time Income' : 'Monthly Income',
        notes: receiptNote || (isOneTime
          ? `One-time payment: ${receiptModal.projectName}`
          : `Money in: ${receiptModal.projectName}`),
      })
      setReceiptModal(null); load()
    } catch (err: any) {
      setReceiptError(apiErrorMessage(err, 'Failed to record.'))
    } finally { setReceiptSaving(false) }
  }

  const load = () => {
    setLoading(true)
    Promise.all([
      projectsApi.list().then(r => setProjects(asList(r.data))),
      accountsApi.list().then(r => setAccounts(asList(r.data))),
    ]).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openAdd = () => {
    setEditing(null); setForm({ ...EMPTY_FORM }); setError(''); setShowModal(true)
  }
  const openEdit = (p: Project) => {
    setEditing(p)
    setForm({
      name: p.name,
      income_type: p.income_type,
      amount: String(p.amount),
      installment_amount: p.installment_amount ? String(p.installment_amount) : '',
      advance_amount: p.advance_amount ? String(p.advance_amount) : '',
      status: p.status,
      start_date: p.start_date,
      default_account: p.default_account ? String(p.default_account) : '',
      notes: p.notes,
    })
    setError(''); setShowModal(true)
  }

  const set = (k: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [k]: e.target.value }))

  const totalAmt = parseFloat(form.amount) || 0
  const advanceAmt = parseFloat(form.advance_amount) || 0
  const remainingPreview = Math.max(0, totalAmt - advanceAmt)

  const formMonths =
    form.income_type === 'one_time_installments' &&
    remainingPreview > 0 &&
    parseFloat(form.installment_amount) > 0
      ? Math.ceil(remainingPreview / parseFloat(form.installment_amount))
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.income_type === 'one_time_installments' && !form.installment_amount) {
      setError('Please enter how much you get each time.')
      return
    }
    if (advanceAmt > totalAmt) {
      setError('Advance cannot be more than the total amount.')
      return
    }
    if (editing) {
      const ok = await confirm({
        title: 'Save changes?',
        message: `Update income source “${form.name || editing.name}”?`,
        confirmLabel: 'Save',
      })
      if (!ok) return
    }
    setSaving(true); setError('')
    const payload: any = {
      name: form.name,
      income_type: form.income_type,
      amount: totalAmt,
      installment_amount: form.installment_amount ? parseFloat(form.installment_amount) : null,
      advance_amount: ['one_time', 'one_time_installments'].includes(form.income_type) ? advanceAmt : 0,
      status: form.status,
      start_date: form.start_date,
      default_account: form.default_account ? parseInt(form.default_account) : null,
      notes: form.notes,
    }
    try {
      if (editing) await projectsApi.update(editing.id, payload)
      else await projectsApi.create(payload)
      setShowModal(false); load()
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to save.'))
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: 'Remove income?',
      message: 'Remove this income source? Past transactions stay in your accounts.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    await projectsApi.remove(id); load()
  }

  // Paid-in-parts (one_time_installments) is money owed to you — it lives in
  // Bills → "Money owed to you", so keep it out of the Income lists.
  const visibleProjects   = projects.filter(p => p.income_type !== 'one_time_installments')
  const activeProjects    = visibleProjects.filter(p => p.status === 'active')
  const inactiveProjects  = visibleProjects.filter(p => p.status !== 'active')
  const showAdvance = form.income_type === 'one_time' || form.income_type === 'one_time_installments'

  return (
    <div className="page">
      {confirmDialog}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Income</h1>
          <p className="page-subtitle">Where your money comes from — salary, clients, deals, and more.</p>
        </div>
        <button className="btn-primary" onClick={openAdd} data-tour="income-add">+ Add Income</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="glass empty-state">
          <div className="empty-icon"><Coins size={36} strokeWidth={1.5} /></div>
          <p>No income sources yet.</p>
          <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={openAdd}>
            Add your first income
          </button>
        </div>
      ) : (
        <>
          {activeProjects.length > 0 && (
            <div style={{ marginBottom: '1.1rem' }}>
              <h3 style={{ marginBottom: '0.65rem' }}>Active</h3>
              <div className="list">
                {activeProjects.map(p => (
                  <ProjectCard key={p.id} p={p} onEdit={openEdit} onDelete={handleDelete} onRecordReceipt={openReceiptModal} />
                ))}
              </div>
            </div>
          )}
          {inactiveProjects.length > 0 && (
            <div>
              <h3 style={{ marginBottom: '0.65rem', color: 'var(--text-muted)' }}>
                Paused / Done
              </h3>
              <div className="list">
                {inactiveProjects.map(p => (
                  <ProjectCard key={p.id} p={p} onEdit={openEdit} onDelete={handleDelete} onRecordReceipt={openReceiptModal} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {receiptModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReceiptModal(null)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{receiptModal.incomeType === 'one_time' ? 'Record payment' : 'Record money received'}</h2>
              <button className="modal-close" onClick={() => setReceiptModal(null)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.85rem' }}>
              {receiptModal.projectName}
              {receiptModal.incomeType === 'one_time' && (
                <> — recording the remaining amount marks this income as done.</>
              )}
            </p>
            {receiptError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{receiptError}</div>}
            <form onSubmit={submitReceipt} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input type="number" min="0" step="any" value={receiptAmount} onChange={e => setReceiptAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} required />
                </div>
              </div>
              <div className="form-group">
                <label>Account</label>
                <select value={receiptAccount} onChange={e => setReceiptAccount(e.target.value)} required>
                  <option value="">Select account…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <input value={receiptNote} onChange={e => setReceiptNote(e.target.value)} placeholder="Optional note" />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.75rem' }} disabled={receiptSaving}>
                {receiptSaving ? <span className="spinner" /> : 'Save'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{editing ? 'Edit income' : 'Add income'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
            </div>

            {error && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text" placeholder="e.g. Client A, Day job, Shop sales"
                  value={form.name} onChange={set('name')} required
                />
              </div>

              <div className="form-group">
                <label>How do you get paid?</label>
                <select value={form.income_type} onChange={set('income_type')}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {TYPE_HINTS[form.income_type]}
                </span>
              </div>

              {form.income_type === 'one_time_installments' ? (
                <div className="grid-2">
                  <div className="form-group">
                    <label>Total amount (PKR)</label>
                    <input type="number" min="0" step="any" placeholder="e.g. 30,000" value={form.amount} onChange={set('amount')} required />
                  </div>
                  <div className="form-group">
                    <label>Each payment (PKR)</label>
                    <input type="number" min="1" step="any" placeholder="e.g. 5,000" value={form.installment_amount} onChange={set('installment_amount')} required />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label>
                    {form.income_type.includes('monthly') ? 'Amount each month (PKR)' : 'Total amount (PKR)'}
                  </label>
                  <input type="number" min="0" step="any" placeholder="0.00" value={form.amount} onChange={set('amount')} required />
                </div>
              )}

              {showAdvance && (
                <div className="form-group">
                  <label>Advance already received (PKR)</label>
                  <input type="number" min="0" step="any" placeholder="0" value={form.advance_amount} onChange={set('advance_amount')} />
                  <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    Subtracted from the total so remaining is what is still due.
                  </span>
                  {totalAmt > 0 && (
                    <div style={{
                      marginTop: '0.5rem', background: 'var(--green-50)', border: '1px solid var(--border-2)',
                      borderRadius: 'var(--radius-sm)', padding: '0.55rem 0.75rem', fontSize: '0.85rem',
                    }}>
                      Remaining: <strong style={{ color: 'var(--primary)' }}>{fmt(remainingPreview)}</strong>
                      {advanceAmt > 0 && <span className="text-muted"> ({fmt(totalAmt)} − {fmt(advanceAmt)})</span>}
                    </div>
                  )}
                </div>
              )}

              {formMonths !== null && (
                <div style={{
                  background: 'var(--green-50)', border: '1px solid var(--border-2)',
                  borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.85rem',
                  fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600,
                }}>
                  About <strong>{formMonths} month{formMonths !== 1 ? 's' : ''}</strong> to finish
                  {' '}({fmt(remainingPreview)} left ÷ {fmt(parseFloat(form.installment_amount))}/payment)
                </div>
              )}

              <div className="grid-2">
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={set('status')}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Done</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Start date</label>
                  <input type="date" value={form.start_date} onChange={set('start_date')} required />
                </div>
              </div>

              <div className="form-group">
                <label>Default account (optional)</label>
                <select value={form.default_account} onChange={set('default_account')}>
                  <option value="">None</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea rows={2} placeholder="Anything helpful…" value={form.notes} onChange={set('notes')} />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.75rem' }} disabled={saving}>
                {saving ? <span className="spinner" /> : editing ? 'Save changes' : 'Save income'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const MONTHLY_TYPES = ['recurring_monthly', 'contract_monthly']

function ProjectCard({
  p, onEdit, onDelete, onRecordReceipt,
}: {
  p: Project
  onEdit: (p: Project) => void
  onDelete: (id: number) => void
  onRecordReceipt: (p: Project) => void
}) {
  const isInstallment = p.income_type === 'one_time_installments'
  const isOneTime = p.income_type === 'one_time'
  const received = p.installments_received ?? 0
  const total = p.months_to_complete ?? 0
  const progress = total > 0 ? (received / total) * 100 : 0
  const remaining = total - received
  const advance = Number(p.advance_amount) || 0
  const remainingAmt = p.remaining_amount ?? Math.max(0, p.amount - advance)
  const amtReceived = received * (p.installment_amount ?? 0) + advance
  const amtRemaining = Math.max(0, p.amount - amtReceived)

  return (
    <div className="glass glass-hover" style={{ padding: '0.95rem 1rem', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.4rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.97rem' }}>{p.name}</span>
            <span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}`}>{p.status}</span>
            <span className="badge badge-blue" style={{ fontSize: '0.62rem' }}>{TYPE_LABELS[p.income_type]}</span>
          </div>
          {p.default_account_name && (
            <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>→ {p.default_account_name}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {isInstallment && p.installment_amount ? (
            <>
              <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--success)' }}>
                {fmt(p.installment_amount)}<span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--text-muted)' }}>/payment</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fmt(remainingAmt)} left</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--success)' }}>
                {fmt(isOneTime ? remainingAmt : p.amount)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {p.income_type.includes('monthly') ? 'each month' : advance > 0 ? `${fmt(advance)} advance` : 'total'}
              </div>
            </>
          )}
        </div>
      </div>

      {(isOneTime || isInstallment) && advance > 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
          Total {fmt(p.amount)} − advance {fmt(advance)} = <strong>{fmt(remainingAmt)}</strong> remaining
        </div>
      )}

      {isInstallment && p.installment_amount && total > 0 && (
        <div style={{
          background: 'var(--green-50)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 0.75rem', marginTop: '0.5rem', marginBottom: '0.5rem',
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(remainingAmt)}</span>
            {' '}left ÷{' '}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(p.installment_amount)}</span>
            {' '}≈{' '}
            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{total} payment{total !== 1 ? 's' : ''}</span>
          </div>
          <div className="progress-bar" style={{ marginBottom: '0.4rem', height: '7px' }}>
            <div className="progress-bar-fill" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--success)' }}>{received}</strong> of <strong>{total}</strong> payments received
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {remaining > 0
                ? <><strong style={{ color: 'var(--primary)' }}>{remaining}</strong> left · {fmt(amtRemaining)}</>
                : <span style={{ color: 'var(--success)', fontWeight: 600 }}>Fully received</span>}
            </span>
          </div>
        </div>
      )}

      {p.notes && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontStyle: 'italic' }}>{p.notes}</p>
      )}

      <div className="divider" style={{ margin: '0.5rem 0' }} />

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {p.status === 'active' && MONTHLY_TYPES.includes(p.income_type) && (
          p.received_this_month ? (
            <button className="btn-glass" disabled style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem', opacity: 0.65, cursor: 'not-allowed', color: 'var(--success)' }}>
              Received this month
            </button>
          ) : (
            <button className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem' }} onClick={() => onRecordReceipt(p)}>
              Got paid
            </button>
          )
        )}
        {p.status === 'active' && isOneTime && remainingAmt > 0 && (
          <button className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem' }} onClick={() => onRecordReceipt(p)}>
            Record payment
          </button>
        )}
        {p.status === 'completed' && isOneTime && (
          <button className="btn-glass" disabled style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem', opacity: 0.65, cursor: 'not-allowed', color: 'var(--success)' }}>
            Paid — done
          </button>
        )}
        <button className="btn-glass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }} onClick={() => onEdit(p)}>Edit</button>
        <button className="btn-glass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', color: 'var(--red-600)', borderColor: '#f5c4c0' }} onClick={() => onDelete(p.id)}>Delete</button>
      </div>
    </div>
  )
}
