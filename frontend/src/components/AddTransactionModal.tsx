import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowLeftRight,
  Calculator,
  ChevronDown,
  ChevronUp,
  Landmark,
  Plus,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { accountsApi, transactionsApi, householdsApi, peopleApi, asList, apiErrorMessage } from '../api/client'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/categories'
import { fmtBalance } from '../utils/format'
import { track } from '../lib/analytics'
import { useOffline } from '../offline'
import InvitePersonModal from '../people/InvitePersonModal'
import type { PeopleLink } from '../people/types'
import { formatRateLine, foreignToPkr } from '../travel/currencies'
import { useTravelMode } from '../travel/TravelModeContext'

interface Props {
  onClose: () => void
  onAdded: () => void
}

type TxType = 'income' | 'expense' | 'transfer' | 'people'
type PeopleAction = 'lend' | 'borrow'

interface OpenLedger {
  id: number
  name: string
  household: number
  household_name: string
}

interface WalletAccount {
  id: number
  name: string
  type?: string
  opening_balance?: number | string
  current_balance?: number | string
}

export default function AddTransactionModal({ onClose, onAdded }: Props) {
  const navigate = useNavigate()
  const { queueTransaction, online, getCachedAccounts } = useOffline()
  const {
    isActive: travelOn,
    currency: travelCurrency,
    rate: travelRate,
    rateLine,
    toPkr,
  } = useTravelMode()
  const [type, setType] = useState<TxType>('expense')

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const [accountId, setAccountId] = useState('')
  const [category, setCategory] = useState('')
  const [householdLedgerId, setHouseholdLedgerId] = useState('')

  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')

  const [accounts, setAccounts] = useState<WalletAccount[]>([])
  const [openLedgers, setOpenLedgers] = useState<OpenLedger[]>([])
  const [links, setLinks] = useState<PeopleLink[]>([])
  const [personId, setPersonId] = useState('')
  const [peopleAction, setPeopleAction] = useState<PeopleAction>('lend')

  const wallets = useMemo(
    () => accounts.filter((a) => a.type === 'bank' || a.type === 'cash'),
    [accounts],
  )
  const people = useMemo(
    () => accounts.filter((a) => a.type === 'person'),
    [accounts],
  )
  const linkedByPersonId = useMemo(() => {
    const map = new Map<number, PeopleLink>()
    for (const link of links) {
      if (link.my_person?.id) map.set(link.my_person.id, link)
    }
    return map
  }, [links])
  const selectedLink = personId ? linkedByPersonId.get(Number(personId)) : undefined

  const applyAccountDefaults = (list: WalletAccount[]) => {
    setAccounts(list)
    const walletList = list.filter((a) => a.type === 'bank' || a.type === 'cash')
    const peopleList = list.filter((a) => a.type === 'person')
    if (walletList[0]) {
      setAccountId((prev) => (prev && walletList.some((w) => String(w.id) === prev) ? prev : String(walletList[0].id)))
      setFromAccountId((prev) => (prev && walletList.some((w) => String(w.id) === prev) ? prev : String(walletList[0].id)))
      setToAccountId((prev) => {
        if (prev && walletList.some((w) => String(w.id) === prev)) return prev
        return String(walletList[1]?.id ?? walletList[0].id)
      })
    }
    if (peopleList[0]) {
      setPersonId((prev) => (prev && peopleList.some((p) => String(p.id) === prev) ? prev : String(peopleList[0].id)))
    }
  }

  useEffect(() => {
    accountsApi.list()
      .then(r => applyAccountDefaults(asList<WalletAccount>(r.data)))
      .catch(async () => {
        const cached = await getCachedAccounts()
        applyAccountDefaults(cached.map(a => ({
          id: a.serverId,
          name: a.name,
          type: a.type,
          opening_balance: a.openingBalance,
          current_balance: a.currentBalance,
        })))
      })
    peopleApi.links()
      .then(r => setLinks(asList<PeopleLink>(r.data)))
      .catch(() => setLinks([]))
    if (online) {
      householdsApi.openLedgers()
        .then(r => setOpenLedgers(asList<OpenLedger>(r.data)))
        .catch(() => setOpenLedgers([]))
    } else {
      setOpenLedgers([])
    }
  }, [online, getCachedAccounts])

  const switchType = (t: TxType) => {
    setType(t)
    setError('')
    setCategory('')
    setHouseholdLedgerId('')
  }

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const applyCalc = (expr: string) => {
    const v = evalSimpleMath(expr)
    if (v != null && v >= 0) {
      setAmount(String(Math.round(v * 100) / 100))
      setCalcOpen(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!amount || parseFloat(amount) <= 0) { setError('Please enter a valid amount.'); return }

    if (type === 'people') {
      if (!accountId) { setError('Pick a wallet.'); return }
      if (!personId) { setError('Pick a person.'); return }
      const value = parseFloat(amount)
      const pkrAmount = travelOn ? toPkr(value) : value
      if (travelOn && (!(travelRate > 0) || !(pkrAmount > 0))) {
        setError('Travel rate missing. Open Travel Mode and set a rate.')
        return
      }
      setLoading(true)
      try {
        const fx = travelOn
          ? {
              original_amount: value,
              original_currency: travelCurrency,
              fx_rate: travelRate,
              fx_source: 'manual',
            }
          : {}
        const link = linkedByPersonId.get(Number(personId))
        if (link) {
          await peopleApi.propose({
            link_id: link.id,
            action: peopleAction,
            wallet_id: Number(accountId),
            amount: pkrAmount,
            date,
            notes: notes.trim(),
            ...fx,
          })
        } else {
          await peopleApi.action({
            action: peopleAction,
            wallet_id: Number(accountId),
            person_id: Number(personId),
            amount: pkrAmount,
            date,
            notes: notes.trim(),
            ...fx,
          })
        }
        track('people_action_created', { action: peopleAction, linked: Boolean(link) })
        onAdded()
      } catch (err) {
        setError(apiErrorMessage(err, 'Could not save people entry.'))
      } finally {
        setLoading(false)
      }
      return
    }

    if (type === 'transfer') {
      if (!fromAccountId || !toAccountId) { setError('Please select both accounts.'); return }
      if (fromAccountId === toAccountId) { setError('Source and destination accounts must be different.'); return }

      const fromAcc = accounts.find(a => String(a.id) === fromAccountId)
      const toAcc = accounts.find(a => String(a.id) === toAccountId)
      const label = notes || `Transfer: ${fromAcc?.name ?? ''} → ${toAcc?.name ?? ''}`
      const amt = parseFloat(amount)

      setLoading(true)
      try {
        await queueTransaction({
          type: 'expense',
          amount: amt,
          date,
          accountServerId: parseInt(fromAccountId),
          category: 'Bank Transfer',
          notes: `${label} (out)`,
        })
        await queueTransaction({
          type: 'income',
          amount: amt,
          date,
          accountServerId: parseInt(toAccountId),
          category: 'Bank Transfer',
          notes: `${label} (in)`,
        })
        track('transaction_created', { tx_type: 'transfer', has_household_link: false })
        onAdded()
      } catch (err: any) {
        setError(err?.message ?? err.response?.data?.detail ?? 'Transfer failed. Please try again.')
      } finally {
        setLoading(false)
      }
      return
    }

    if (!accountId) { setError('Please select an account.'); return }
    if (!category) { setError('Please select a category.'); return }

    if (type === 'expense' && householdLedgerId) {
      if (!online) {
        setError('Household linking needs an internet connection.')
        return
      }
      setLoading(true)
      try {
        await transactionsApi.create({
          type,
          amount: parseFloat(amount),
          date,
          account: parseInt(accountId),
          category,
          notes,
          household_ledger: parseInt(householdLedgerId),
        })
        track('transaction_created', { tx_type: type, has_household_link: true })
        onAdded()
      } catch (err: any) {
        const data = err.response?.data
        const msg = typeof data?.household_ledger === 'string'
          ? data.household_ledger
          : Array.isArray(data?.household_ledger)
            ? data.household_ledger.join(' ')
            : data?.detail ?? 'Something went wrong.'
        setError(msg)
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      const result = await queueTransaction({
        type,
        amount: parseFloat(amount),
        date,
        accountServerId: parseInt(accountId),
        category,
        notes,
      })
      track('transaction_created', {
        tx_type: type,
        has_household_link: false,
        queued_offline: result.queuedOffline,
      })
      onAdded()
    } catch (err: any) {
      setError(err?.message ?? err.response?.data?.detail ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet add-tx-sheet">
        <div className="add-tx-header">
          <div className="add-tx-header-row">
            <span className="add-tx-header-spacer" />
            <h2>Add Transaction</h2>
            <button type="button" className="add-tx-close" onClick={onClose} aria-label="Close">
              <X size={18} strokeWidth={2.25} />
            </button>
          </div>

          <div className="add-tx-seg">
            {([
              { key: 'expense' as const, label: 'Expense' },
              { key: 'income' as const, label: 'Income' },
              { key: 'transfer' as const, label: 'Transfer' },
              { key: 'people' as const, label: 'People' },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                className={type === t.key ? 'active' : ''}
                onClick={() => switchType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {travelOn && (type === 'people' || type === 'expense' || type === 'income') ? (
            <div className="travel-banner" style={{ margin: '0.65rem 0 0' }}>
              Travel Mode · {rateLine || formatRateLine(travelCurrency, travelRate)}
            </div>
          ) : null}

          <div className="add-tx-amount">
            <span className="add-tx-currency">{travelOn && type !== 'transfer' ? travelCurrency : 'PKR'}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              aria-label="Amount"
            />
            <button
              type="button"
              className="add-tx-calc"
              onClick={() => setCalcOpen(v => !v)}
              aria-label="Open calculator"
            >
              <Calculator size={18} strokeWidth={2} />
            </button>
          </div>
          {travelOn && type !== 'transfer' && amount && Number(amount) > 0 ? (
            <p className="page-subtitle" style={{ margin: '0.35rem 0 0', textAlign: 'center' }}>
              ≈ {fmtBalance(foreignToPkr(Number(amount), travelRate))}
            </p>
          ) : null}

          {calcOpen && (
            <SimpleCalc
              onApply={applyCalc}
              onClose={() => setCalcOpen(false)}
            />
          )}
        </div>

        <form onSubmit={handleSubmit} className="add-tx-body">
          {error && <div className="auth-error">{error}</div>}
          {!online && (
            <div className="offline-banner">
              You’re offline — this will save on this device and sync when you’re back online.
            </div>
          )}

          {type === 'transfer' ? (
            <div className="add-tx-block">
              <h3 className="add-tx-section">Transfer between wallets</h3>
              <div className="form-group">
                <label>From wallet</label>
                <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} required>
                  <option value="">Select source…</option>
                  {wallets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {fmtBalance(a.current_balance)}</option>
                  ))}
                </select>
              </div>
              <div className="add-tx-transfer-arrow"><ArrowDown size={18} strokeWidth={2} /></div>
              <div className="form-group">
                <label>To wallet</label>
                <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} required>
                  <option value="">Select destination…</option>
                  {wallets.filter(a => String(a.id) !== fromAccountId).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {fmtBalance(a.current_balance)}</option>
                  ))}
                </select>
              </div>
              <p className="add-tx-hint">
                Moves money between your wallets. Transfers don’t count as income or expense.
              </p>
            </div>
          ) : type === 'people' ? (
            <div className="add-tx-block">
              <h3 className="add-tx-section">Action</h3>
              <div className="add-tx-chip-row">
                {([
                  { key: 'lend' as const, label: 'Lend', color: '#8b5cf6' },
                  { key: 'borrow' as const, label: 'Borrow', color: '#f59e0b' },
                ]).map((a) => {
                  const active = peopleAction === a.key
                  return (
                    <button
                      key={a.key}
                      type="button"
                      className={`add-tx-chip ${active ? 'active' : ''}`}
                      onClick={() => setPeopleAction(a.key)}
                    >
                      <span
                        className="add-tx-chip-icon"
                        style={{
                          background: active ? a.color : `${a.color}1f`,
                          color: active ? '#fff' : a.color,
                          borderColor: active ? a.color : 'transparent',
                        }}
                      >
                        <UserRound size={18} strokeWidth={2} />
                      </span>
                      <span className="add-tx-chip-label">{a.label}</span>
                    </button>
                  )
                })}
              </div>

              <h3 className="add-tx-section">{peopleAction === 'lend' ? 'From wallet' : 'Into wallet'}</h3>
              <div className="add-tx-chip-row">
                {wallets.map((a) => {
                  const active = accountId === String(a.id)
                  const isCash = a.type === 'cash'
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`add-tx-chip ${active ? 'active' : ''}`}
                      onClick={() => setAccountId(String(a.id))}
                    >
                      <span className={`add-tx-acct-icon ${active ? 'on' : ''}`}>
                        {isCash
                          ? <Wallet size={18} strokeWidth={2} />
                          : <Landmark size={18} strokeWidth={2} />}
                      </span>
                      <span className="add-tx-chip-label">{a.name}</span>
                    </button>
                  )
                })}
              </div>

              <h3 className="add-tx-section">Person</h3>
              <div className="add-tx-chip-row">
                {people.map((p) => {
                  const active = personId === String(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`add-tx-chip ${active ? 'active' : ''}`}
                      onClick={() => setPersonId(String(p.id))}
                    >
                      <span className={`add-tx-acct-icon ${active ? 'on' : ''}`}>
                        <UserRound size={18} strokeWidth={2} />
                      </span>
                      <span className="add-tx-chip-label">{p.name}</span>
                    </button>
                  )
                })}
                <button type="button" className="add-tx-chip" onClick={() => setInviteOpen(true)}>
                  <span className="add-tx-acct-icon muted"><Plus size={18} strokeWidth={2} /></span>
                  <span className="add-tx-chip-label">Invite</span>
                </button>
              </div>
              <p className="add-tx-hint">
                {selectedLink
                  ? `Linked: posts on your books now and sends ${selectedLink.other_user?.name || 'them'} an Accept request to pick their wallet.`
                  : 'Local = name only. Invite = WalletTrails user (email/username or code). Pay & Receive on History.'}
              </p>
            </div>
          ) : (
            <>
              <h3 className="add-tx-section">Select Category</h3>
              <div className="add-tx-chip-row">
                {categories.map((c) => {
                  const active = category === c.key
                  const Icon = c.icon
                  return (
                    <button
                      key={c.key}
                      type="button"
                      className={`add-tx-chip ${active ? 'active' : ''}`}
                      onClick={() => setCategory(c.key)}
                    >
                      <span
                        className="add-tx-chip-icon"
                        style={{
                          background: active ? c.color : `${c.color}1f`,
                          color: active ? '#fff' : c.color,
                          borderColor: active ? c.color : 'transparent',
                        }}
                      >
                        <Icon size={20} strokeWidth={2} />
                      </span>
                      <span className="add-tx-chip-label">{c.label}</span>
                    </button>
                  )
                })}
              </div>

              <h3 className="add-tx-section">Select Account</h3>
              <div className="add-tx-chip-row">
                {wallets.map((a) => {
                  const active = accountId === String(a.id)
                  const isCash = a.type === 'cash'
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`add-tx-chip ${active ? 'active' : ''}`}
                      onClick={() => setAccountId(String(a.id))}
                    >
                      <span className={`add-tx-acct-icon ${active ? 'on' : ''}`}>
                        {isCash
                          ? <Wallet size={18} strokeWidth={2} />
                          : <Landmark size={18} strokeWidth={2} />}
                      </span>
                      <span className="add-tx-chip-label">{a.name}</span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="add-tx-chip"
                  onClick={() => { onClose(); navigate('/accounts') }}
                >
                  <span className="add-tx-acct-icon muted"><Plus size={18} strokeWidth={2} /></span>
                  <span className="add-tx-chip-label">Add Account</span>
                </button>
              </div>
            </>
          )}

          <button
            type="button"
            className="add-tx-details-toggle"
            onClick={() => setDetailsOpen(v => !v)}
          >
            <span>{detailsOpen ? 'Hide details' : 'Add details (date, notes)'}</span>
            {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {detailsOpen && (
            <div className="add-tx-block">
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>

              {type === 'expense' && online && openLedgers.length > 0 && (
                <div className="form-group">
                  <label>Link to Household (optional)</label>
                  <select value={householdLedgerId} onChange={e => setHouseholdLedgerId(e.target.value)}>
                    <option value="">Personal only — not shared</option>
                    {openLedgers.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.household_name} — {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Notes</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className={`btn-primary add-tx-submit ${type === 'transfer' ? 'transfer' : ''}`}
            disabled={loading}
          >
            {loading
              ? <span className="spinner" />
              : type === 'transfer'
                ? <><ArrowLeftRight size={15} strokeWidth={2} /> Record Transfer</>
                : type === 'people'
                  ? selectedLink
                    ? `Send ${peopleAction === 'lend' ? 'Lend' : 'Borrow'} request`
                    : `${peopleAction === 'lend' ? 'Lend' : 'Borrow'}`
                  : `Add ${type === 'income' ? 'Income' : 'Expense'}`}
          </button>
        </form>
      </div>
    </div>

    <InvitePersonModal
      open={inviteOpen}
      onClose={() => setInviteOpen(false)}
      onDone={(result) => {
        if (result.kind === 'local') setPersonId(String(result.personId))
        accountsApi.list()
          .then(r => {
            const list = asList<WalletAccount>(r.data)
            setAccounts(list)
            if (result.kind === 'local') setPersonId(String(result.personId))
          })
          .catch(() => undefined)
      }}
    />
    </>
  )
}

/** Safe + - * / with decimals only — no Function/eval. */
function evalSimpleMath(raw: string): number | null {
  const s = raw.replace(/\s+/g, '')
  if (!s || !/^[0-9.+\-*/]+$/.test(s)) return null
  const tokens = s.match(/(\d+\.?\d*|[+\-*/])/g)
  if (!tokens?.length) return null
  const nums: number[] = []
  const ops: string[] = []
  for (const t of tokens) {
    if ('+-*/'.includes(t) && t.length === 1) ops.push(t)
    else {
      const n = parseFloat(t)
      if (!Number.isFinite(n)) return null
      nums.push(n)
    }
  }
  if (nums.length !== ops.length + 1) return null
  // * and /
  for (let i = 0; i < ops.length; ) {
    if (ops[i] === '*' || ops[i] === '/') {
      const a = nums[i]
      const b = nums[i + 1]
      if (ops[i] === '/' && b === 0) return null
      nums.splice(i, 2, ops[i] === '*' ? a * b : a / b)
      ops.splice(i, 1)
    } else i++
  }
  let acc = nums[0]
  for (let i = 0; i < ops.length; i++) {
    acc = ops[i] === '+' ? acc + nums[i + 1] : acc - nums[i + 1]
  }
  return Number.isFinite(acc) ? acc : null
}

function SimpleCalc({ onApply, onClose }: { onApply: (expr: string) => void; onClose: () => void }) {
  const [expr, setExpr] = useState('')
  const push = (ch: string) => setExpr(e => e + ch)
  const keys = ['7', '8', '9', '+', '4', '5', '6', '-', '1', '2', '3', '*', '0', '.', 'C', '/']

  return (
    <div className="add-tx-calc-panel" onClick={e => e.stopPropagation()}>
      <div className="add-tx-calc-display">{expr || '0'}</div>
      <div className="add-tx-calc-keys">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => (k === 'C' ? setExpr('') : push(k))}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="add-tx-calc-actions">
        <button type="button" className="btn-glass" onClick={onClose}>Close</button>
        <button type="button" className="btn-primary" onClick={() => onApply(expr || '0')}>Use result</button>
      </div>
    </div>
  )
}
