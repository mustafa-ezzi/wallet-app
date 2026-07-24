import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, Home, Pencil, Trash2, Users, X } from 'lucide-react'
import { householdsApi, accountsApi, asList, apiErrorMessage } from '../api/client'
import { fmt, fmtBalance } from '../utils/format'
import { useConfirm } from '../hooks/useConfirm'
import { useAuth } from '../context/AuthContext'
import HouseholdReportPanel from '../components/HouseholdReportPanel'
import InviteQr from '../components/InviteQr'

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

interface MemberRow {
  id: number
  user: number | null
  display_name: string
  email: string
  role: string
  status: string
}

interface HhNotification {
  id: number
  household: number
  household_name: string
  title: string
  body: string
  kind: string
  is_read: boolean
  created_at: string
  actor_name: string
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
  created_by: number
  account_name: string | null
  linked_transaction: number | null
}

export default function HouseholdPage() {
  const { user } = useAuth()
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
  const [membersOpen, setMembersOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
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
    contributed_by_name: string; created_by?: number; account_name: string | null
  }[]>([])
  const [contribTotal, setContribTotal] = useState(0)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [notifications, setNotifications] = useState<HhNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [expenseHasMore, setExpenseHasMore] = useState(false)
  const [expenseOffset, setExpenseOffset] = useState(0)
  const EXPENSE_PAGE = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [hRes, pRes, aRes, nRes, uRes] = await Promise.all([
        householdsApi.list(),
        householdsApi.pendingInvites(),
        accountsApi.list(),
        householdsApi.notifications({ limit: 20 }).catch(() => ({ data: [] })),
        householdsApi.unreadNotificationCount().catch(() => ({ data: { count: 0 } })),
      ])
      setHouseholds(asList(hRes.data))
      setPending(asList(pRes.data))
      setMyAccounts(asList(aRes.data))
      setNotifications(asList(nRes.data))
      setUnreadCount(Number(uRes.data?.count) || 0)
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
      const [lRes, iRes, mRes] = await Promise.all([
        householdsApi.ledgers(id),
        householdsApi.getInvite(id).catch(() => ({ data: null })),
        householdsApi.members(id).catch(() => ({ data: [] })),
      ])
      const list = asList<Ledger>(lRes.data)
      setLedgers(list)
      setInvite(iRes.data && iRes.data.code ? iRes.data : null)
      setMembers(asList(mRes.data))
      const first = list.find(l => l.status === 'open') || list[0] || null
      setActiveLedger(first)
      if (first) await loadExpenses(first, true)
      else { setExpenses([]); setExpenseTotal(0); setSummary(null); setExpenseHasMore(false) }
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const loadExpenses = async (ledger: Ledger, reset = true) => {
    const params: Record<string, number> = {
      limit: EXPENSE_PAGE,
      offset: reset ? 0 : expenseOffset,
    }
    // Ongoing open ledgers: month filter. Events / closed: full history.
    if (ledger.kind === 'ongoing' && ledger.status === 'open') {
      const now = new Date()
      params.year = now.getFullYear()
      params.month = now.getMonth() + 1
    }
    const res = await householdsApi.ledgerExpenses(ledger.id, params)
    const rows = res.data?.results ?? []
    setExpenses(prev => reset ? rows : [...prev, ...rows])
    setExpenseTotal(Number(res.data?.total) || 0)
    const nextOffset = (reset ? 0 : expenseOffset) + rows.length
    setExpenseOffset(nextOffset)
    setExpenseHasMore(Boolean(res.data?.has_more))
    if (reset) {
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
      const payload = {
        amount: parseFloat(expForm.amount),
        category: expForm.category,
        date: expForm.date,
        notes: expForm.notes,
      }
      if (editingExpense) {
        await householdsApi.updateExpense(editingExpense.id, payload)
      } else {
        await householdsApi.addExpense(activeLedger.id, {
          ...payload,
          ...(expForm.linked_account ? { linked_account: parseInt(expForm.linked_account) } : {}),
        })
      }
      setExpenseOpen(false)
      setEditingExpense(null)
      setExpForm({ amount: '', category: '', date: new Date().toISOString().slice(0, 10), notes: '', linked_account: '' })
      await loadExpenses(activeLedger, true)
      setReportRefresh(k => k + 1)
      if (selectedId) {
        const lRes = await householdsApi.ledgers(selectedId)
        const list = asList<Ledger>(lRes.data)
        setLedgers(list)
        const updated = list.find(l => l.id === activeLedger.id)
        if (updated) setActiveLedger(updated)
      }
    } catch (err) {
      setError(apiErrorMessage(err, editingExpense ? 'Could not update expense.' : 'Could not add expense.'))
    } finally { setSaving(false) }
  }

  const openEditExpense = (e: Expense) => {
    setEditingExpense(e)
    setExpForm({
      amount: String(e.amount),
      category: e.category || '',
      date: e.date,
      notes: e.notes || '',
      linked_account: '',
    })
    setExpenseOpen(true)
    setError('')
  }

  const deleteExpense = async (e: Expense) => {
    if (!activeLedger) return
    const ok = await confirm({
      title: 'Delete expense?',
      message: `Remove ${fmt(e.amount)} (${e.category || 'Expense'}) from the shared book?${e.linked_transaction ? ' The linked wallet transaction will also be deleted.' : ''}`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setSaving(true); setError('')
    try {
      await householdsApi.removeExpense(e.id)
      await loadExpenses(activeLedger, true)
      setReportRefresh(k => k + 1)
      if (selectedId) {
        const lRes = await householdsApi.ledgers(selectedId)
        const list = asList<Ledger>(lRes.data)
        setLedgers(list)
        const updated = list.find(l => l.id === activeLedger.id)
        if (updated) setActiveLedger(updated)
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not delete expense.'))
    } finally { setSaving(false) }
  }

  const deleteContribution = async (c: { id: number; amount: number }) => {
    if (!activeLedger) return
    const ok = await confirm({
      title: 'Delete contribution?',
      message: `Remove pot contribution of ${fmt(c.amount)}? If it was linked to a wallet, that transaction is removed too.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setSaving(true); setError('')
    try {
      await householdsApi.removeContribution(c.id)
      await loadExpenses(activeLedger, true)
      setReportRefresh(k => k + 1)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not delete contribution.'))
    } finally { setSaving(false) }
  }

  const canManageLine = (createdBy?: number) => {
    if (activeLedger?.status === 'closed') return false
    if (!user) return false
    if (createdBy === user.id) return true
    return selected?.my_role === 'owner' || selected?.my_role === 'admin'
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

  const inviteUrl = invite
    ? `${window.location.origin}/household?code=${encodeURIComponent(invite.code)}`
    : ''

  const refreshMembers = async () => {
    if (!selectedId) return
    const mRes = await householdsApi.members(selectedId)
    setMembers(asList(mRes.data))
  }

  const leaveHousehold = async () => {
    if (!selectedId || !selected) return
    const ok = await confirm({
      title: 'Leave household?',
      message: selected.my_role === 'owner'
        ? 'You are the only member — leaving will delete this household.'
        : `Leave “${selected.name}”? Shared history stays for others.`,
      confirmLabel: 'Leave',
      danger: true,
    })
    if (!ok) return
    try {
      await householdsApi.leave(selectedId)
      setSelectedId(null)
      setActiveLedger(null)
      await load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not leave.'))
    }
  }

  const removeMember = async (m: MemberRow) => {
    if (!selectedId) return
    const ok = await confirm({
      title: 'Remove member?',
      message: `Remove ${m.display_name} from this household? Their past expenses stay in the history.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    try {
      await householdsApi.removeMember(selectedId, m.id)
      await refreshMembers()
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const setRole = async (m: MemberRow, role: string) => {
    if (!selectedId) return
    const label = role === 'owner' ? 'Transfer ownership' : role === 'admin' ? 'Promote to admin' : 'Demote to member'
    const ok = await confirm({
      title: `${label}?`,
      message: role === 'owner'
        ? `${m.display_name} will become owner. You will become an admin.`
        : `Change ${m.display_name} to ${role}?`,
      confirmLabel: label,
    })
    if (!ok) return
    try {
      await householdsApi.setMemberRole(selectedId, m.id, role)
      await refreshMembers()
      await load()
      if (selectedId) openHousehold(selectedId)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const markNotifRead = async (n: HhNotification) => {
    if (n.is_read) return
    try {
      await householdsApi.markNotificationRead(n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      setUnreadCount(c => Math.max(0, c - 1))
    } catch { /* ignore */ }
  }

  const markAllRead = async () => {
    await householdsApi.markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
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
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn-glass" onClick={() => { setSelectedId(null); setActiveLedger(null) }}>← All households</button>
          </div>
        )}
      </div>

      {error && <div className="auth-error" style={{ marginBottom: '0.85rem' }}>{error}</div>}

      {/* In-app notifications */}
      {!selected && notifications.length > 0 && (
        <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', gap: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>
              Activity
              {unreadCount > 0 && (
                <span className="badge badge-red" style={{ marginLeft: '0.45rem', fontSize: '0.68rem' }}>{unreadCount} new</span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button type="button" className="btn-glass" style={{ fontSize: '0.72rem' }} onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="list">
            {notifications.slice(0, 8).map(n => (
              <button
                key={n.id}
                type="button"
                className="list-item"
                style={{
                  width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
                  opacity: n.is_read ? 0.7 : 1,
                }}
                onClick={() => { markNotifRead(n); openHousehold(n.household) }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: n.is_read ? 500 : 700, fontSize: '0.88rem' }}>{n.title}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {n.household_name}{n.body ? ` · ${n.body}` : ''}
                  </div>
                </div>
                {!n.is_read && <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>New</span>}
              </button>
            ))}
          </div>
        </div>
      )}

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
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button className="btn-glass" style={{ fontSize: '0.82rem' }} onClick={() => setMembersOpen(true)}>
                    Members
                  </button>
                  <button className="btn-primary" style={{ fontSize: '0.82rem' }} onClick={() => { setInviteOpen(true); if (!invite) regenInvite() }}>
                    Invite
                  </button>
                </div>
              )}
              {selected.my_role === 'member' && (
                <button className="btn-glass" style={{ fontSize: '0.82rem' }} onClick={() => setMembersOpen(true)}>
                  Members
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
                    onClick={async () => { setActiveLedger(l); await loadExpenses(l, true) }}
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
                    <button
                      className="btn-primary"
                      style={{ fontSize: '0.82rem' }}
                      onClick={() => {
                        setEditingExpense(null)
                        setExpForm({ amount: '', category: '', date: new Date().toISOString().slice(0, 10), notes: '', linked_account: '' })
                        setExpenseOpen(true)
                      }}
                    >
                      + Add
                    </button>
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
                        <div style={{ flex: 1, minWidth: 0 }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                          <div className="amt-positive" style={{ fontWeight: 800 }}>+{fmt(c.amount)}</div>
                          {canManageLine(c.created_by) && (
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label="Delete contribution"
                              title="Delete"
                              onClick={() => deleteContribution(c)}
                            >
                              <Trash2 size={14} strokeWidth={2} />
                            </button>
                          )}
                        </div>
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
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                        <div className="amt-negative" style={{ fontWeight: 800 }}>{fmt(e.amount)}</div>
                        {canManageLine(e.created_by) && (
                          <>
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label="Edit expense"
                              title="Edit"
                              onClick={() => openEditExpense(e)}
                            >
                              <Pencil size={14} strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label="Delete expense"
                              title="Delete"
                              onClick={() => deleteExpense(e)}
                            >
                              <Trash2 size={14} strokeWidth={2} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {expenseHasMore && activeLedger && (
                <button
                  type="button"
                  className="btn-glass"
                  style={{ width: '100%', marginTop: '0.65rem', fontSize: '0.82rem' }}
                  onClick={() => loadExpenses(activeLedger, false)}
                >
                  Load more
                </button>
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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '0.85rem' }}>
                  <InviteQr value={inviteUrl} size={148} />
                  <p className="text-muted" style={{ fontSize: '0.72rem', textAlign: 'center', margin: 0 }}>
                    Scan to open join preview — only household name & member count are shown before Accept.
                  </p>
                  <button
                    type="button"
                    className="btn-glass"
                    style={{ fontSize: '0.72rem' }}
                    onClick={async () => { try { await navigator.clipboard.writeText(inviteUrl) } catch { /* ignore */ } }}
                  >
                    Copy invite link
                  </button>
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

      {/* Members management */}
      {membersOpen && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setMembersOpen(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>Members</h2>
              <button className="modal-close" onClick={() => setMembersOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="list" style={{ marginBottom: '1rem' }}>
              {members.filter(m => m.status === 'active').map(m => (
                <div key={m.id} className="list-item" style={{ flexWrap: 'wrap', gap: '0.4rem', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontWeight: 700 }}>{m.display_name}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>{m.email}</div>
                    <span className="badge badge-green" style={{ fontSize: '0.62rem', marginTop: '0.25rem' }}>{m.role}</span>
                  </div>
                  {selected.my_role === 'owner' && m.role !== 'owner' && (
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      {m.role === 'member' ? (
                        <button type="button" className="btn-glass" style={{ fontSize: '0.7rem' }} onClick={() => setRole(m, 'admin')}>
                          Make admin
                        </button>
                      ) : (
                        <button type="button" className="btn-glass" style={{ fontSize: '0.7rem' }} onClick={() => setRole(m, 'member')}>
                          Demote
                        </button>
                      )}
                      <button type="button" className="btn-glass" style={{ fontSize: '0.7rem' }} onClick={() => setRole(m, 'owner')}>
                        Make owner
                      </button>
                      <button type="button" className="btn-glass" style={{ fontSize: '0.7rem' }} onClick={() => removeMember(m)}>
                        Remove
                      </button>
                    </div>
                  )}
                  {selected.my_role === 'admin' && m.role === 'member' && (
                    <button type="button" className="btn-glass" style={{ fontSize: '0.7rem' }} onClick={() => removeMember(m)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="btn-glass" style={{ width: '100%', color: 'var(--red-600, #c53030)' }} onClick={leaveHousehold}>
              Leave household
            </button>
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

      {/* Add / edit expense */}
      {expenseOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setExpenseOpen(false), setEditingExpense(null))}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{editingExpense ? 'Edit expense' : 'Add shared expense'}</h2>
              <button className="modal-close" onClick={() => { setExpenseOpen(false); setEditingExpense(null) }} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.85rem' }}>
              {editingExpense
                ? (editingExpense.linked_transaction
                  ? 'Changing the amount also updates the linked wallet transaction.'
                  : 'Update this line on the shared household book.')
                : 'Optionally link to your wallet so your balance drops. The line still shows on the household book for all members.'}
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
              {!editingExpense && (
                <div className="form-group">
                  <label>Link to bank (recommended)</label>
                  <select value={expForm.linked_account} onChange={e => setExpForm(f => ({ ...f, linked_account: e.target.value }))}>
                    <option value="">Shared book only — wallet unchanged</option>
                    {myAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} — {fmtBalance(a.current_balance)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Category</label>
                <input value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))} placeholder="Groceries, Utilities…" />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={expForm.notes} onChange={e => setExpForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : editingExpense ? 'Save changes' : 'Add expense'}
              </button>
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
