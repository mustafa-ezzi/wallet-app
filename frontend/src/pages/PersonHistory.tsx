import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Send,
  UserRound,
} from 'lucide-react'
import { accountsApi, apiErrorMessage, asList, peopleApi } from '../api/client'
import { fmtBalance, toMoney } from '../utils/format'
import { formatForeignSubtitle, foreignToPkr, formatRateLine, todayISO } from '../travel/currencies'
import { useTravelMode } from '../travel/TravelModeContext'
import InvitePersonModal from '../people/InvitePersonModal'
import type { PeopleLink, PeopleProposal } from '../people/types'

type PeopleAction = 'lend' | 'borrow' | 'pay' | 'receive'

type HistoryPayload = {
  person: { id: number; name: string; current_balance: number | string }
  year: number
  month: number
  opening_balance: number
  inflow: number
  outflow: number
  closing_balance: number
  pending_net: number
  transactions: Array<{
    id: number
    type: string
    amount: number | string
    date: string
    notes: string
    people_action?: string | null
    original_amount?: number | string | null
    original_currency?: string | null
    fx_rate?: number | string | null
  }>
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const ACTIONS: { key: PeopleAction; label: string; hint: string; color: string }[] = [
  { key: 'lend', label: 'Lend', hint: 'They owe you', color: '#8b5cf6' },
  { key: 'borrow', label: 'Borrow', hint: 'You owe them', color: '#f59e0b' },
  { key: 'pay', label: 'Pay', hint: 'Settle your debt', color: '#ef4444' },
  { key: 'receive', label: 'Receive', hint: 'Collect debt', color: '#22c55e' },
]

function actionMeta(action?: string | null) {
  return ACTIONS.find((a) => a.key === action) ?? {
    key: 'lend' as PeopleAction,
    label: action || 'People',
    hint: '',
    color: '#8b5cf6',
  }
}

export default function PersonHistoryPage() {
  const { id } = useParams()
  const personId = Number(id)
  const navigate = useNavigate()
  const {
    isActive: travelOn,
    currency: travelCurrency,
    rate: travelRate,
    rateLine,
    toPkr,
  } = useTravelMode()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [history, setHistory] = useState<HistoryPayload | null>(null)
  const [wallets, setWallets] = useState<Array<{ id: number; name: string; type: string }>>([])
  const [link, setLink] = useState<PeopleLink | null>(null)
  const [incomingProposals, setIncomingProposals] = useState<PeopleProposal[]>([])
  const [outgoingProposals, setOutgoingProposals] = useState<PeopleProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proposalBusyId, setProposalBusyId] = useState<number | null>(null)

  const [sheetAction, setSheetAction] = useState<PeopleAction | null>(null)
  const [walletId, setWalletId] = useState('')
  const [acceptWalletId, setAcceptWalletId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [convertOpen, setConvertOpen] = useState(false)
  const [unlinkBusy, setUnlinkBusy] = useState(false)

  const isLinked = Boolean(link)

  const load = useCallback(async () => {
    if (!Number.isFinite(personId) || personId <= 0) {
      setError('Invalid person.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [hRes, aRes] = await Promise.all([
        peopleApi.history(personId, { year, month }),
        accountsApi.list({ type: 'bank,cash' }),
      ])
      setHistory(hRes.data as HistoryPayload)
      const list = asList<{ id: number; name: string; type: string }>(aRes.data).filter((a) => a.type !== 'person')
      setWallets(list)
      setWalletId((prev) => {
        if (prev && list.some((w) => String(w.id) === prev)) return prev
        return list[0] ? String(list[0].id) : ''
      })
      setAcceptWalletId((prev) => {
        if (prev && list.some((w) => String(w.id) === prev)) return prev
        return list[0] ? String(list[0].id) : ''
      })

      try {
        const [linkRes, propRes] = await Promise.all([
          peopleApi.links(),
          peopleApi.pendingProposals(),
        ])
        const allLinks = asList<PeopleLink>(linkRes.data)
        const mine = allLinks.find((l) => l.my_person?.id === personId) || null
        setLink(mine)
        const linkId = mine?.id
        const pending = propRes.data as { incoming?: PeopleProposal[]; outgoing?: PeopleProposal[] }
        const incoming = pending?.incoming || []
        const outgoing = pending?.outgoing || []
        setIncomingProposals(linkId ? incoming.filter((p) => p.link === linkId) : [])
        setOutgoingProposals(linkId ? outgoing.filter((p) => p.link === linkId) : [])
      } catch {
        setLink(null)
        setIncomingProposals([])
        setOutgoingProposals([])
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load person history.'))
      setHistory(null)
    } finally {
      setLoading(false)
    }
  }, [personId, year, month])

  useEffect(() => {
    void load()
  }, [load])

  const personName = history?.person?.name || 'Person'
  const pendingNet = toMoney(history?.pending_net)
  const settled = Math.abs(pendingNet) < 0.01
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }

  const openAction = (action: PeopleAction) => {
    setSheetAction(action)
    setAmount('')
    setDate(todayISO())
    setNotes('')
    setFormError('')
  }

  const submitAction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sheetAction) return
    setFormError('')
    const value = parseFloat(amount)
    if (!(value > 0)) { setFormError('Enter a valid amount.'); return }
    if (!walletId) { setFormError('Pick a wallet.'); return }
    const pkrAmount = travelOn ? toPkr(value) : value
    if (travelOn && (!(travelRate > 0) || !(pkrAmount > 0))) {
      setFormError('Travel rate missing. Open Travel Mode and set a rate.')
      return
    }
    setSaving(true)
    try {
      const fx = travelOn
        ? {
            original_amount: value,
            original_currency: travelCurrency,
            fx_rate: travelRate,
            fx_source: 'manual',
          }
        : {}

      if (link) {
        await peopleApi.propose({
          link_id: link.id,
          action: sheetAction,
          wallet_id: Number(walletId),
          amount: pkrAmount,
          date,
          notes: notes.trim(),
          ...fx,
        })
      } else {
        await peopleApi.action({
          action: sheetAction,
          wallet_id: Number(walletId),
          person_id: personId,
          amount: pkrAmount,
          date,
          notes: notes.trim(),
          ...fx,
        })
      }
      setSheetAction(null)
      await load()
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Could not save.'))
    } finally {
      setSaving(false)
    }
  }

  const respondProposal = async (proposalId: number, action: 'accept' | 'decline') => {
    setProposalBusyId(proposalId)
    setError('')
    try {
      if (action === 'accept') {
        if (!acceptWalletId) {
          setError('Pick a wallet to accept into.')
          return
        }
        await peopleApi.acceptProposal(proposalId, { wallet_id: Number(acceptWalletId) })
      } else {
        await peopleApi.declineProposal(proposalId)
      }
      await load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update proposal.'))
    } finally {
      setProposalBusyId(null)
    }
  }

  const unlink = async () => {
    if (!link) return
    setUnlinkBusy(true)
    setError('')
    try {
      await peopleApi.unlink(link.id)
      await load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not unlink. Settle both sides to zero first.'))
    } finally {
      setUnlinkBusy(false)
    }
  }

  const exportCsv = () => {
    if (!history) return
    const rows = [
      ['Date', 'Action', 'Type', 'Amount PKR', 'Foreign', 'Notes'],
      ...history.transactions.map((tx) => {
        const meta = actionMeta(tx.people_action)
        const foreign = formatForeignSubtitle(tx.original_amount, tx.original_currency, tx.fx_rate) || ''
        return [
          tx.date,
          meta.label,
          tx.type,
          String(toMoney(tx.amount)),
          foreign,
          (tx.notes || '').replace(/,/g, ';'),
        ]
      }),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cashtrail-${personName.replace(/\s+/g, '-').toLowerCase()}-${year}-${String(month).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const netStatus = settled
    ? 'No pending debts'
    : pendingNet > 0
      ? 'They owe you'
      : 'You owe them'

  const sheetMeta = sheetAction ? actionMeta(sheetAction) : null

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="btn-glass" onClick={() => navigate('/accounts')} aria-label="Back">
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 style={{ margin: 0 }}>{personName}</h1>
            <p className="page-subtitle" style={{ margin: 0 }}>
              {isLinked ? 'Linked · History' : 'History'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!isLinked ? (
            <button type="button" className="btn-glass" onClick={() => setConvertOpen(true)}>
              Invite to link
            </button>
          ) : settled ? (
            <button type="button" className="btn-glass" onClick={() => void unlink()} disabled={unlinkBusy}>
              {unlinkBusy ? <span className="spinner" /> : 'Unlink'}
            </button>
          ) : (
            <span className="travel-muted" style={{ fontSize: '0.78rem' }}>Settle to unlink</span>
          )}
          <button type="button" className="btn-glass" onClick={exportCsv} disabled={!history?.transactions.length}>
            <Download size={16} /> CSV
          </button>
        </div>
      </div>

      <div className="month-nav glass">
        <button type="button" className="btn-glass" onClick={prevMonth}><ChevronLeft size={16} /></button>
        <strong>{monthLabel}</strong>
        <button type="button" className="btn-glass" onClick={nextMonth}><ChevronRight size={16} /></button>
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div> : null}

      {loading && !history ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : history ? (
        <>
          <div className="people-net-card">
            <div className="travel-muted" style={{ color: 'rgba(255,255,255,0.7)' }}>Pending net</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 6 }}>{fmtBalance(pendingNet)}</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{netStatus}</div>
            <div className="people-net-stats">
              <div><span>Opening</span><strong>{fmtBalance(history.opening_balance)}</strong></div>
              <div><span>Inflow</span><strong>{fmtBalance(history.inflow)}</strong></div>
              <div><span>Outflow</span><strong>{fmtBalance(history.outflow)}</strong></div>
            </div>
          </div>

          {incomingProposals.length > 0 ? (
            <div className="people-proposal-box glass" style={{ marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.65rem' }}>Waiting for you</h3>
              <div className="form-group">
                <label>Wallet to post into</label>
                <select value={acceptWalletId} onChange={(e) => setAcceptWalletId(e.target.value)}>
                  {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              {incomingProposals.map((p) => {
                const meta = actionMeta(p.action)
                return (
                  <div key={p.id} className="people-invite-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>{meta.label} · {fmtBalance(p.amount)}</div>
                      <div className="travel-muted" style={{ fontSize: '0.78rem' }}>
                        {p.date}{p.notes ? ` · ${p.notes}` : ''}
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
                )
              })}
            </div>
          ) : null}

          {outgoingProposals.length > 0 ? (
            <div className="people-proposal-box glass" style={{ marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.65rem' }}>
                Waiting for {link?.other_user?.name || personName}
              </h3>
              {outgoingProposals.map((p) => {
                const meta = actionMeta(p.action)
                return (
                  <div key={p.id} className="people-invite-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800 }}>{meta.label} · {fmtBalance(p.amount)}</div>
                      <div className="travel-muted" style={{ fontSize: '0.78rem' }}>
                        Posted on your side · awaiting their accept
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          <h3 style={{ margin: '0 0 0.75rem' }}>Actions</h3>
          {isLinked ? (
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              Linked: they’ll get a notification to accept before their books update.
            </p>
          ) : null}
          <div className="people-action-grid">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                className="people-action-btn"
                style={{ borderColor: a.color }}
                onClick={() => openAction(a.key)}
              >
                <span style={{ color: a.color, fontWeight: 800 }}>{a.label}</span>
                <span className="travel-muted">{a.hint}</span>
              </button>
            ))}
          </div>

          <h3 style={{ margin: '1.25rem 0 0.75rem' }}>This month</h3>
          {history.transactions.length === 0 ? (
            <div className="glass empty-state" style={{ padding: '1.25rem' }}>
              <p style={{ margin: 0, fontWeight: 800 }}>
                {settled ? 'No pending debts' : 'No activity this month'}
              </p>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                {settled
                  ? 'You’re settled up. Use Lend or Borrow when money moves again.'
                  : 'Use Lend, Borrow, Pay, or Receive to record a movement.'}
              </p>
            </div>
          ) : (
            <div className="list">
              {history.transactions.map((tx) => {
                const meta = actionMeta(tx.people_action)
                const foreign = formatForeignSubtitle(tx.original_amount, tx.original_currency, tx.fx_rate)
                const isIn = tx.type === 'income'
                return (
                  <div key={tx.id} className="glass" style={{ padding: '0.85rem 1rem', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: `${meta.color}22`, display: 'grid', placeItems: 'center', color: meta.color,
                    }}>
                      {meta.key === 'lend' || meta.key === 'pay' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>{meta.label}</div>
                      <div className="travel-muted" style={{ fontSize: '0.8rem' }}>{tx.notes || tx.date}</div>
                      {foreign ? <div style={{ color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700 }}>{foreign}</div> : null}
                    </div>
                    <strong style={{ color: isIn ? 'var(--success)' : 'var(--danger)' }}>
                      {isIn ? '+' : '−'}{fmtBalance(tx.amount).replace(/^Deficit\s+/, '')}
                    </strong>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : null}

      {sheetAction && sheetMeta ? (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSheetAction(null)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h2>{sheetMeta.label} · {personName}</h2>
              <button type="button" className="modal-close" onClick={() => setSheetAction(null)}>×</button>
            </div>
            {formError ? <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{formError}</div> : null}
            {travelOn ? (
              <div className="travel-banner" style={{ marginBottom: '0.85rem' }}>
                Amounts in {travelCurrency} · {rateLine || formatRateLine(travelCurrency, travelRate)}
              </div>
            ) : null}
            <form onSubmit={submitAction} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>{sheetAction === 'lend' || sheetAction === 'pay' ? 'From wallet' : 'Into wallet'}</label>
                <select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
                  {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{travelOn ? `Amount (${travelCurrency})` : 'Amount (PKR)'}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                  required
                />
                {travelOn && amount && Number(amount) > 0 ? (
                  <p className="page-subtitle" style={{ marginTop: 4 }}>
                    ≈ {fmtBalance(foreignToPkr(Number(amount), travelRate))}
                  </p>
                ) : null}
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {isLinked ? (
                <p className="page-subtitle" style={{ margin: 0 }}>
                  Posts on your books now. {link?.other_user?.name || personName} gets a request to accept.
                </p>
              ) : null}
              <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={saving}>
                {saving ? <span className="spinner" /> : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {sheetAction === 'pay' ? <Send size={16} /> : sheetAction === 'receive' ? <Download size={16} /> : <UserRound size={16} />}
                    {isLinked ? `Send ${sheetMeta.label} request` : `Record ${sheetMeta.label}`}
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <InvitePersonModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        existingPersonId={personId}
        defaultDisplayName={personName}
        onDone={() => { void load() }}
      />
    </div>
  )
}
