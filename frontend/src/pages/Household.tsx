import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, Home, Users, X } from 'lucide-react'
import { householdsApi, accountsApi, asList, apiErrorMessage } from '../api/client'
import { fmt, fmtBalance } from '../utils/format'
import { useConfirm } from '../hooks/useConfirm'
import HouseholdReportPanel from '../components/HouseholdReportPanel'

interface Household {
  id: number
  name: string
  currency: string
  my_role: string | null
  member_count: number
  ledger_count: number
}

interface PendingInvite {
  id: number
  household_id: number
  household_name: string
  invited_by_name: string
  member_count: number
}

interface InviteInfo {
  code: string
  expires_at: string
  join_path: string
  is_valid: boolean
}

interface Ledger {
  id: number
  name: string
  kind: string
  status: string
  total_spent: number
  month_spent: number
  closed_total_expense: number | null
  closed_at: string | null
  closed_by_name: string | null
  end_date: string | null
}

interface LedgerSummary {
  total_spent: number
  expense_count: number
  by_member: { name: string; amount: number }[]
  by_category: { name: string; amount: number }[]
}

interface Expense {
  id: number
  amount: number
  date: string
  category: string
  notes: string
  paid_by_name: string
  account_name: string | null
  linked_transaction: number | null
}

export default function HouseholdPage() {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const [households, setHouseholds] = useState<Household[]>([])
  const [pending, setPending] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [activeLedger, setActiveLedger] = useState<Ledger | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expenseTotal, setExpenseTotal] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [contribOpen, setContribOpen] = useState(false)
  const [name, setName] = useState('')
  const [ledgerForm, setLedgerForm] = useState({ name: '', kind: 'ongoing', start_date: new Date().toISOString().slice(0, 10) })
  const [joinCode, setJoinCode] = useState('')
  const [preview, setPreview] = useState<{ household_name: string; member_count: number; code: string } | null>(null)
  const [emailInvite, setEmailInvite] = useState('')
  const [expForm, setExpForm] = useState({ amount: '', category: '', date: new Date().toISOString().slice(0, 10), notes: '', linked_account: '' })
  const [contribForm, setContribForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '', linked_account: '' })
  const [saving, setSaving] = useState(false)
  const [myAccounts, setMyAccounts] = useState<{ id: number; name: string; current_balance: number }[]>([])
  const [summary, setSummary] = useState<LedgerSummary | null>(null)
  const [viewMode, setViewMode] = useState<'feed' | 'report'>('feed')
  const [reportRefresh, setReportRefresh] = useState(0)
  const [contributions, setContributions] = useState<{
    id: number; amount: number; date: string; notes: string
    contributed_by_name: string; account_name: string | null
  }[]>([])
  const [contribTotal, setContribTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [hRes, pRes, aRes] = await Promise.all([
        householdsApi.list(),
        householdsApi.pendingInvites(),
        accountsApi.list(),
      ])
      setHouseholds(asList(hRes.data))
      setPending(asList(pRes.data))
      setMyAccounts(asList(aRes.data))
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load households.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Deep link ?code=
  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      setJoinCode(code.toUpperCase())
      setJoinOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const openHousehold = async (id: number) => {
    setSelectedId(id)
    setError('')
    try {
      const [lRes, iRes] = await Promise.all([
        householdsApi.ledgers(id),
        householdsApi.getInvite(id).catch(() => ({ data: null })),
      ])
      const list = asList<Ledger>(lRes.data)
      setLedgers(list)
      setInvite(iRes.data && iRes.data.code ? iRes.data : null)
      const first = list.find(l => l.status === 'open') || list[0] || null
      setActiveLedger(first)
      if (first) await loadExpenses(first)
      else { setExpenses([]); setExpenseTotal(0); setSummary(null) }
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const loadExpenses = async (ledger: Ledger) => {
    const params: Record<string, number> = {}
    // Ongoing open ledgers: month filter. Events / closed: full history.
    if (ledger.kind === 'ongoing' && ledger.status === 'open') {
      const now = new Date()
      params.year = now.getFullYear()
      params.month = now.getMonth() + 1
    }
    const res = await householdsApi.ledgerExpenses(ledger.id, params)
    setExpenses(res.data?.results ?? [])
    setExpenseTotal(Number(res.data?.total) || 0)
    try {
      const cRes = await householdsApi.ledgerContributions(ledger.id)
      setContributions(cRes.data?.results ?? [])
      setContribTotal(Number(cRes.data?.total) || 0)
    } catch {
      setContributions([])
      setContribTotal(0)
    }
    if (ledger.status === 'closed' || ledger.kind === 'event') {
      try {
        const s = await householdsApi.ledgerSummary(ledger.id)
        setSummary(s.data)
      } catch {
        setSummary(null)
      }
    } else {
      setSummary(null)
    }
  }

  const createHousehold = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await householdsApi.create({ name: name.trim() })
      setCreateOpen(false); setName('')
      await load()
      if (res.data?.id) openHousehold(res.data.id)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create household.'))
    } finally { setSaving(false) }
  }

  const runPreview = async () => {
    setSaving(true); setError(''); setPreview(null)
    try {
      const res = await householdsApi.joinPreview({ code: joinCode.trim().toUpperCase() })
      setPreview(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid or expired code.'))
    } finally { setSaving(false) }
  }

  const acceptJoin = async () => {
    if (!preview) return
    setSaving(true); setError('')
    try {
      const res = await householdsApi.join({ code: preview.code })
      setJoinOpen(false); setPreview(null); setJoinCode('')
      await load()
      if (res.data?.id) openHousehold(res.data.id)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not join.'))
    } finally { setSaving(false) }
  }

  const acceptPending = async (id: number) => {
    try {
      const res = await householdsApi.acceptInvite(id)
      await load()
      if (res.data?.id) openHousehold(res.data.id)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const declinePending = async (id: number) => {
    const ok = await confirm({ title: 'Decline invite?', message: 'You can be invited again later.', confirmLabel: 'Decline', danger: true })
    if (!ok) return
    await householdsApi.declineInvite(id)
    load()
  }

  const regenInvite = async () => {
    if (!selectedId) return
    const res = await householdsApi.regenerateInvite(selectedId)
    setInvite(res.data)
  }

  const sendEmailInvite = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!selectedId) return
    setSaving(true); setError('')
    try {
      await householdsApi.inviteByEmail(selectedId, emailInvite.trim())
      setEmailInvite('')
      setError('')
      await confirm({ title: 'Invite sent', message: 'If they already have CashTrail they’ll see a pending invite. Otherwise the invite is held until they register with that email.', confirmLabel: 'OK' })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally { setSaving(false) }
  }

  const addExpense = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!activeLedger) return
    setSaving(true); setError('')
    try {
      await householdsApi.addExpense(activeLedger.id, {
        amount: parseFloat(expForm.amount),
        category: expForm.category,
        date: expForm.date,
        notes: expForm.notes,
        ...(expForm.linked_account ? { linked_account: parseInt(expForm.linked_account) } : {}),
      })
      setExpenseOpen(false)
      setExpForm({ amount: '', category: '', date: new Date().toISOString().slice(0, 10), notes: '', linked_account: '' })
      await loadExpenses(activeLedger)
      setReportRefresh(k => k + 1)
      if (selectedId) {
        const lRes = await householdsApi.ledgers(selectedId)
        const list = asList<Ledger>(lRes.data)
        setLedgers(list)
        const updated = list.find(l => l.id === activeLedger.id)
        if (updated) setActiveLedger(updated)
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not add expense.'))
    } finally { setSaving(false) }
  }

  const addContribution = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!activeLedger) return
    setSaving(true); setError('')
    try {
      await householdsApi.addContribution(activeLedger.id, {
        amount: parseFloat(contribForm.amount),
        date: contribForm.date,
        notes: contribForm.notes,
        ...(contribForm.linked_account ? { linked_account: parseInt(contribForm.linked_account) } : {}),
      })
      setContribOpen(false)
      setContribForm({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '', linked_account: '' })
      await loadExpenses(activeLedger)
      setReportRefresh(k => k + 1)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not add contribution.'))
    } finally { setSaving(false) }
  }

  const createLedger = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!selectedId) return
    setSaving(true); setError('')
    try {
      const res = await householdsApi.createLedger(selectedId, {
        name: ledgerForm.name.trim(),
        kind: ledgerForm.kind,
        start_date: ledgerForm.start_date,
      })
      setLedgerOpen(false)
      setLedgerForm({ name: '', kind: 'ongoing', start_date: new Date().toISOString().slice(0, 10) })
      const lRes = await householdsApi.ledgers(selectedId)
      const list = asList<Ledger>(lRes.data)
      setLedgers(list)
      if (res.data?.id) {
        const created = list.find(l => l.id === res.data.id) || res.data
        setActiveLedger(created)
        await loadExpenses(created)
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create ledger.'))
    } finally { setSaving(false) }
  }

  const closeLedger = async () => {
    if (!activeLedger || !selectedId) return
    const total = activeLedger.total_spent
    const ok = await confirm({
      title: 'Close & lock ledger?',
      message: `Close “${activeLedger.name}”? Total spent: ${fmt(total)}. No new expenses can be added until an owner reopens it.`,
      confirmLabel: 'Close & lock',
      danger: true,
    })
    if (!ok) return
    setSaving(true); setError('')
    try {
      const res = await householdsApi.closeLedger(activeLedger.id)
      const updated = res.data?.ledger ?? res.data
      const lRes = await householdsApi.ledgers(selectedId)
      setLedgers(asList(lRes.data))
      setActiveLedger(updated)
      await loadExpenses(updated)
      setReportRefresh(k => k + 1)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not close ledger.'))
    } finally { setSaving(false) }
  }

  const reopenLedger = async () => {
    if (!activeLedger || !selectedId) return
    const ok = await confirm({
      title: 'Reopen ledger?',
      message: `Reopen “${activeLedger.name}” so members can add expenses again?`,
      confirmLabel: 'Reopen',
    })
    if (!ok) return
    setSaving(true); setError('')
    try {
      const res = await householdsApi.reopenLedger(activeLedger.id)
      const lRes = await householdsApi.ledgers(selectedId)
      setLedgers(asList(lRes.data))
      setActiveLedger(res.data)
      await loadExpenses(res.data)
      setReportRefresh(k => k + 1)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not reopen.'))
    } finally { setSaving(false) }
  }

  const copyCode = async () => {
    if (!invite?.code) return
    try { await navigator.clipboard.writeText(invite.code) } catch { /* ignore */ }
  }

  const selected = households.find(h => h.id === selectedId) || null
  const now = new Date()
  const monthLabel = now.toLocaleString('en', { month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
      </div>
    )
  }

  return (
    <div className="page">
      {confirmDialog}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Household</h1>
          <p className="page-subtitle">Shared expense books with family or friends — personal wallets stay private.</p>
        </div>
        {!selected && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn-glass" onClick={() => { setJoinOpen(true); setPreview(null); setError('') }}>Join with code</button>
            <button className="btn-primary" onClick={() => { setCreateOpen(true); setError('') }}>+ Create</button>
          </div>
        )}
        {selected && (
          <button className="btn-glass" onClick={() => { setSelectedId(null); setActiveLedger(null) }}>← All households</button>
        )}
      </div>

      {error && <div className="auth-error" style={{ marginBottom: '0.85rem' }}>{error}</div>}

      {/* Pending invites */}
      {!selected && pending.length > 0 && (
        <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ marginBottom: '0.65rem' }}>Pending invitations</h3>
          <div className="list">
            {pending.map(p => (
              <div key={p.id} className="list-item" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 700 }}>{p.household_name}</div>
                  <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                    From {p.invited_by_name || 'a member'} · {p.member_count} member{p.member_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <button className="btn-glass" style={{ fontSize: '0.75rem' }} onClick={() => declinePending(p.id)}>Decline</button>
                <button className="btn-primary" style={{ fontSize: '0.75rem' }} onClick={() => acceptPending(p.id)}>Accept</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hub list */}
      {!selected && (
        households.length === 0 ? (
          <div className="glass empty-state">
            <div className="empty-icon"><Home size={36} strokeWidth={1.5} /></div>
            <p>No households yet. Create one or join with an invite code.</p>
            <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setCreateOpen(true)}>Create household</button>
          </div>
        ) : (
          <div className="list">
            {households.map(h => (
              <button
                key={h.id}
                className="list-item glass-hover"
                style={{ width: '100%', textAlign: 'left', border: 'none', background: 'var(--surface)', cursor: 'pointer' }}
                onClick={() => openHousehold(h.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="account-icon account-icon-bank"><Users size={16} strokeWidth={1.75} /></div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{h.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                      {h.member_count} member{h.member_count !== 1 ? 's' : ''} · {h.ledger_count} ledger{h.ledger_count !== 1 ? 's' : ''} · {h.my_role}
                    </div>
                  </div>
                </div>
                <span className="section-link">Open →</span>
              </button>
            ))}
          </div>
        )
      )}

      {/* Detail */}
      {selected && (
        <>
          <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{selected.name}</h2>
                <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                  {selected.member_count} members · your role: {selected.my_role}
                </p>
              </div>
              {(selected.my_role === 'owner' || selected.my_role === 'admin') && (
                <button className="btn-primary" style={{ fontSize: '0.82rem' }} onClick={() => { setInviteOpen(true); if (!invite) regenInvite() }}>
                  Invite
                </button>
              )}
            </div>
          </div>

          {ledgers.length === 0 && (
            <div className="glass empty-state" style={{ marginBottom: '1rem' }}>
              <p>No ledgers yet. Create a monthly book or an event (trip, wedding).</p>
              {(selected.my_role === 'owner' || selected.my_role === 'admin') && (
                <button className="btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => setLedgerOpen(true)}>
                  + Create ledger
                </button>
              )}
            </div>
          )}

          {ledgers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
              <div className="rpt-chips" style={{ flex: 1, marginBottom: 0 }}>
                {ledgers.map(l => (
                  <button
                    key={l.id}
                    className={`rpt-chip ${activeLedger?.id === l.id ? 'active' : ''}`}
                    onClick={async () => { setActiveLedger(l); await loadExpenses(l) }}
                  >
                    {l.name}
                    <span style={{ marginLeft: '0.35rem', opacity: 0.75, fontSize: '0.68rem' }}>
                      {l.kind === 'event' ? 'Event' : 'Monthly'}
                      {l.status === 'closed' ? ' · Closed' : ''}
                    </span>
                  </button>
                ))}
              </div>
              {(selected.my_role === 'owner' || selected.my_role === 'admin') && (
                <button
                  className="btn-glass"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => { setLedgerOpen(true); setError('') }}
                >
                  + Ledger
                </button>
              )}
            </div>
          )}

          {activeLedger && (
            <>
              <div className="rpt-chips" style={{ marginBottom: '0.85rem' }}>
                <button
                  type="button"
                  className={`rpt-chip ${viewMode === 'feed' ? 'active' : ''}`}
                  onClick={() => setViewMode('feed')}
                >
                  Expenses
                </button>
                <button
                  type="button"
                  className={`rpt-chip ${viewMode === 'report' ? 'active' : ''}`}
                  onClick={() => setViewMode('report')}
                >
                  Report
                </button>
              </div>

              {viewMode === 'report' ? (
                <HouseholdReportPanel
                  ledger={activeLedger}
                  householdName={selected.name}
                  refreshKey={reportRefresh}
                />
              ) : (
            <>
              <div className="grid-2" style={{ marginBottom: '1rem' }}>
                <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
                  <div className="stat-label">
                    {activeLedger.status === 'closed' || activeLedger.kind === 'event'
                      ? 'Total spent'
                      : monthLabel}
                  </div>
                  <div className="stat-value amt-negative">
                    {fmt(
                      activeLedger.status === 'closed' && activeLedger.closed_total_expense != null
                        ? activeLedger.closed_total_expense
                        : expenseTotal,
                    )}
                  </div>
                  <div className="stat-sub">
                    {activeLedger.status === 'closed'
                      ? 'locked total'
                      : activeLedger.kind === 'event'
                        ? 'event so far'
                        : 'shared this month'}
                  </div>
                </div>
                <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
                  <div className="stat-label">Status</div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                    <span className={`badge ${activeLedger.kind === 'event' ? 'badge-blue' : 'badge-green'}`}>
                      {activeLedger.kind === 'event' ? 'Event' : 'Monthly'}
                    </span>
                    <span className={`badge ${activeLedger.status === 'closed' ? 'badge-red' : 'badge-green'}`}>
                      {activeLedger.status === 'closed' ? 'Closed' : 'Open'}
                    </span>
                  </div>
                  <div className="stat-sub" style={{ marginTop: '0.5rem' }}>
                    {activeLedger.status === 'closed' && activeLedger.closed_at
                      ? `Closed ${new Date(activeLedger.closed_at).toLocaleDateString()}${activeLedger.closed_by_name ? ` by ${activeLedger.closed_by_name}` : ''}`
                      : `All-time ${fmt(activeLedger.total_spent)}`}
                  </div>
                </div>
              </div>

              {summary && (activeLedger.status === 'closed' || activeLedger.kind === 'event') && (
                <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.95rem' }}>
                    {activeLedger.status === 'closed' ? 'Final summary' : 'Summary'}
                  </h3>
                  <div className="grid-2" style={{ gap: '0.85rem' }}>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>By member</div>
                      {summary.by_member.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>No expenses yet</p>
                      ) : (
                        summary.by_member.map(m => (
                          <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            <span>{m.name}</span>
                            <span className="amt-negative" style={{ fontWeight: 700 }}>{fmt(m.amount)}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>By category</div>
                      {summary.by_category.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>No expenses yet</p>
                      ) : (
                        summary.by_category.map(c => (
                          <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            <span>{c.name}</span>
                            <span className="amt-negative" style={{ fontWeight: 700 }}>{fmt(c.amount)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Expenses</h3>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {activeLedger.status === 'open' && (
                    <button className="btn-primary" style={{ fontSize: '0.82rem' }} onClick={() => setExpenseOpen(true)}>+ Add</button>
                  )}
                  {activeLedger.status === 'open' && (
                    <button className="btn-glass" style={{ fontSize: '0.82rem' }} onClick={() => { setContribOpen(true); setError('') }}>
                      Contribute to pot
                    </button>
                  )}
                  {(selected.my_role === 'owner' || selected.my_role === 'admin') && activeLedger.status === 'open' && (
                    <button className="btn-glass" style={{ fontSize: '0.82rem' }} disabled={saving} onClick={closeLedger}>
                      Close & lock
                    </button>
                  )}
                  {(selected.my_role === 'owner' || selected.my_role === 'admin') && activeLedger.status === 'closed' && (
                    <button className="btn-glass" style={{ fontSize: '0.82rem' }} disabled={saving} onClick={reopenLedger}>
                      Reopen
                    </button>
                  )}
                </div>
              </div>

              {activeLedger.status === 'closed' && (
                <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.65rem' }}>
                  This ledger is locked. History stays visible; new expenses are blocked until an owner reopens it.
                </p>
              )}

              {contributions.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Pot contributions</h3>
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>Total {fmt(contribTotal)}</span>
                  </div>
                  <div className="list">
                    {contributions.map(c => (
                      <div key={c.id} className="list-item glass" style={{ borderRadius: 'var(--radius-md)' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>Pot contribution</span>
                            {c.account_name && (
                              <span className="badge badge-blue" style={{ fontSize: '0.62rem' }}>
                                From {c.account_name}
                              </span>
                            )}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                            {c.date} · {c.contributed_by_name}
                            {c.notes ? ` · ${c.notes}` : ''}
                          </div>
                        </div>
                        <div className="amt-positive" style={{ fontWeight: 800 }}>+{fmt(c.amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {expenses.length === 0 ? (
                <div className="glass empty-state">
                  <p>
                    {activeLedger.kind === 'ongoing' && activeLedger.status === 'open'
                      ? 'No shared expenses this month yet.'
                      : 'No shared expenses yet.'}
                  </p>
                </div>
              ) : (
                <div className="list">
                  {expenses.map(e => (
                    <div key={e.id} className="list-item glass" style={{ borderRadius: 'var(--radius-md)' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600 }}>{e.category || 'Expense'}</span>
                          {e.account_name && (
                            <span className="badge badge-blue" style={{ fontSize: '0.62rem' }}>
                              Paid from {e.account_name}
                            </span>
                          )}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>{e.date} · paid by {e.paid_by_name}</div>
                      </div>
                      <div className="amt-negative" style={{ fontWeight: 800 }}>{fmt(e.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
              )}
            </>
          )}
        </>
      )}

      {/* Create modal */}
      {createOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCreateOpen(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>Create household</h2>
              <button className="modal-close" onClick={() => setCreateOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <form onSubmit={createHousehold} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Khan Family" required />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : 'Create'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Join modal — preview + accept */}
      {joinOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setJoinOpen(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>Join with code</h2>
              <button className="modal-close" onClick={() => setJoinOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            {!preview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="form-group">
                  <label>Invite code</label>
                  <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="HOME-XXXXXX" required />
                </div>
                <button type="button" className="btn-primary" disabled={saving || !joinCode.trim()} onClick={runPreview}>
                  {saving ? <span className="spinner" /> : 'Preview'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="glass" style={{ padding: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>You’re joining</div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{preview.household_name}</div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {preview.member_count} member{preview.member_count !== 1 ? 's' : ''} · private wallets stay private
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-glass" style={{ flex: 1 }} onClick={() => setPreview(null)}>Back</button>
                  <button className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={acceptJoin}>
                    {saving ? <span className="spinner" /> : 'Accept'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite modal */}
      {inviteOpen && selectedId && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setInviteOpen(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>Invite members</h2>
              <button className="modal-close" onClick={() => setInviteOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            {invite && (
              <div className="glass" style={{ padding: '0.85rem', marginBottom: '1rem', borderRadius: 'var(--radius-sm)' }}>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Share this code (expires in 7 days)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                  <code style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.04em' }}>{invite.code}</code>
                  <button className="btn-glass" style={{ padding: '0.35rem 0.55rem' }} onClick={copyCode} aria-label="Copy"><Copy size={14} /></button>
                </div>
                <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.35rem' }}>
                  Expires {new Date(invite.expires_at).toLocaleString()}
                </div>
                <button className="btn-glass" style={{ marginTop: '0.65rem', fontSize: '0.78rem' }} onClick={regenInvite}>Regenerate code</button>
              </div>
            )}
            <form onSubmit={sendEmailInvite} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Or invite by email</label>
                <input type="email" value={emailInvite} onChange={e => setEmailInvite(e.target.value)} placeholder="family@email.com" required />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : 'Send invite'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Create ledger — Monthly vs Event */}
      {ledgerOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setLedgerOpen(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>New ledger</h2>
              <button className="modal-close" onClick={() => setLedgerOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <form onSubmit={createLedger} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Name</label>
                <input
                  value={ledgerForm.name}
                  onChange={e => setLedgerForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={ledgerForm.kind === 'event' ? 'e.g. Balochistan trip' : 'e.g. Home expenses'}
                  required
                />
              </div>
              <div className="form-group">
                <label>Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={ledgerForm.kind === 'ongoing' ? 'btn-primary' : 'btn-glass'}
                    style={{ flex: 1, fontSize: '0.85rem' }}
                    onClick={() => setLedgerForm(f => ({ ...f, kind: 'ongoing' }))}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={ledgerForm.kind === 'event' ? 'btn-primary' : 'btn-glass'}
                    style={{ flex: 1, fontSize: '0.85rem' }}
                    onClick={() => setLedgerForm(f => ({ ...f, kind: 'event' }))}
                  >
                    Event
                  </button>
                </div>
                <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
                  {ledgerForm.kind === 'event'
                    ? 'Trip, wedding, Eid — close when done to lock the total.'
                    : 'Ongoing shared book with a monthly view.'}
                </p>
              </div>
              <div className="form-group">
                <label>Start date</label>
                <input
                  type="date"
                  value={ledgerForm.start_date}
                  onChange={e => setLedgerForm(f => ({ ...f, start_date: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : 'Create ledger'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add expense */}
      {expenseOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setExpenseOpen(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>Add shared expense</h2>
              <button className="modal-close" onClick={() => setExpenseOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.85rem' }}>
              Optionally link to your wallet so your balance drops. The line still shows on the household book for all members.
            </p>
            <form onSubmit={addExpense} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input type="number" min="0" step="any" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label>Link to bank (recommended)</label>
                <select value={expForm.linked_account} onChange={e => setExpForm(f => ({ ...f, linked_account: e.target.value }))}>
                  <option value="">Shared book only — wallet unchanged</option>
                  {myAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} — {fmtBalance(a.current_balance)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Category</label>
                <input value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))} placeholder="Groceries, Utilities…" />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={expForm.notes} onChange={e => setExpForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : 'Add expense'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Contribute to pot */}
      {contribOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setContribOpen(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>Contribute to pot</h2>
              <button className="modal-close" onClick={() => setContribOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.85rem' }}>
              Puts money toward the shared pot. Counts as your credit on Split equal. Link a wallet to drop your balance.
            </p>
            <form onSubmit={addContribution} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label>Amount (PKR)</label>
                  <input type="number" min="0" step="any" value={contribForm.amount} onChange={e => setContribForm(f => ({ ...f, amount: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={contribForm.date} onChange={e => setContribForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label>Link to bank (recommended)</label>
                <select value={contribForm.linked_account} onChange={e => setContribForm(f => ({ ...f, linked_account: e.target.value }))}>
                  <option value="">Pot credit only — wallet unchanged</option>
                  {myAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} — {fmtBalance(a.current_balance)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={contribForm.notes} onChange={e => setContribForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : 'Add contribution'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
