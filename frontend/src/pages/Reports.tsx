import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Wallet,
} from 'lucide-react'
import { accountsApi, forecastApi, transactionsApi, asList } from '../api/client'
import { fmt, fmtBalance, sumMoney, toMoney } from '../utils/format'

interface ForecastItem { label: string; amount: number; type: string }
interface Forecast {
  year: number; month: number
  forecast_income: ForecastItem[]
  forecast_outgoing: ForecastItem[]
  total_expected_income: number
  total_expected_outgoing: number
  net_forecast: number
  actual_income: number
  actual_expense: number
  actual_net: number
}

interface Account {
  id: number
  name: string
  type: string
  current_balance: number
}

interface Tx {
  id: number
  type: string
  amount: number
  date: string
  account: number
  account_name: string
  category: string
  notes: string
  project_name: string | null
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May',
  'June', 'July', 'August', 'September', 'October', 'November', 'December',
]

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

function isTransfer(tx: Tx) {
  return tx.category === 'Bank Transfer'
}

export default function Reports() {
  const now = new Date()
  const navigate = useNavigate()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      forecastApi.get(year, month),
      accountsApi.list(),
      transactionsApi.list({ year, month }),
    ]).then(([fRes, aRes, tRes]) => {
      const d = fRes.data ?? {}
      setForecast({
        ...d,
        forecast_income: Array.isArray(d.forecast_income) ? d.forecast_income : [],
        forecast_outgoing: Array.isArray(d.forecast_outgoing) ? d.forecast_outgoing : [],
      })
      setAccounts(asList(aRes.data))
      setTxs(asList(tRes.data))
    }).catch(() => {
      setForecast(null)
      setAccounts([])
      setTxs([])
    }).finally(() => setLoading(false))
  }, [year, month])

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  const maxBar = Math.max(forecast?.total_expected_income ?? 0, forecast?.total_expected_outgoing ?? 0, 1)
  const net = forecast?.net_forecast ?? 0
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  const ledgers = useMemo(() => {
    return accounts.map(acc => {
      const rows = txs
        .filter(t => t.account === acc.id)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

      const income = sumMoney(
        rows.filter(t => t.type === 'income' && !isTransfer(t)),
        t => t.amount,
      )
      const expense = sumMoney(
        rows.filter(t => t.type === 'expense' && !isTransfer(t)),
        t => t.amount,
      )
      const transfersIn = sumMoney(
        rows.filter(t => t.type === 'income' && isTransfer(t)),
        t => t.amount,
      )
      const transfersOut = sumMoney(
        rows.filter(t => t.type === 'expense' && isTransfer(t)),
        t => t.amount,
      )

      return {
        account: acc,
        rows,
        income,
        expense,
        transfersIn,
        transfersOut,
        net: income - expense,
      }
    }).filter(l => l.rows.length > 0 || accounts.length > 0)
  }, [accounts, txs])

  const monthIncomeTotal = sumMoney(
    txs.filter(t => t.type === 'income' && !isTransfer(t)),
    t => t.amount,
  )
  const monthExpenseTotal = sumMoney(
    txs.filter(t => t.type === 'expense' && !isTransfer(t)),
    t => t.amount,
  )

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Reports</h1>
          <p className="page-subtitle">Forecasts and wallet ledgers for the month.</p>
        </div>
        <button
          className="btn-glass"
          style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }}
          onClick={() => navigate('/expenses')}
        >
          Manage Expenses →
        </button>
      </div>

      <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
        <button className="btn-icon" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{MONTH_NAMES[month - 1]} {year}</span>
          {isCurrentMonth && <div style={{ fontSize: '0.7rem', color: 'var(--primary-light)', marginTop: '0.15rem' }}>Current month</div>}
        </div>
        <button className="btn-icon" onClick={nextMonth} aria-label="Next month">
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : (
        <>
          {/* Month actuals strip */}
          <div className="grid-3" style={{ marginBottom: '1rem' }}>
            <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
              <div className="stat-label">Month income</div>
              <div className="stat-value amt-positive">{fmt(monthIncomeTotal)}</div>
            </div>
            <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
              <div className="stat-label">Month expense</div>
              <div className="stat-value amt-negative">{fmt(monthExpenseTotal)}</div>
            </div>
            <div className="glass stat-card" style={{ borderRadius: 'var(--radius-md)' }}>
              <div className="stat-label">Month net</div>
              <div className={`stat-value ${monthIncomeTotal - monthExpenseTotal >= 0 ? 'amt-positive' : 'amt-negative'}`}>
                {fmtBalance(monthIncomeTotal - monthExpenseTotal)}
              </div>
            </div>
          </div>

          {/* Wallet ledgers */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div className="section-row" style={{ marginBottom: '0.65rem' }}>
              <h3>Wallet ledger</h3>
            </div>

            {accounts.length === 0 ? (
              <div className="glass empty-state">
                <div className="empty-icon"><Wallet size={36} strokeWidth={1.5} /></div>
                <p>No wallets yet. Create a wallet to see its ledger.</p>
                <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/accounts')}>
                  Create wallet
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {ledgers.map(({ account, rows, income, expense, transfersIn, transfersOut, net: accNet }) => (
                  <div key={account.id} className="glass ledger-card">
                    <div className="ledger-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div className={`account-icon ${account.type === 'cash' ? 'account-icon-cash' : 'account-icon-bank'}`}>
                          {account.type === 'cash'
                            ? <Wallet size={16} strokeWidth={1.75} />
                            : <Landmark size={16} strokeWidth={1.75} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>{account.name}</div>
                          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                            {account.type === 'cash' ? 'Cash' : 'Bank'} · balance {fmtBalance(toMoney(account.current_balance))}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Month net
                        </div>
                        <div style={{ fontWeight: 800, color: accNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {fmtBalance(accNet)}
                        </div>
                      </div>
                    </div>

                    <div className="ledger-totals">
                      <div>
                        <span className="ledger-tot-label">Income</span>
                        <span className="amt-positive">{fmt(income)}</span>
                      </div>
                      <div>
                        <span className="ledger-tot-label">Expenses</span>
                        <span className="amt-negative">{fmt(expense)}</span>
                      </div>
                      {(transfersIn > 0 || transfersOut > 0) && (
                        <div>
                          <span className="ledger-tot-label">Transfers</span>
                          <span className="text-muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                            +{fmt(transfersIn)} / −{fmt(transfersOut)}
                          </span>
                        </div>
                      )}
                    </div>

                    {rows.length === 0 ? (
                      <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.35rem 0 0', padding: '0 0.15rem' }}>
                        No movements this month.
                      </p>
                    ) : (
                      <div className="ledger-table">
                        <div className="ledger-row ledger-row-head">
                          <span>Date</span>
                          <span>Particulars</span>
                          <span className="ledger-amt">In</span>
                          <span className="ledger-amt">Out</span>
                        </div>
                        {rows.map(tx => {
                          const label = tx.project_name || tx.category || tx.notes || (tx.type === 'income' ? 'Income' : 'Expense')
                          const transfer = isTransfer(tx)
                          return (
                            <div key={tx.id} className="ledger-row">
                              <span className="ledger-date">{tx.date.slice(8)}/{tx.date.slice(5, 7)}</span>
                              <span className="ledger-part">
                                {label}
                                {transfer && <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: '0.58rem' }}>transfer</span>}
                              </span>
                              <span className="ledger-amt amt-positive">
                                {tx.type === 'income' ? fmt(tx.amount) : '—'}
                              </span>
                              <span className="ledger-amt amt-negative">
                                {tx.type === 'expense' ? fmt(tx.amount) : '—'}
                              </span>
                            </div>
                          )
                        })}
                        <div className="ledger-row ledger-row-foot">
                          <span />
                          <span style={{ fontWeight: 700 }}>Total</span>
                          <span className="ledger-amt amt-positive" style={{ fontWeight: 800 }}>{fmt(income + transfersIn)}</span>
                          <span className="ledger-amt amt-negative" style={{ fontWeight: 800 }}>{fmt(expense + transfersOut)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {forecast && (
            <>
              <div className="hero-balance" style={{ marginBottom: '1rem' }}>
                <p className="text-label" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {net >= 0 ? 'Forecasted Savings' : 'Forecasted Shortfall'}
                </p>
                <div className="balance-amount" style={{ color: '#fff' }}>
                  {net >= 0 ? '+' : ''}{fmtBalance(net)}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', marginBottom: '0.25rem' }}>
                  {net >= 0
                    ? `You will earn ${fmt(forecast.total_expected_income)}, pay ${fmt(forecast.total_expected_outgoing)}, and save ${fmtBalance(net)}`
                    : `You will earn ${fmt(forecast.total_expected_income)} but spend ${fmt(forecast.total_expected_outgoing)} — short by ${fmtBalance(Math.abs(net)).replace('Deficit ', '')}`
                  }
                </p>
                <div className="balance-chips">
                  <div className="balance-chip">
                    <div className="chip-label">Expected In</div>
                    <div className="chip-value" style={{ color: '#34d399' }}>{fmt(forecast.total_expected_income)}</div>
                  </div>
                  <div className="balance-chip">
                    <div className="chip-label">Expected Out</div>
                    <div className="chip-value" style={{ color: '#fb7185' }}>{fmt(forecast.total_expected_outgoing)}</div>
                  </div>
                </div>
              </div>

              <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ marginBottom: '0.85rem' }}>Forecast vs Actual</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[
                    { label: 'Expected Income', value: forecast.total_expected_income, max: maxBar, color: 'var(--green-100)', tag: 'forecast', textColor: 'var(--green-700)' },
                    { label: 'Actual Income', value: forecast.actual_income, max: maxBar, color: 'var(--green-700)', tag: 'actual', textColor: 'var(--success)' },
                    { label: 'Expected Outgoing', value: forecast.total_expected_outgoing, max: maxBar, color: '#f5c4c0', tag: 'forecast', textColor: 'var(--text-secondary)' },
                    { label: 'Actual Expense', value: forecast.actual_expense, max: maxBar, color: 'var(--red-600)', tag: 'actual', textColor: 'var(--danger)' },
                  ].map(bar => (
                    <div key={bar.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {bar.label}
                          {bar.tag === 'actual' && (
                            <span className="badge badge-green" style={{ marginLeft: '0.4rem', fontSize: '0.6rem' }}>actual</span>
                          )}
                        </span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: bar.textColor }}>{fmt(bar.value)}</span>
                      </div>
                      <div className="progress-bar" style={{ height: '7px' }}>
                        <div style={{
                          height: '100%', borderRadius: '99px',
                          background: bar.color,
                          width: `${pct(bar.value, bar.max)}%`,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {(forecast.forecast_income?.length ?? 0) > 0 && (
                <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3>Income Sources</h3>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#34d399' }}>{fmt(forecast.total_expected_income)}</span>
                  </div>
                  <div className="list">
                    {(forecast.forecast_income ?? []).map((item, i) => (
                      <div key={i} className="list-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.88rem' }}>{item.label}</span>
                        </div>
                        <span className="amt-positive">{fmt(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(forecast.forecast_outgoing?.length ?? 0) > 0 && (
                <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3>Outgoing Breakdown</h3>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fb7185' }}>− {fmt(forecast.total_expected_outgoing)}</span>
                  </div>
                  <div className="list">
                    {(forecast.forecast_outgoing ?? []).map((item, i) => (
                      <div key={i} className="list-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: '#f43f5e', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.88rem' }}>{item.label}</span>
                        </div>
                        <span className="amt-negative">− {fmt(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(forecast.forecast_income?.length ?? 0) === 0 && (forecast.forecast_outgoing?.length ?? 0) === 0 && txs.length === 0 && (
                <div className="glass empty-state">
                  <div className="empty-icon"><BarChart3 size={36} strokeWidth={1.5} /></div>
                  <p>No data for this month. Add income and bills to see your forecast.</p>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
                    <button className="btn-primary" onClick={() => navigate('/income')}>Add Income</button>
                    <button className="btn-glass" onClick={() => navigate('/expenses')}>Add Expenses</button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
