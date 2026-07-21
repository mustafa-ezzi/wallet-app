import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { forecastApi } from '../api/client'
import { fmt, fmtBalance } from '../utils/format'

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

const MONTH_NAMES = [
  'January','February','March','April','May',
  'June','July','August','September','October','November','December'
]


function pct(part: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

export default function Reports() {
  const now = new Date()
  const navigate = useNavigate()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [loading, setLoading]   = useState(true)

  const loadForecast = () => {
    setLoading(true)
    forecastApi.get(year, month).then(r => setForecast(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadForecast() }, [year, month])

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  const maxBar = Math.max(forecast?.total_expected_income ?? 0, forecast?.total_expected_outgoing ?? 0, 1)
  const net = forecast?.net_forecast ?? 0
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Reports</h1>
          <p className="page-subtitle">Analyze your forecasts vs actuals.</p>
        </div>
        <button
          className="btn-glass"
          style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }}
          onClick={() => navigate('/expenses')}
        >
          Manage Expenses →
        </button>
      </div>

      {/* Month selector */}
      <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
        <button className="btn-icon" onClick={prevMonth}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{MONTH_NAMES[month - 1]} {year}</span>
          {isCurrentMonth && <div style={{ fontSize: '0.7rem', color: 'var(--primary-light)', marginTop: '0.15rem' }}>Current month</div>}
        </div>
        <button className="btn-icon" onClick={nextMonth}>›</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : !forecast ? null : (
        <>
          {/* ── Net forecast hero ── */}
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

          {/* ── Actual vs Forecast bars ── */}
          <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ marginBottom: '0.85rem' }}>Forecast vs Actual</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { label: 'Expected Income',   value: forecast.total_expected_income,   max: maxBar, color: 'var(--green-100)', tag: 'forecast', textColor: 'var(--green-700)' },
                { label: 'Actual Income',     value: forecast.actual_income,           max: maxBar, color: 'var(--green-700)', tag: 'actual', textColor: 'var(--success)' },
                { label: 'Expected Outgoing', value: forecast.total_expected_outgoing, max: maxBar, color: '#f5c4c0', tag: 'forecast', textColor: 'var(--text-secondary)' },
                { label: 'Actual Expense',    value: forecast.actual_expense,          max: maxBar, color: 'var(--red-600)', tag: 'actual', textColor: 'var(--danger)' },
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

            {isCurrentMonth && (
              <div style={{ marginTop: '1rem', padding: '0.6rem 0.75rem', background: 'var(--green-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-2)' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Actual net so far this month:&nbsp;
                  <span className={forecast.actual_net >= 0 ? 'amt-positive' : 'amt-negative'} style={{ fontSize: '0.85rem' }}>
                    {forecast.actual_net >= 0 ? '+' : ''}{fmtBalance(forecast.actual_net)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Income breakdown ── */}
          {forecast.forecast_income.length > 0 && (
            <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3>Income Sources</h3>
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#34d399' }}>{fmt(forecast.total_expected_income)}</span>
              </div>
              <div className="list">
                {forecast.forecast_income.map((item, i) => (
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

          {/* ── Outgoing breakdown ── */}
          {forecast.forecast_outgoing.length > 0 && (
            <div className="glass" style={{ padding: '1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3>Outgoing Breakdown</h3>
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fb7185' }}>− {fmt(forecast.total_expected_outgoing)}</span>
              </div>
              <div className="list">
                {forecast.forecast_outgoing.map((item, i) => (
                  <div key={i} className="list-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: '#f43f5e', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.88rem' }}>{item.label}</span>
                    </div>
                    <span className="amt-negative">− {fmt(item.amount)}</span>
                  </div>
                ))}
              </div>
              {/* Manage link */}
              <div style={{ marginTop: '0.85rem', textAlign: 'center' }}>
                <button
                  onClick={() => navigate('/expenses')}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Manage recurring expenses & loans →
                </button>
              </div>
            </div>
          )}

          {/* Empty state when nothing is configured */}
          {forecast.forecast_income.length === 0 && forecast.forecast_outgoing.length === 0 && (
            <div className="glass empty-state">
              <div className="empty-icon">📈</div>
              <p>No data for this month. Add projects and expenses to see your forecast.</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={() => navigate('/projects')}>Add Projects</button>
                <button className="btn-glass" onClick={() => navigate('/expenses')}>Add Expenses</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
