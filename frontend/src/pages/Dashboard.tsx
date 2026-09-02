import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  Plus,
  Wallet,
  FileText,
  Users,
} from 'lucide-react'
import { dashboardApi, householdsApi, transactionsApi } from '../api/client'
import { CategoryDonut, type DonutDatum } from '../components/CategoryDonut'
import { CountUp } from '../components/motion/CountUp'
import { Reveal } from '../components/motion/Reveal'
import { getCategoryMeta } from '../constants/categories'
import { useAuth } from '../context/AuthContext'
import { useOffline } from '../offline'
import { fmt } from '../utils/format'

interface DashboardData {
  total_balance: number
  accounts: { id: number; name: string; type: string; balance: number }[]
  month_income: number
  month_expense: number
  month_net: number
  recent_transactions: {
    id: number; type: string; amount: number; date: string
    account_name: string; project_name: string | null; category: string; notes: string
  }[]
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthPrefix(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function breakdownFromTxs(
  txs: { type: string; category: string; amount: number; date: string }[],
): DonutDatum[] {
  const prefix = monthPrefix()
  const map = new Map<string, number>()
  for (const t of txs) {
    if (!t.date.startsWith(prefix)) continue
    if (t.type !== 'expense') continue
    if (t.category === 'Bank Transfer') continue
    const key = t.category || 'Uncategorized'
    map.set(key, (map.get(key) ?? 0) + Number(t.amount || 0))
  }
  return Array.from(map.entries()).map(([category, amount]) => ({ category, amount }))
}

export default function Dashboard() {
  const { user } = useAuth()
  const { getCachedAccounts, getCachedTransactions, online, pending } = useOffline()
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [breakdown, setBreakdown] = useState<DonutDatum[]>([])
  const [loading, setLoading] = useState(true)
  const [hhUnread, setHhUnread] = useState(0)
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    const now = new Date()
    const loadCached = async () => {
      const [accounts, txs] = await Promise.all([
        getCachedAccounts(),
        getCachedTransactions(),
      ])
      if (!accounts.length && !txs.length) {
        setData(null)
        setBreakdown([])
        return
      }
      const total = accounts.reduce((s, a) => s + a.currentBalance, 0)
      const month = monthPrefix(now)
      const monthTxs = txs.filter((t) => t.date.startsWith(month) && t.category !== 'Bank Transfer')
      const monthIncome = monthTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const monthExpense = monthTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      const nameById = new Map(accounts.map((a) => [a.serverId, a.name]))
      setBreakdown(breakdownFromTxs(txs))
      setData({
        total_balance: total,
        accounts: accounts.map((a) => ({
          id: a.serverId, name: a.name, type: a.type, balance: a.currentBalance,
        })),
        month_income: monthIncome,
        month_expense: monthExpense,
        month_net: monthIncome - monthExpense,
        recent_transactions: txs.slice(0, 8).map((t) => ({
          id: t.serverId ?? Number.NaN,
          type: t.type,
          amount: t.amount,
          date: t.date,
          account_name: nameById.get(t.accountServerId) || 'Wallet',
          project_name: null,
          category: t.syncStatus === 'pending' || t.syncStatus === 'failed'
            ? `${t.category || 'Pending'} · sync`
            : t.category,
          notes: t.notes,
        })),
      })
      setFromCache(true)
    }

    Promise.all([
      dashboardApi.get(),
      transactionsApi.list().catch(() => ({ data: [] })),
      householdsApi.unreadNotificationCount().catch(() => ({ data: { count: 0 } })),
    ]).then(([dRes, tRes, uRes]) => {
      const d = dRes.data ?? {}
      const rawTx = tRes.data
      const txs = Array.isArray(rawTx)
        ? rawTx
        : Array.isArray((rawTx as { results?: unknown })?.results)
          ? ((rawTx as { results: unknown[] }).results)
          : []
      setData({
        ...d,
        accounts: Array.isArray(d.accounts) ? d.accounts : [],
        recent_transactions: Array.isArray(d.recent_transactions) ? d.recent_transactions : [],
      })
      setBreakdown(breakdownFromTxs(txs as { type: string; category: string; amount: number; date: string }[]))
      setHhUnread(Number(uRes.data?.count) || 0)
      setFromCache(false)
    }).catch(async () => {
      await loadCached()
    }).finally(() => setLoading(false))
  }, [getCachedAccounts, getCachedTransactions])

  const monthName = MONTH_NAMES[new Date().getMonth()]
  const accounts = data?.accounts ?? []
  const walletCount = accounts.length
  const balanceNeg = (data?.total_balance ?? 0) < 0

  const recent = useMemo(() => data?.recent_transactions ?? [], [data])

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
      </div>
    )
  }

  return (
    <div className="page home-page">
      <div className="welcome-row">
        <span className="welcome-hi">Welcome back,</span>
        <span className="welcome-name">
          {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'there'}
        </span>
        {user?.is_premium ? <span className="badge badge-premium">Premium</span> : null}
      </div>

      {(fromCache || !online || pending > 0) && (
        <div className="offline-banner" style={{ marginBottom: '0.85rem' }}>
          {!online || fromCache
            ? 'Showing saved data on this device. New entries sync when you’re online.'
            : `${pending} transaction${pending === 1 ? '' : 's'} waiting to sync.`}
        </div>
      )}

      {/* What you have — balance + wallets in one card (mobile parity) */}
      <Reveal index={0}>
        <section className="home-card">
          <div className="home-card-head">
            <h3>What you have</h3>
            <button type="button" className="section-link" onClick={() => navigate('/accounts')}>
              All wallets →
            </button>
          </div>
          <div className={`home-balance ${balanceNeg ? 'neg' : ''}`}>
            <CountUp value={data?.total_balance ?? 0} />
          </div>
          <p className="home-balance-hint">
            Across {walletCount} wallet{walletCount === 1 ? '' : 's'} · {monthName} in {fmt(data?.month_income ?? 0)} · out {fmt(data?.month_expense ?? 0)}
          </p>

          <div className="wallet-grid">
            {accounts.slice(0, 6).map((acc, i) => {
              const neg = acc.balance < 0
              return (
                <Reveal key={acc.id} index={i} stepMs={40}>
                  <button
                    type="button"
                    className="wallet-tile"
                    onClick={() => navigate('/accounts')}
                  >
                    <div className="wallet-tile-top">
                      <span className={`account-icon ${acc.type === 'cash' ? 'account-icon-cash' : 'account-icon-bank'}`}>
                        {acc.type === 'cash'
                          ? <Wallet size={14} strokeWidth={1.75} />
                          : <Landmark size={14} strokeWidth={1.75} />}
                      </span>
                      <span className="wallet-tile-name">{acc.name}</span>
                    </div>
                    <div className={`wallet-tile-bal ${neg ? 'neg' : ''}`}>
                      <CountUp value={acc.balance} durationMs={520} />
                    </div>
                  </button>
                </Reveal>
              )
            })}
            <Reveal index={Math.min(accounts.length, 6)} stepMs={40}>
              <button type="button" className="wallet-tile wallet-tile-add" onClick={() => navigate('/accounts')}>
                <Plus size={16} strokeWidth={2.25} />
                <span>Add wallet</span>
              </button>
            </Reveal>
          </div>
        </section>
      </Reveal>

      {/* Monthly spending bloom chart */}
      <Reveal index={1}>
        <section className="home-card">
          <div className="home-card-head">
            <h3>{monthName} spending</h3>
            <button type="button" className="section-link" onClick={() => navigate('/budgets')}>
              Budgets →
            </button>
          </div>
          <CategoryDonut data={breakdown} />
        </section>
      </Reveal>

      {/* Household shortcut */}
      <Reveal index={2}>
        <button type="button" className="home-card home-hh-btn" onClick={() => navigate('/household')}>
          <div className="home-hh-left">
            <span className="account-icon account-icon-bank"><Users size={16} strokeWidth={1.75} /></span>
            <div>
              <div className="home-hh-title">
                Household
                {hhUnread > 0 && <span className="badge badge-red">{hhUnread} new</span>}
              </div>
              <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                {hhUnread > 0 ? 'Someone posted a shared expense' : 'Shared expenses with family'}
              </div>
            </div>
          </div>
          <span className="section-link">Open →</span>
        </button>
      </Reveal>

      {/* Recent */}
      <Reveal index={3}>
        <div className="section-row">
          <h3>Recent</h3>
          <button type="button" className="section-link" onClick={() => navigate('/reports')}>
            View all →
          </button>
        </div>
      </Reveal>
      {!recent.length ? (
        <Reveal index={4}>
          <div className="home-card empty-state">
            <div className="empty-icon"><FileText size={36} strokeWidth={1.5} /></div>
            <p>No transactions yet. Tap + to add your first one.</p>
          </div>
        </Reveal>
      ) : (
        <div className="home-tx-list">
          {recent.map((tx, i) => {
            const income = tx.type === 'income'
            const title = tx.project_name || tx.category || (income ? 'Income' : 'Expense')
            const meta = getCategoryMeta(tx.category)
            const Icon = income ? ArrowUpRight : meta.icon
            const note = (tx.notes || '').trim()
            return (
              <Reveal
                key={tx.id && !Number.isNaN(tx.id) ? tx.id : `tx-${tx.date}-${i}`}
                index={i}
                stepMs={40}
              >
                <div className="home-tx-row">
                  <div
                    className="home-tx-icon"
                    style={{
                      background: income ? '#ecfdf5' : `${meta.color}1f`,
                      color: income ? 'var(--success)' : meta.color,
                    }}
                  >
                    <Icon size={14} strokeWidth={2.25} />
                  </div>
                  <div className="home-tx-body">
                    <div className="home-tx-title">{title}</div>
                    {note ? <div className="home-tx-notes">{note}</div> : null}
                    <div className="home-tx-meta">{tx.account_name} · {tx.date}</div>
                  </div>
                  <div className={`home-tx-amt ${income ? 'in' : 'out'}`}>
                    {income ? '+' : '−'} {fmt(Math.abs(tx.amount))}
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      )}
    </div>
  )
}
