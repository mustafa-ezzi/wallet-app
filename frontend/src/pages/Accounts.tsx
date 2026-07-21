import { useEffect, useState } from 'react'
import { accountsApi, transactionsApi, asList } from '../api/client'
import { fmt, fmtBalance } from '../utils/format'

interface Account {
  id: number; name: string; type: string
  opening_balance: number; current_balance: number
}

interface Tx {
  id: number; type: string; amount: number; date: string
  account: number; account_name: string
  category: string; notes: string
  project_name: string | null
}

const EXPENSE_CATS = ['Utilities','Server Charges','Rent','Food','Transport','Salary','Loan Repayment','Bank Transfer','Miscellaneous']
const INCOME_CATS  = ['Monthly Income','Installment Receipt','Bank Transfer','Salary','Freelance','Other']

const EMPTY_ACCOUNT = { name: '', type: 'bank', opening_balance: '0' }

const EMPTY_TX_FORM = {
  type: 'income', amount: '', date: new Date().toISOString().split('T')[0],
  category: '', notes: '',
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading]   = useState(true)

  // account modal
  const [showAccModal, setShowAccModal] = useState(false)
  const [editingAcc, setEditingAcc]     = useState<Account | null>(null)
  const [accForm, setAccForm]           = useState({ ...EMPTY_ACCOUNT })
  const [accSaving, setAccSaving]       = useState(false)
  const [accError, setAccError]         = useState('')

  // transaction list panel
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [txs, setTxs]         = useState<Tx[]>([])
  const [txLoading, setTxLoading] = useState(false)

  // transaction edit modal
  const [editingTx, setEditingTx]   = useState<Tx | null>(null)
  const [txForm, setTxForm]         = useState({ ...EMPTY_TX_FORM })
  const [txSaving, setTxSaving]     = useState(false)
  const [txError, setTxError]       = useState('')

  // ── loaders ──────────────────────────────────────────────────────────

  const loadAccounts = () => {
    setLoading(true)
    accountsApi.list()
      .then(r => setAccounts(asList(r.data)))
      .finally(() => setLoading(false))
  }

  const reloadTxs = async (acc: Account) => {
    setTxLoading(true)
    const r = await transactionsApi.list({ account: acc.id })
    setTxs(asList(r.data))
    setTxLoading(false)
    // Refresh balance shown in header
    const ar = await accountsApi.list()
    const fresh = asList<Account>(ar.data).find((a) => a.id === acc.id)
    if (fresh) setSelectedAccount(fresh)
  }

  useEffect(loadAccounts, [])

  // ── account CRUD ─────────────────────────────────────────────────────

  const openAddAcc = () => {
    setEditingAcc(null); setAccForm({ ...EMPTY_ACCOUNT }); setAccError(''); setShowAccModal(true)
  }
  const openEditAcc = (a: Account) => {
    setEditingAcc(a)
    setAccForm({ name: a.name, type: a.type, opening_balance: String(a.opening_balance) })
    setAccError(''); setShowAccModal(true)
  }
  const setA = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setAccForm(f => ({ ...f, [k]: e.target.value }))

  const submitAcc = async (e: React.FormEvent) => {
    e.preventDefault(); setAccSaving(true); setAccError('')
    const payload = { ...accForm, opening_balance: parseFloat(accForm.opening_balance) }
    try {
      if (editingAcc) await accountsApi.update(editingAcc.id, payload)
      else await accountsApi.create(payload)
      setShowAccModal(false); loadAccounts()
    } catch (err: any) {
      setAccError(Object.values(err.response?.data ?? {}).flat().join(' ') || 'Failed to save.')
    } finally { setAccSaving(false) }
  }

  const deleteAcc = async (id: number) => {
    if (!confirm('Delete this account? All its transactions will also be deleted.')) return
    await accountsApi.remove(id)
    if (selectedAccount?.id === id) setSelectedAccount(null)
    loadAccounts()
  }

  const viewTxs = async (acc: Account) => {
    setSelectedAccount(acc); setTxLoading(true)
    const r = await transactionsApi.list({ account: acc.id })
    setTxs(asList(r.data)); setTxLoading(false)
  }

  // ── transaction CRUD ─────────────────────────────────────────────────

  const openEditTx = (tx: Tx) => {
    setEditingTx(tx)
    setTxForm({ type: tx.type, amount: String(tx.amount), date: tx.date, category: tx.category || '', notes: tx.notes || '' })
    setTxError('')
  }

  const setT = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setTxForm(f => ({ ...f, [k]: e.target.value }))

  const submitTx = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editingTx || !selectedAccount) return
    setTxSaving(true); setTxError('')
    try {
      await transactionsApi.update(editingTx.id, {
        type:     txForm.type,
        amount:   parseFloat(txForm.amount),
        date:     txForm.date,
        category: txForm.category,
        notes:    txForm.notes,
        account:  selectedAccount.id,
      })
      setEditingTx(null); await reloadTxs(selectedAccount)
    } catch (err: any) {
      setTxError(Object.values(err.response?.data ?? {}).flat().join(' ') || 'Failed to save.')
    } finally { setTxSaving(false) }
  }

  const deleteTx = async (tx: Tx) => {
    if (!confirm(`Delete this ${tx.type} transaction of ${fmt(tx.amount)}?`)) return
    await transactionsApi.remove(tx.id)
    if (selectedAccount) await reloadTxs(selectedAccount)
  }

  // ── derived ──────────────────────────────────────────────────────────

  const totalBalance = accounts.reduce((s, a) => s + a.current_balance, 0)
  const banks = accounts.filter(a => a.type === 'bank')
  const cash  = accounts.filter(a => a.type === 'cash')

  const catOptions = txForm.type === 'income' ? INCOME_CATS : EXPENSE_CATS

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Accounts</h1>
          <p className="page-subtitle">Manage your bank and cash accounts.</p>
        </div>
        <button className="btn-primary" onClick={openAddAcc}>+ New Account</button>
      </div>

      {/* Combined balance strip */}
      <div className="glass" style={{ padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Combined Balance</span>
        <span style={{ fontWeight: 800, fontSize: '1.15rem', color: totalBalance < 0 ? 'var(--danger)' : 'var(--primary)' }}>
          {fmtBalance(totalBalance)}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : accounts.length === 0 ? (
        <div className="glass empty-state">
          <div className="empty-icon">🏦</div>
          <p>No accounts yet.</p>
          <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={openAddAcc}>Add your first account</button>
        </div>
      ) : (
        <>
          {banks.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span>🏛</span><h3>Bank Accounts</h3>
              </div>
              <div className="list">
                {banks.map(acc => (
                  <AccountCard key={acc.id} acc={acc} totalBalance={totalBalance}
                    onEdit={openEditAcc} onDelete={deleteAcc} onView={viewTxs} />
                ))}
              </div>
            </div>
          )}
          {cash.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span>💳</span><h3>Cash &amp; Wallets</h3>
              </div>
              <div className="list">
                {cash.map(acc => (
                  <AccountCard key={acc.id} acc={acc} totalBalance={totalBalance}
                    onEdit={openEditAcc} onDelete={deleteAcc} onView={viewTxs} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Add / Edit Account modal ── */}
      {showAccModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAccModal(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{editingAcc ? 'Edit Account' : 'New Account'}</h2>
              <button className="modal-close" onClick={() => setShowAccModal(false)}>✕</button>
            </div>
            {accError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{accError}</div>}
            <form onSubmit={submitAcc} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Account Name</label>
                <input type="text" placeholder="e.g. Meezan Bank, NayaPay, Cash" value={accForm.name} onChange={setA('name')} required />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Type</label>
                  <select value={accForm.type} onChange={setA('type')}>
                    <option value="bank">Bank</option>
                    <option value="cash">Cash / Wallet</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Opening Balance (PKR)</label>
                  <input type="number" min="0" step="any" placeholder="0.00" value={accForm.opening_balance} onChange={setA('opening_balance')} required />
                </div>
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.75rem' }} disabled={accSaving}>
                {accSaving ? <span className="spinner" /> : editingAcc ? 'Save Changes' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Transaction history panel ── */}
      {selectedAccount && !editingTx && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedAccount(null)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{selectedAccount.name}</h2>
              <button className="modal-close" onClick={() => setSelectedAccount(null)}>✕</button>
            </div>

            <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--green-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Current Balance: </span>
              <span style={{ fontWeight: 700, color: selectedAccount.current_balance < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                {fmtBalance(selectedAccount.current_balance)}
              </span>
            </div>

            {txLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="spinner spinner-dark" style={{ width: '1.75rem', height: '1.75rem' }} />
              </div>
            ) : txs.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">📄</div><p>No transactions yet.</p></div>
            ) : (
              <div className="list">
                {txs.map((tx) => (
                  <div key={tx.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem',
                    padding: '0.65rem 0.1rem', borderBottom: '1px solid var(--border-2)',
                  }}>
                    {/* Icon */}
                    <div className={`tx-icon ${tx.type === 'income' ? 'tx-icon-income' : 'tx-icon-expense'}`}
                      style={{ width: '1.8rem', height: '1.8rem', fontSize: '0.75rem', flexShrink: 0 }}>
                      {tx.type === 'income' ? '↑' : '↓'}
                    </div>

                    {/* Label + date */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tx.project_name || tx.category || tx.type}
                      </div>
                      {tx.notes && (
                        <div className="text-muted" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {tx.notes}
                        </div>
                      )}
                      <div className="text-muted" style={{ fontSize: '0.7rem' }}>{tx.date}</div>
                    </div>

                    {/* Amount */}
                    <div style={{ fontWeight: 700, color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)', fontSize: '0.88rem', flexShrink: 0 }}>
                      {tx.type === 'income' ? '+' : '−'} {fmt(tx.amount)}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                      <button
                        className="btn-glass"
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.55rem' }}
                        onClick={() => openEditTx(tx)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-glass"
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: 'var(--red-600)', borderColor: '#f5c4c0' }}
                        onClick={() => deleteTx(tx)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Transaction modal ── */}
      {editingTx && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingTx(null)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>Edit Transaction</h2>
              <button className="modal-close" onClick={() => setEditingTx(null)}>✕</button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.85rem' }}>
              Account: <strong>{selectedAccount?.name}</strong>
            </p>

            {txError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{txError}</div>}

            <form onSubmit={submitTx} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Type toggle */}
              <div className="type-toggle">
                <button type="button"
                  className={txForm.type === 'income' ? 'active-income' : ''}
                  onClick={() => setTxForm(f => ({ ...f, type: 'income', category: '' }))}>
                  ↑ Income
                </button>
                <button type="button"
                  className={txForm.type === 'expense' ? 'active-expense' : ''}
                  onClick={() => setTxForm(f => ({ ...f, type: 'expense', category: '' }))}>
                  ↓ Expense
                </button>
                {/* empty 3rd slot to keep grid consistent */}
                <span />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input type="number" min="0" step="any" value={txForm.amount} onChange={setT('amount')} required />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={txForm.date} onChange={setT('date')} required />
                </div>
              </div>

              <div className="form-group">
                <label>Category</label>
                <select value={txForm.category} onChange={setT('category')}>
                  <option value="">Select category…</option>
                  {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <input type="text" placeholder="Any notes…" value={txForm.notes} onChange={setT('notes')} />
              </div>

              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button type="button" className="btn-glass" style={{ flex: 1, padding: '0.7rem' }}
                  onClick={() => setEditingTx(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 2, padding: '0.7rem' }} disabled={txSaving}>
                  {txSaving ? <span className="spinner" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AccountCard ──────────────────────────────────────────────────────────────

function AccountCard({ acc, totalBalance, onEdit, onDelete, onView }: {
  acc: Account; totalBalance: number
  onEdit:   (a: Account) => void
  onDelete: (id: number) => void
  onView:   (a: Account) => void
}) {
  const prog = totalBalance > 0 ? Math.min(100, (acc.current_balance / totalBalance) * 100) : 0
  return (
    <div className="glass glass-hover" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className={`account-icon ${acc.type === 'cash' ? 'account-icon-cash' : 'account-icon-bank'}`}
            style={{ width: '2.5rem', height: '2.5rem', fontSize: '1.1rem' }}>
            {acc.type === 'cash' ? '💵' : '🏛'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{acc.name}</div>
            <div className="text-muted" style={{ fontSize: '0.72rem' }}>Opening: {fmt(acc.opening_balance)}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: '1.15rem', color: acc.current_balance >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>
            {fmtBalance(acc.current_balance)}
          </div>
          <div className="text-muted" style={{ fontSize: '0.7rem' }}>
            {acc.type === 'bank' ? 'Bank Account' : 'Cash / Wallet'}
          </div>
        </div>
      </div>

      <div className="progress-bar" style={{ marginBottom: '0.7rem' }}>
        <div className="progress-bar-fill" style={{ width: `${prog}%` }} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button className="btn-glass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }} onClick={() => onView(acc)}>
          Transactions
        </button>
        <button className="btn-glass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }} onClick={() => onEdit(acc)}>
          Edit
        </button>
        <button className="btn-glass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', color: 'var(--red-600)', borderColor: '#f5c4c0' }}
          onClick={() => onDelete(acc.id)}>
          Delete
        </button>
      </div>
    </div>
  )
}
