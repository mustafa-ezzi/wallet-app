import { useState, useEffect } from 'react'
import {
  ArrowDown,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  X,
} from 'lucide-react'
import { accountsApi, projectsApi, transactionsApi, receivablesApi, payablesApi, asList } from '../api/client'
import { fmtBalance } from '../utils/format'

interface Props {
  onClose: () => void
  onAdded: () => void
}

const EXPENSE_CATEGORIES = [
  'Utilities', 'Server Charges', 'Rent', 'Food', 'Transport',
  'Salary', 'Loan Repayment', 'Miscellaneous',
]

type TxType = 'income' | 'expense' | 'transfer'

export default function AddTransactionModal({ onClose, onAdded }: Props) {
  const [type, setType] = useState<TxType>('income')

  // shared fields
  const [amount, setAmount]   = useState('')
  const [date, setDate]       = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // income / expense
  const [accountId, setAccountId]       = useState('')
  const [projectId, setProjectId]       = useState('')
  const [receivableId, setReceivableId] = useState('')
  const [payableId, setPayableId]       = useState('')
  const [category, setCategory]         = useState('')

  // transfer-specific
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId]     = useState('')

  const [accounts, setAccounts]     = useState<any[]>([])
  const [projects, setProjects]     = useState<any[]>([])
  const [receivables, setReceivables] = useState<any[]>([])
  const [payables, setPayables]     = useState<any[]>([])

  useEffect(() => {
    accountsApi.list().then(r => setAccounts(asList(r.data)))
    projectsApi.list({ status: 'active' }).then(r => setProjects(asList(r.data)))
    receivablesApi.list().then(r => setReceivables(asList(r.data).filter((x: any) => x.status === 'ongoing')))
    payablesApi.list().then(r => setPayables(asList(r.data).filter((x: any) => x.status === 'ongoing')))
  }, [])

  const switchType = (t: TxType) => {
    setType(t); setError('')
    setProjectId(''); setReceivableId(''); setPayableId(''); setCategory('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!amount || parseFloat(amount) <= 0) { setError('Please enter a valid amount.'); return }

    if (type === 'transfer') {
      if (!fromAccountId || !toAccountId) { setError('Please select both accounts.'); return }
      if (fromAccountId === toAccountId)  { setError('Source and destination accounts must be different.'); return }

      const fromAcc = accounts.find(a => String(a.id) === fromAccountId)
      const toAcc   = accounts.find(a => String(a.id) === toAccountId)
      const label   = notes || `Transfer: ${fromAcc?.name ?? ''} → ${toAcc?.name ?? ''}`

      setLoading(true)
      try {
        // Debit the source account
        await transactionsApi.create({
          type: 'expense',
          amount: parseFloat(amount),
          date,
          account: parseInt(fromAccountId),
          category: 'Bank Transfer',
          notes: `${label} (out)`,
        })
        // Credit the destination account
        await transactionsApi.create({
          type: 'income',
          amount: parseFloat(amount),
          date,
          account: parseInt(toAccountId),
          category: 'Bank Transfer',
          notes: `${label} (in)`,
        })
        onAdded()
      } catch (err: any) {
        setError(err.response?.data?.detail ?? 'Transfer failed. Please try again.')
      } finally {
        setLoading(false)
      }
      return
    }

    // income / expense
    if (!accountId) { setError('Please select an account.'); return }

    if (type === 'expense' && payableId) {
      const pay = payables.find((p: any) => String(p.id) === payableId)
      if (pay?.paid_this_month) {
        setError('This loan payment is already recorded this month.')
        return
      }
    }
    if (type === 'income' && receivableId) {
      const rec = receivables.find((r: any) => String(r.id) === receivableId)
      if (rec?.received_this_month) {
        setError('This receivable already has a receipt recorded this month.')
        return
      }
    }

    setLoading(true)
    try {
      await transactionsApi.create({
        type,
        amount: parseFloat(amount),
        date,
        account: parseInt(accountId),
        linked_project:    projectId    ? parseInt(projectId)    : null,
        linked_receivable: receivableId ? parseInt(receivableId) : null,
        linked_payable:    payableId    ? parseInt(payableId)    : null,
        category,
        notes,
      })
      onAdded()
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <h2>Add Transaction</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* ── Type toggle ── */}
        <div className="type-toggle" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className={type === 'income' ? 'active-income' : ''}
            onClick={() => switchType('income')}
          >
            <ArrowUpRight size={14} strokeWidth={2.25} /> Income
          </button>
          <button
            type="button"
            className={type === 'expense' ? 'active-expense' : ''}
            onClick={() => switchType('expense')}
          >
            <ArrowDownRight size={14} strokeWidth={2.25} /> Expense
          </button>
          <button
            type="button"
            className={type === 'transfer' ? 'active-transfer' : ''}
            onClick={() => switchType('transfer')}
          >
            <ArrowLeftRight size={14} strokeWidth={2.25} /> Transfer
          </button>
        </div>

        {error && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* ── Transfer form ── */}
          {type === 'transfer' && (
            <>
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 'var(--radius-sm)',
                padding: '0.6rem 0.85rem',
                fontSize: '0.82rem',
                color: '#2563eb',
              }}>
                Moves money between your accounts. Both balances update automatically.
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input
                    type="number" min="0" step="any" placeholder="0.00"
                    value={amount} onChange={e => setAmount(e.target.value)} required
                  />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
                </div>
              </div>

              <div className="form-group">
                <label>From Account</label>
                <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} required>
                  <option value="">Select source account…</option>
                  {accounts.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name} — {fmtBalance(a.current_balance)}</option>
                  ))}
                </select>
              </div>

              {/* Arrow visual */}
              <div style={{ display: 'flex', justifyContent: 'center', color: '#2563eb', margin: '-0.3rem 0' }}>
                <ArrowDown size={20} strokeWidth={2} />
              </div>

              <div className="form-group">
                <label>To Account</label>
                <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} required>
                  <option value="">Select destination account…</option>
                  {accounts.filter(a => String(a.id) !== fromAccountId).map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name} — {fmtBalance(a.current_balance)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Meezan to SadaPay — July"
                  value={notes} onChange={e => setNotes(e.target.value)}
                />
              </div>

              <button
                type="submit"
                style={{
                  marginTop: '0.25rem', width: '100%', padding: '0.75rem',
                  background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                }}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : <><ArrowLeftRight size={15} strokeWidth={2} /> Record Transfer</>}
              </button>
            </>
          )}

          {/* ── Income / Expense form ── */}
          {type !== 'transfer' && (
            <>
              <div className="grid-2">
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input
                    type="number" min="0" step="any" placeholder="0.00"
                    value={amount} onChange={e => setAmount(e.target.value)} required
                  />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
                </div>
              </div>

              <div className="form-group">
                <label>Account</label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} required>
                  <option value="">Select account…</option>
                  {accounts.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name} — {fmtBalance(a.current_balance)}</option>
                  ))}
                </select>
              </div>

              {type === 'income' && (
                <>
                  <div className="form-group">
                    <label>Link to income (optional)</label>
                    <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                      <option value="">None</option>
                      {projects.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Link to Receivable Installment (optional)</label>
                    <select value={receivableId} onChange={e => setReceivableId(e.target.value)}>
                      <option value="">None</option>
                      {receivables.map((r: any) => (
                        <option key={r.id} value={r.id} disabled={r.received_this_month}>
                          {r.project_name} — {r.installments_received}/{r.total_installments} received
                          {r.received_this_month ? ' (already received this month)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {receivableId && receivables.find((r: any) => String(r.id) === receivableId)?.received_this_month && (
                    <div className="auth-error">This receivable already has a receipt recorded this month.</div>
                  )}
                </>
              )}

              {type === 'expense' && (
                <>
                  <div className="form-group">
                    <label>Category</label>
                    <select value={category} onChange={e => setCategory(e.target.value)}>
                      <option value="">Select category…</option>
                      {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Link to Payable Installment (optional)</label>
                    <select value={payableId} onChange={e => setPayableId(e.target.value)}>
                      <option value="">None</option>
                      {payables.map((p: any) => (
                        <option key={p.id} value={p.id} disabled={p.paid_this_month}>
                          {p.name} — {p.installments_paid}/{p.total_installments} paid
                          {p.paid_this_month ? ' (already paid this month)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {payableId && payables.find((p: any) => String(p.id) === payableId)?.paid_this_month && (
                    <div className="auth-error">This loan payment is already recorded this month.</div>
                  )}
                </>
              )}

              <div className="form-group">
                <label>Notes (optional)</label>
                <input type="text" placeholder="Any notes…" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ marginTop: '0.25rem', width: '100%', padding: '0.75rem' }}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : `Add ${type === 'income' ? 'Income' : 'Expense'}`}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
