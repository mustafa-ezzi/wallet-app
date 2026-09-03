import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Landmark,
  Trash2,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { accountsApi, peopleApi, transactionsApi, asList, apiErrorMessage } from '../api/client'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/categories'
import { CountUp } from '../components/motion/CountUp'
import { Reveal } from '../components/motion/Reveal'
import { fmt, fmtBalance, toMoney } from '../utils/format'
import { useConfirm } from '../hooks/useConfirm'
import { track } from '../lib/analytics'
import { useOffline } from '../offline'
import InvitePersonModal from '../people/InvitePersonModal'
import type { PeopleInvitation, PeopleLink, PeopleProposal } from '../people/types'

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

const EMPTY_ACCOUNT = { name: '', type: 'bank', opening_balance: '0' }

const EMPTY_TX_FORM = {
  type: 'income', amount: '', date: new Date().toISOString().split('T')[0],
  category: '', notes: '',
}

export default function Accounts() {
  const navigate = useNavigate()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { getCachedAccounts, getCachedTransactions } = useOffline()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading]   = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [incomingInvites, setIncomingInvites] = useState<PeopleInvitation[]>([])
  const [outgoingInvites, setOutgoingInvites] = useState<PeopleInvitation[]>([])
  const [incomingProposals, setIncomingProposals] = useState<PeopleProposal[]>([])
  const [links, setLinks] = useState<PeopleLink[]>([])
  const [inviteBusyId, setInviteBusyId] = useState<number | null>(null)
  const [proposalBusyId, setProposalBusyId] = useState<number | null>(null)
  const [acceptWalletId, setAcceptWalletId] = useState('')

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

  const loadAccounts = useCallback(() => {
    setLoading(true)
    setAccError('')
    accountsApi.list()
      .then(async (r) => {
        const list = asList<Account>(r.data)
        setAccounts(list)
        const walletList = list.filter((a) => a.type === 'bank' || a.type === 'cash')
        if (walletList[0]) {
          setAcceptWalletId((prev) =>
            prev && walletList.some((w) => String(w.id) === prev) ? prev : String(walletList[0].id),
          )
        }
        try {
          const [invRes, linkRes, propRes] = await Promise.all([
            peopleApi.pendingInvites(),
            peopleApi.links(),
            peopleApi.pendingProposals(),
          ])
          const inv = invRes.data as { incoming?: PeopleInvitation[]; outgoing?: PeopleInvitation[] }
          setIncomingInvites(inv?.incoming || [])
          setOutgoingInvites(inv?.outgoing || [])
          setLinks(asList<PeopleLink>(linkRes.data))
          const pending = propRes.data as { incoming?: PeopleProposal[] }
          setIncomingProposals(pending?.incoming || [])
        } catch {
          setIncomingInvites([])
          setOutgoingInvites([])
          setLinks([])
          setIncomingProposals([])
        }
      })
      .catch(async (err) => {
        const cached = await getCachedAccounts()
        if (cached.length) {
          setAccounts(cached.map(a => ({
            id: a.serverId,
            name: a.name,
            type: a.type,
            opening_balance: a.openingBalance,
            current_balance: a.currentBalance,
          })))
          setAccError('')
        } else {
          setAccounts([])
          setAccError(apiErrorMessage(err, 'Could not load accounts.'))
        }
        setIncomingInvites([])
        setOutgoingInvites([])
        setLinks([])
        setIncomingProposals([])
      })
      .finally(() => setLoading(false))
  }, [getCachedAccounts])

  const reloadTxs = async (acc: Account) => {
    setTxLoading(true)
    try {
      const r = await transactionsApi.list({ account: acc.id })
      setTxs(asList(r.data))
      const ar = await accountsApi.list()
      const fresh = asList<Account>(ar.data).find((a) => a.id === acc.id)
      if (fresh) setSelectedAccount(fresh)
    } catch {
      const cached = await getCachedTransactions()
      const name = acc.name
      setTxs(cached.filter(t => t.accountServerId === acc.id).map(t => ({
        id: t.serverId ?? 0,
        type: t.type,
        amount: t.amount,
        date: t.date,
        account: acc.id,
        account_name: name,
        category: t.syncStatus !== 'synced' ? `${t.category || ''} · pending`.trim() : t.category,
        notes: t.notes,
        project_name: null,
      })))
    } finally {
      setTxLoading(false)
    }
  }

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const linkedPersonIds = useMemo(() => {
    const ids = new Set<number>()
    for (const link of links) {
      if (link.my_person?.id) ids.add(link.my_person.id)
    }
    return ids
  }, [links])

  const respondInvite = async (id: number, action: 'accept' | 'decline') => {
    setInviteBusyId(id)
    setAccError('')
    try {
      if (action === 'accept') await peopleApi.acceptInvite(id)
      else await peopleApi.declineInvite(id)
      loadAccounts()
    } catch (err) {
      setAccError(apiErrorMessage(err, 'Could not update invitation.'))
    } finally {
      setInviteBusyId(null)
    }
  }

  const respondProposal = async (id: number, action: 'accept' | 'decline') => {
    setProposalBusyId(id)
    setAccError('')
    try {
      if (action === 'accept') {
        if (!acceptWalletId) {
          setAccError('Pick a wallet to accept into.')
          return
        }
        await peopleApi.acceptProposal(id, { wallet_id: Number(acceptWalletId) })
      } else {
        await peopleApi.declineProposal(id)
      }
      loadAccounts()
    } catch (err) {
      setAccError(apiErrorMessage(err, 'Could not update money request.'))
    } finally {
      setProposalBusyId(null)
    }
  }
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
    e.preventDefault()
    if (editingAcc) {
      const ok = await confirm({
        title: 'Save wallet?',
        message: `Update wallet “${accForm.name || editingAcc.name}”?`,
        confirmLabel: 'Save',
      })
      if (!ok) return
    }
    setAccSaving(true); setAccError('')
    const payload = { ...accForm, opening_balance: parseFloat(accForm.opening_balance) }
    try {
      if (editingAcc) await accountsApi.update(editingAcc.id, payload)
      else {
        await accountsApi.create(payload)
        track('wallet_created', { account_type: payload.type })
      }
      setShowAccModal(false); loadAccounts()
    } catch (err: any) {
      setAccError(apiErrorMessage(err, 'Failed to save.'))
    } finally { setAccSaving(false) }
  }

  const deletePerson = async (acc: Account) => {
    const bal = toMoney(acc.current_balance)
    const unsettled = Math.abs(bal) >= 0.01
    const status =
      bal > 0 ? `They still owe you ${fmtBalance(bal)}` : `You still owe them ${fmtBalance(Math.abs(bal))}`
    const ok = await confirm({
      title: unsettled ? 'Not settled — delete anyway?' : 'Delete person?',
      message: unsettled
        ? `${status}. Deleting “${acc.name}” also removes their lend/borrow entries from your wallets. This cannot be undone.`
        : `Remove “${acc.name}” from People? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await peopleApi.remove(acc.id)
      await loadAccounts()
    } catch (err) {
      setAccError(apiErrorMessage(err, 'Could not delete person.'))
    }
  }

  const deleteAcc = async (id: number) => {
    const ok = await confirm({
      title: 'Delete wallet?',
      message: 'Delete this wallet? All its transactions will also be deleted.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
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
    const ok = await confirm({
      title: 'Save transaction?',
      message: `Update this ${txForm.type} of ${fmt(parseFloat(txForm.amount) || editingTx.amount)}?`,
      confirmLabel: 'Save',
    })
    if (!ok) return
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
    const ok = await confirm({
      title: 'Delete transaction?',
      message: `Delete this ${tx.type} of ${fmt(tx.amount)}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await transactionsApi.remove(tx.id)
    if (selectedAccount) await reloadTxs(selectedAccount)
  }

  // ── derived ──────────────────────────────────────────────────────────

  const wallets = accounts.filter(a => a.type === 'bank' || a.type === 'cash')
  const totalBalance = wallets.reduce((s, a) => s + toMoney(a.current_balance), 0)
  const banks = accounts.filter(a => a.type === 'bank')
  const cash  = accounts.filter(a => a.type === 'cash')
  const people = accounts.filter(a => a.type === 'person')
  const maxAbsBalance = Math.max(
    1,
    ...wallets.map(a => Math.abs(toMoney(a.current_balance))),
    ...people.map(a => Math.abs(toMoney(a.current_balance))),
  )

  const catOptions = txForm.type === 'income'
    ? INCOME_CATEGORIES.map(c => c.key)
    : EXPENSE_CATEGORIES.map(c => c.key)

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      {confirmDialog}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Wallets</h1>
          <p className="page-subtitle">Manage bank, cash, and people balances.</p>
        </div>
        <button className="btn-primary" onClick={openAddAcc}>+ Create Wallet</button>
      </div>

      {/* Combined balance strip */}
      <Reveal index={0}>
        <div className="glass wallet-combined">
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Combined Balance</span>
          <span style={{ fontWeight: 800, fontSize: '1.2rem', color: totalBalance < 0 ? 'var(--danger)' : 'var(--primary)' }}>
            <CountUp value={totalBalance} />
          </span>
        </div>
      </Reveal>

      {!showAccModal && accError && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>{accError}</div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : accounts.length === 0 ? (
        <div className="glass empty-state">
          <div className="empty-icon"><Wallet size={36} strokeWidth={1.5} /></div>
          <p>No wallets yet.</p>
          <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={openAddAcc}>Create your first wallet</button>
        </div>
      ) : (
        <>
          {banks.length > 0 && (
            <div style={{ marginBottom: '1.1rem' }}>
              <div className="wallet-section-head">
                <Landmark size={15} strokeWidth={1.75} /><h3>Bank Wallets</h3>
              </div>
              <div className="list">
                {banks.map((acc, i) => (
                  <Reveal key={acc.id} index={i} stepMs={40}>
                    <AccountCard acc={acc} maxAbs={maxAbsBalance}
                      onEdit={openEditAcc} onDelete={deleteAcc} onView={viewTxs} />
                  </Reveal>
                ))}
              </div>
            </div>
          )}
          {cash.length > 0 && (
            <div>
              <div className="wallet-section-head">
                <Wallet size={15} strokeWidth={1.75} /><h3>Cash &amp; Wallets</h3>
              </div>
              <div className="list">
                {cash.map((acc, i) => (
                  <Reveal key={acc.id} index={banks.length + i} stepMs={40}>
                    <AccountCard acc={acc} maxAbs={maxAbsBalance}
                      onEdit={openEditAcc} onDelete={deleteAcc} onView={viewTxs} />
                  </Reveal>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '1.1rem' }}>
            <div className="wallet-section-head">
              <UserRound size={15} strokeWidth={1.75} />
              <h3>People</h3>
              <button
                type="button"
                className="btn-glass"
                style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
                onClick={() => setInviteOpen(true)}
              >
                + Add
              </button>
            </div>

            {incomingInvites.length > 0 ? (
              <div className="people-invite-box glass">
                <h4>Link requests</h4>
                {incomingInvites.map((inv) => (
                  <div key={inv.id} className="people-invite-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>{inv.from_user_name || inv.from_user_email}</div>
                      <div className="travel-muted" style={{ fontSize: '0.78rem' }}>Wants to link for lend/borrow</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn-glass"
                        style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}
                        disabled={inviteBusyId === inv.id}
                        onClick={() => void respondInvite(inv.id, 'decline')}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem' }}
                        disabled={inviteBusyId === inv.id}
                        onClick={() => void respondInvite(inv.id, 'accept')}
                      >
                        {inviteBusyId === inv.id ? <span className="spinner" /> : 'Accept'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {incomingProposals.length > 0 ? (
              <div className="people-invite-box glass" style={{ marginTop: '0.65rem' }}>
                <h4>Waiting for you</h4>
                <p className="page-subtitle" style={{ margin: '0 0 0.65rem' }}>
                  Accept to post the matching entry — pick your wallet first.
                </p>
                <div className="form-group">
                  <label>Your wallet</label>
                  <select value={acceptWalletId} onChange={(e) => setAcceptWalletId(e.target.value)}>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                {incomingProposals.map((p) => (
                  <div key={p.id} className="people-invite-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>
                        {p.proposer_name || 'Someone'} · {(p.action || '').replace(/^./, (c) => c.toUpperCase())}{' '}
                        {fmtBalance(p.amount)}
                      </div>
                      <div className="travel-muted" style={{ fontSize: '0.78rem' }}>
                        Accept to settle on your side
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn-glass"
                        style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}
                        disabled={proposalBusyId === p.id}
                        onClick={() => void respondProposal(p.id, 'decline')}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem' }}
                        disabled={proposalBusyId === p.id}
                        onClick={() => void respondProposal(p.id, 'accept')}
                      >
                        {proposalBusyId === p.id ? <span className="spinner" /> : 'Accept'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {outgoingInvites.length > 0 ? (
              <div className="people-invite-box glass" style={{ marginTop: '0.65rem' }}>
                <h4>Waiting for them</h4>
                {outgoingInvites.map((inv) => (
                  <div key={inv.id} className="people-invite-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>{inv.display_name || inv.to_user_name || inv.to_user_email}</div>
                      <div className="travel-muted" style={{ fontSize: '0.78rem' }}>Link request pending</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {people.length === 0 && incomingInvites.length === 0 && outgoingInvites.length === 0 ? (
              <div className="glass empty-state" style={{ padding: '1.1rem' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>No people yet</p>
                <p className="page-subtitle" style={{ marginTop: 6 }}>
                  Add a local person or invite a WalletTrails user for lend/borrow.
                </p>
              </div>
            ) : (
              <div className="list" style={{ marginTop: people.length ? '0.65rem' : 0 }}>
                {people.map((acc, i) => {
                  const bal = toMoney(acc.current_balance)
                  const status = Math.abs(bal) < 0.01 ? 'Settled' : bal > 0 ? 'They owe you' : 'You owe them'
                  const isLinked = linkedPersonIds.has(acc.id)
                  return (
                    <Reveal key={acc.id} index={i} stepMs={40}>
                      <div className="glass" style={{ padding: '0.9rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div className="people-avatar"><UserRound size={16} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.95rem' }}>{acc.name}</strong>
                              {isLinked ? <span className="people-linked-badge">Linked</span> : null}
                            </div>
                            <div className="travel-muted" style={{ fontSize: '0.75rem' }}>
                              {isLinked ? 'WalletTrails user' : 'Local'} · {status}
                            </div>
                          </div>
                          <strong style={{ color: bal < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                            {fmtBalance(bal)}
                          </strong>
                        </div>
                        <div className="wallet-card-actions" style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            className="btn-glass"
                            onClick={() => navigate(`/people/${acc.id}`)}
                          >
                            History
                          </button>
                          <button
                            type="button"
                            className="btn-glass"
                            style={{ color: 'var(--red-600)', borderColor: '#f5c4c0' }}
                            onClick={() => void deletePerson(acc)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </Reveal>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      <InvitePersonModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onDone={() => loadAccounts()}
      />

      {/* ── Add / Edit Account modal ── */}
      {showAccModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAccModal(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{editingAcc ? 'Edit Wallet' : 'Create Wallet'}</h2>
              <button className="modal-close" onClick={() => setShowAccModal(false)} aria-label="Close">
                <X size={18} strokeWidth={2} />
              </button>
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
                {accSaving ? <span className="spinner" /> : editingAcc ? 'Save Changes' : 'Create Wallet'}
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
              <button className="modal-close" onClick={() => setSelectedAccount(null)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
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
              <div className="empty-state"><div className="empty-icon"><FileText size={36} strokeWidth={1.5} /></div><p>No transactions yet.</p></div>
            ) : (
              <div className="list">
                {txs.map((tx) => (
                  <div key={tx.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem',
                    padding: '0.65rem 0.1rem', borderBottom: '1px solid var(--border-2)',
                  }}>
                    {/* Icon */}
                    <div className={`tx-icon ${tx.type === 'income' ? 'tx-icon-income' : 'tx-icon-expense'}`}
                      style={{ width: '1.8rem', height: '1.8rem', flexShrink: 0 }}>
                      {tx.type === 'income'
                        ? <ArrowUpRight size={13} strokeWidth={2.25} />
                        : <ArrowDownRight size={13} strokeWidth={2.25} />}
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
                        aria-label="Delete transaction"
                      >
                        <Trash2 size={13} strokeWidth={2} />
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
              <button className="modal-close" onClick={() => setEditingTx(null)} aria-label="Close"><X size={18} strokeWidth={2} /></button>
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
                  <ArrowUpRight size={14} strokeWidth={2.25} /> Income
                </button>
                <button type="button"
                  className={txForm.type === 'expense' ? 'active-expense' : ''}
                  onClick={() => setTxForm(f => ({ ...f, type: 'expense', category: '' }))}>
                  <ArrowDownRight size={14} strokeWidth={2.25} /> Expense
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

function AccountCard({ acc, maxAbs, onEdit, onDelete, onView }: {
  acc: Account; maxAbs: number
  onEdit:   (a: Account) => void
  onDelete: (id: number) => void
  onView:   (a: Account) => void
}) {
  const bal = toMoney(acc.current_balance)
  const prog = Math.max(bal > 0 ? 3 : 0, Math.min(100, Math.round((Math.abs(bal) / maxAbs) * 100)))
  const isCash = acc.type === 'cash'
  return (
    <div className="glass glass-hover" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className={`account-icon ${isCash ? 'account-icon-cash' : 'account-icon-bank'}`}
            style={{ width: '2.5rem', height: '2.5rem' }}>
            {isCash
              ? <Wallet size={18} strokeWidth={1.75} />
              : <Landmark size={18} strokeWidth={1.75} />}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{acc.name}</div>
            <div className="text-muted" style={{ fontSize: '0.72rem' }}>Opening: {fmt(acc.opening_balance)}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: '1.15rem', color: bal >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>
            {fmtBalance(bal)}
          </div>
          <div className="text-muted" style={{ fontSize: '0.7rem' }}>
            {isCash ? 'Cash / Wallet' : 'Bank Account'}
          </div>
        </div>
      </div>

      <div className="progress-bar" style={{ marginBottom: '0.7rem' }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${prog}%`,
            background: isCash
              ? 'linear-gradient(90deg, var(--success), #34d399)'
              : undefined,
          }}
        />
      </div>

      <div className="wallet-card-actions">
        <button type="button" className="btn-glass" onClick={() => onView(acc)}>Transactions</button>
        <button type="button" className="btn-glass" onClick={() => onEdit(acc)}>Edit</button>
        <button
          type="button"
          className="btn-glass"
          style={{ color: 'var(--red-600)', borderColor: '#f5c4c0' }}
          onClick={() => onDelete(acc.id)}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
