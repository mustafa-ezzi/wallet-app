import { useEffect, useState } from 'react'
import { Briefcase, X } from 'lucide-react'
import { projectsApi, accountsApi, transactionsApi, asList } from '../api/client'

interface Project {
  id: number
  name: string
  income_type: string
  amount: number
  installment_amount: number | null
  months_to_complete: number | null
  installments_received: number | null
  received_this_month: boolean
  status: string
  start_date: string
  default_account: number | null
  default_account_name: string | null
  notes: string
}

const TYPE_LABELS: Record<string, string> = {
  recurring_monthly:      'Recurring Monthly',
  contract_monthly:       'Contract Monthly',
  one_time:               'One-Time Payment',
  one_time_installments:  'Installment-Based',
}

const STATUS_BADGE: Record<string, string> = {
  active:    'badge-green',
  paused:    'badge-yellow',
  completed: 'badge-gray',
}

import { fmt } from '../utils/format'

const EMPTY_FORM = {
  name: '', income_type: 'recurring_monthly', amount: '',
  installment_amount: '', status: 'active',
  start_date: new Date().toISOString().split('T')[0],
  default_account: '', notes: '',
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Project | null>(null)
  const [form, setForm]           = useState({ ...EMPTY_FORM })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // ── Record Receipt modal ──
  interface ReceiptModal { projectId: number; projectName: string; defaultAmount: number; defaultAccount: string }
  const [receiptModal, setReceiptModal]   = useState<ReceiptModal | null>(null)
  const [receiptAmount, setReceiptAmount] = useState('')
  const [receiptAccount, setReceiptAccount] = useState('')
  const [receiptDate, setReceiptDate]     = useState(new Date().toISOString().split('T')[0])
  const [receiptNote, setReceiptNote]     = useState('')
  const [receiptSaving, setReceiptSaving] = useState(false)
  const [receiptError, setReceiptError]   = useState('')

  const openReceiptModal = (p: Project) => {
    setReceiptModal({ projectId: p.id, projectName: p.name, defaultAmount: p.amount, defaultAccount: p.default_account ? String(p.default_account) : '' })
    setReceiptAmount(String(p.amount))
    setReceiptAccount(p.default_account ? String(p.default_account) : '')
    setReceiptDate(new Date().toISOString().split('T')[0])
    setReceiptNote('')
    setReceiptError('')
  }

  const submitReceipt = async (ev: React.FormEvent) => {
    ev.preventDefault(); if (!receiptModal) return
    if (!receiptAccount) { setReceiptError('Please select an account.'); return }
    setReceiptSaving(true); setReceiptError('')
    try {
      await transactionsApi.create({
        type: 'income',
        amount: parseFloat(receiptAmount),
        date: receiptDate,
        account: parseInt(receiptAccount),
        linked_project: receiptModal.projectId,
        category: 'Monthly Income',
        notes: receiptNote || `Monthly receipt: ${receiptModal.projectName}`,
      })
      setReceiptModal(null); load()
    } catch (err: any) {
      setReceiptError(Object.values(err.response?.data ?? {}).flat().join(' ') || 'Failed to record.')
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

  // Live calculation for the form preview
  const formMonths =
    form.income_type === 'one_time_installments' &&
    parseFloat(form.amount) > 0 &&
    parseFloat(form.installment_amount) > 0
      ? Math.ceil(parseFloat(form.amount) / parseFloat(form.installment_amount))
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.income_type === 'one_time_installments' && !form.installment_amount) {
      setError('Please enter the monthly installment amount.')
      return
    }
    setSaving(true); setError('')
    const payload: any = {
      name: form.name,
      income_type: form.income_type,
      amount: parseFloat(form.amount),
      installment_amount: form.installment_amount ? parseFloat(form.installment_amount) : null,
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
      setError(Object.values(err.response?.data ?? {}).flat().join(' ') || 'Failed to save.')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this project?')) return
    await projectsApi.remove(id); load()
  }

  const activeProjects    = projects.filter(p => p.status === 'active')
  const inactiveProjects  = projects.filter(p => p.status !== 'active')

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Projects</h1>
          <p className="page-subtitle">Your income sources and contracts.</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Project</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : projects.length === 0 ? (
        <div className="glass empty-state">
          <div className="empty-icon"><Briefcase size={36} strokeWidth={1.5} /></div>
          <p>No projects yet.</p>
          <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={openAdd}>
            Add your first project
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
                Paused / Completed
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

      {/* ── Add / Edit Modal ── */}
      {/* ── Record Receipt Modal ── */}
      {receiptModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReceiptModal(null)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>Record Receipt</h2>
              <button className="modal-close" onClick={() => setReceiptModal(null)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
            </div>
            <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
              Monthly income from: <strong>{receiptModal.projectName}</strong>
            </p>
            {receiptError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{receiptError}</div>}
            <form onSubmit={submitReceipt} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label>Amount Received (PKR)</label>
                  <input
                    type="number" min="0" step="any"
                    value={receiptAmount}
                    onChange={e => setReceiptAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={e => setReceiptDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Deposit to Account</label>
                <select value={receiptAccount} onChange={e => setReceiptAccount(e.target.value)} required>
                  <option value="">Select account…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <input
                  type="text"
                  placeholder={`e.g. ${receiptModal.projectName} — July payment`}
                  value={receiptNote}
                  onChange={e => setReceiptNote(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '0.75rem' }} disabled={receiptSaving}>
                {receiptSaving ? <span className="spinner" /> : '✓ Record Receipt'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{editing ? 'Edit Project' : 'Add Project'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
            </div>

            {error && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Project / Client Name</label>
                <input
                  type="text" placeholder="e.g. ERP – Client A"
                  value={form.name} onChange={set('name')} required
                />
              </div>

              <div className="form-group">
                <label>Income Structure</label>
                <select value={form.income_type} onChange={set('income_type')}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Installment-specific fields */}
              {form.income_type === 'one_time_installments' ? (
                <>
                  <div className="grid-2">
                    <div className="form-group">
                      <label>Total Amount (PKR)</label>
                      <input
                        type="number" min="0" step="any"
                        placeholder="e.g. 30,000"
                        value={form.amount} onChange={set('amount')} required
                      />
                    </div>
                    <div className="form-group">
                      <label>Per Installment (PKR / mo)</label>
                      <input
                        type="number" min="1" step="any"
                        placeholder="e.g. 5,000"
                        value={form.installment_amount} onChange={set('installment_amount')} required
                      />
                    </div>
                  </div>

                  {/* Live calculation preview */}
                  {formMonths !== null && (
                    <div style={{
                      background: 'var(--green-50)', border: '1px solid var(--border-2)',
                      borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.85rem',
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      <span style={{ fontSize: '1.1rem' }}>📅</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                        {fmt(parseFloat(form.amount))} ÷ {fmt(parseFloat(form.installment_amount))}/mo
                        &nbsp;=&nbsp;<strong>{formMonths} month{formMonths !== 1 ? 's' : ''}</strong> to clear
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="form-group">
                  <label>
                    {form.income_type.includes('monthly') ? 'Monthly Amount (PKR)' : 'Total Amount (PKR)'}
                  </label>
                  <input
                    type="number" min="0" step="any" placeholder="0.00"
                    value={form.amount} onChange={set('amount')} required
                  />
                </div>
              )}

              <div className="grid-2">
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={set('status')}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={form.start_date} onChange={set('start_date')} required />
                </div>
              </div>

              <div className="form-group">
                <label>Default Account (optional)</label>
                <select value={form.default_account} onChange={set('default_account')}>
                  <option value="">None</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea
                  rows={2} placeholder="Any notes…"
                  value={form.notes} onChange={set('notes')}
                />
              </div>

              <button
                type="submit" className="btn-primary"
                style={{ width: '100%', padding: '0.75rem' }}
                disabled={saving}
              >
                {saving ? <span className="spinner" /> : editing ? 'Save Changes' : 'Create Project'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Project card ────────────────────────────────────────────────────────────

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
  const received      = p.installments_received ?? 0
  const total         = p.months_to_complete ?? 0
  const progress      = total > 0 ? (received / total) * 100 : 0
  const remaining     = total - received
  const amtReceived   = received * (p.installment_amount ?? 0)
  const amtRemaining  = p.amount - amtReceived

  return (
    <div className="glass glass-hover" style={{ padding: '0.95rem 1rem', borderRadius: 'var(--radius-md)' }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.4rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.97rem' }}>{p.name}</span>
            <span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}`}>{p.status}</span>
            <span className="badge badge-blue" style={{ fontSize: '0.62rem' }}>
              {TYPE_LABELS[p.income_type]}
            </span>
          </div>
          {p.default_account_name && (
            <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
              → {p.default_account_name}
            </div>
          )}
        </div>

        {/* Amount display */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {isInstallment && p.installment_amount ? (
            <>
              <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--success)' }}>
                {fmt(p.installment_amount)}<span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--text-muted)' }}>/mo</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {fmt(p.amount)} total
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--success)' }}>
                {fmt(p.amount)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {p.income_type.includes('monthly') ? '/ month' : 'total'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Installment plan block ── */}
      {isInstallment && p.installment_amount && total > 0 && (
        <div style={{
          background: 'var(--green-50)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 0.75rem',
          marginTop: '0.5rem',
          marginBottom: '0.5rem',
        }}>

          {/* Formula line */}
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(p.amount)}</span>
            {' '}÷{' '}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(p.installment_amount)}/mo</span>
            {' '}={' '}
            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{total} month{total !== 1 ? 's' : ''} to clear</span>
          </div>

          {/* Progress bar */}
          <div className="progress-bar" style={{ marginBottom: '0.4rem', height: '7px' }}>
            <div className="progress-bar-fill" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>

          {/* Progress stats */}
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--success)' }}>{received}</strong> of{' '}
              <strong>{total}</strong> installments received
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {remaining > 0 ? (
                <>
                  <strong style={{ color: 'var(--primary)' }}>{remaining}</strong> remaining
                  {' · '}{fmt(amtRemaining)} still owed
                </>
              ) : (
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Fully received</span>
              )}
            </span>
          </div>
        </div>
      )}

      {p.notes && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontStyle: 'italic' }}>
          {p.notes}
        </p>
      )}

      <div className="divider" style={{ margin: '0.5rem 0' }} />

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {/* Show Record Receipt for active monthly income projects */}
        {p.status === 'active' && MONTHLY_TYPES.includes(p.income_type) && (
          p.received_this_month ? (
            <button
              className="btn-glass"
              disabled
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem', opacity: 0.65, cursor: 'not-allowed', color: 'var(--success)', borderColor: 'rgba(52,211,153,0.35)' }}
              title="Already recorded this month"
            >
              ✓ Received this month
            </button>
          ) : (
            <button
              className="btn-primary"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem' }}
              onClick={() => onRecordReceipt(p)}
            >
              Record Receipt
            </button>
          )
        )}
        <button
          className="btn-glass"
          style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
          onClick={() => onEdit(p)}
        >
          Edit
        </button>
        <button
          className="btn-glass"
          style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', color: 'var(--red-600)', borderColor: '#f5c4c0' }}
          onClick={() => onDelete(p.id)}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
