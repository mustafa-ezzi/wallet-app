import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi, forecastApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtBalance } from '../utils/format'

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

interface Forecast {
  total_expected_income: number
  total_expected_outgoing: number
  net_forecast: number
  actual_income: number
  actual_expense: number
}


const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData]         = useState<DashboardData | null>(null)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const now = new Date()
    Promise.all([
      dashboardApi.get(),
      forecastApi.get(now.getFullYear(), now.getMonth() + 1),
    ]).then(([dRes, fRes]) => {
      setData(dRes.data)
      setForecast(fRes.data)
    }).catch(() => {
      setData(null)
      setForecast(null)
    }).finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const monthName = MONTH_NAMES[now.getMonth()]
  const net = forecast?.net_forecast ?? 0

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Dashboard</h1>
          <p className="page-subtitle">Here is your financial snapshot right now.</p>
        </div>
      </div>

      {/* ── Hero balance card ── */}
      <div className="hero-balance">
        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
          Total Balance
        </p>
        <div className="balance-amount" style={{ color: (data?.total_balance ?? 0) < 0 ? '#fecaca' : undefined }}>
          {fmtBalance(data?.total_balance ?? 0)}
        </div>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
          Across {data?.accounts.length ?? 0} account{(data?.accounts.length ?? 0) !== 1 ? 's' : ''}
        </p>
        <div className="balance-chips">
          <div className="balance-chip">
            <div className="chip-label">↑ {monthName} In</div>
            <div className="chip-value">{fmt(data?.month_income ?? 0)}</div>
          </div>
          <div className="balance-chip">
            <div className="chip-label">↓ {monthName} Out</div>
            <div className="chip-value">{fmt(data?.month_expense ?? 0)}</div>
          </div>
        </div>
      </div>

      {/* ── Monthly forecast summary (req 4.1) ── */}
      {forecast && (
        <div className="forecast-summary-card">
          <div className="section-row" style={{ marginBottom: '0.6rem' }}>
            <h3>Expected Net This Month</h3>
            <button className="section-link" onClick={() => navigate('/reports')}>Full report →</button>
          </div>

          <div style={{ fontSize: '1.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, color: net >= 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {fmtBalance(net)}
            <span style={{ fontSize: '1rem' }}>{net >= 0 ? '↗' : '↘'}</span>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>
            Based on scheduled income &amp; expenses
          </p>

          <div className="forecast-net-row">
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 400 }}>Actual net this month</span>
            <span style={{ color: data?.month_net && data.month_net >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '0.88rem' }}>
              {fmtBalance(data?.month_net ?? 0)}
            </span>
          </div>

          {/* Progress bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            {[
              { label: 'Income received', actual: forecast.actual_income,  expected: forecast.total_expected_income,   color: 'var(--green-700)' },
              { label: 'Expenses paid',   actual: forecast.actual_expense, expected: forecast.total_expected_outgoing, color: 'var(--red-600)' },
            ].map(bar => {
              const pct = bar.expected > 0 ? Math.min(100, (bar.actual / bar.expected) * 100) : 0
              return (
                <div key={bar.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{bar.label}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {fmt(bar.actual)} / {fmt(bar.expected)}
                    </span>
                  </div>
                  <div className="progress-bar" style={{ height: '5px' }}>
                    <div style={{ height: '100%', borderRadius: '99px', background: bar.color, width: `${pct}%`, transition: 'width 0.5s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Accounts ── */}
      <div style={{ marginBottom: '1rem' }}>
        <div className="section-row">
          <h3>Accounts</h3>
          <button className="section-link" onClick={() => navigate('/accounts')}>Manage →</button>
        </div>
        {!data?.accounts.length ? (
          <div className="glass empty-state">
            <div className="empty-icon">🏦</div>
            <p>No accounts yet.</p>
            <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/accounts')}>Add account</button>
          </div>
        ) : (
          <div className="list">
            {data.accounts.map(acc => (
              <div key={acc.id} className="list-item glass-hover" style={{ cursor: 'pointer' }} onClick={() => navigate('/accounts')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className={`account-icon ${acc.type === 'cash' ? 'account-icon-cash' : 'account-icon-bank'}`}>
                    {acc.type === 'cash' ? '💵' : '🏛'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{acc.name}</div>
                    <div className="text-muted">{acc.type === 'cash' ? 'Cash' : 'Bank'}</div>
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: acc.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {fmtBalance(acc.balance)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent transactions ── */}
      <div>
        <div className="section-row">
          <h3>Recent Transactions</h3>
        </div>
        {!data?.recent_transactions.length ? (
          <div className="glass empty-state">
            <div className="empty-icon">📊</div>
            <p>No transactions yet. Tap + to add your first one.</p>
          </div>
        ) : (
          <div className="list">
            {data.recent_transactions.map(tx => (
              <div key={tx.id} className="list-item glass-hover">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className={`tx-icon ${tx.type === 'income' ? 'tx-icon-income' : 'tx-icon-expense'}`}>
                    {tx.type === 'income' ? '↑' : '↓'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      {tx.project_name || tx.category || (tx.type === 'income' ? 'Income' : 'Expense')}
                    </div>
                    <div className="text-muted">{tx.account_name} · {tx.date}</div>
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                  {tx.type === 'income' ? '+' : '−'} {fmt(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
