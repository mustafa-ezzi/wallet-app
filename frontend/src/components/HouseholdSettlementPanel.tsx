import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { householdsApi, apiErrorMessage } from '../api/client'
import { fmt } from '../utils/format'
import { track } from '../lib/analytics'

export interface SettlementData {
  member_count: number
  total_expenses: number
  total_contributions: number
  fair_share: number
  external_paid?: number
  is_even?: boolean
  summary_line?: string
  disclaimer: string
  credits: {
    user_id: number
    name: string
    expenses_paid: number
    contributions: number
    credit: number
    fair_share: number
    net: number
    meaning: string
  }[]
  transfers: {
    from_user_id: number
    from_name: string
    to_user_id: number
    to_name: string
    amount: number
    settled: boolean
    mark_id: number | null
    mark_note: string
  }[]
}

interface Props {
  ledgerId: number
  refreshKey?: number
}

function balanceLabel(net: number): string {
  if (Math.abs(net) < 0.01) return 'All square'
  if (net > 0) return `Gets back ${fmt(net)}`
  return `Owes ${fmt(Math.abs(net))}`
}

export default function HouseholdSettlementPanel({ ledgerId, refreshKey = 0 }: Props) {
  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await householdsApi.settlement(ledgerId)
      setData(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load settle-up.'))
    } finally {
      setLoading(false)
    }
  }, [ledgerId])

  useEffect(() => {
    track('household_split_equal_viewed')
    void load()
  }, [load, refreshKey])

  const markSettled = async (t: SettlementData['transfers'][0]) => {
    try {
      const res = await householdsApi.markSettlement(ledgerId, {
        from_user_id: t.from_user_id,
        to_user_id: t.to_user_id,
        amount: t.amount,
        note: 'Paid outside WalletTrails',
      })
      setData(res.data.settlement)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not mark as paid.'))
    }
  }

  if (loading && !data) {
    return (
      <div className="glass" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
        <div className="spinner spinner-dark" style={{ width: '1.5rem', height: '1.5rem', margin: '0 auto' }} />
        <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.75rem 0 0' }}>Calculating equal split…</p>
      </div>
    )
  }

  return (
    <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Settle up</h3>
          <p className="text-muted" style={{ fontSize: '0.78rem', margin: '0.25rem 0 0' }}>
            Split everything equally — who paid more gets paid back.
          </p>
        </div>
        <button type="button" className="btn-glass" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} disabled={loading} onClick={load}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: '0.65rem' }}>{error}</div>}

      {data && (
        <>
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2, rgba(0,0,0,0.03))',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: '0.2rem' }}>
              {fmt(data.total_expenses)} total
            </div>
            <div className="text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.45 }}>
              {data.member_count} {data.member_count === 1 ? 'person' : 'people'} · everyone pays{' '}
              <strong style={{ color: 'inherit' }}>{fmt(data.fair_share)}</strong>
              {data.total_contributions > 0 ? (
                <> · shared pot {fmt(data.total_contributions)}</>
              ) : null}
            </div>
            {(data.external_paid ?? 0) > 0 ? (
              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.35rem' }}>
                {fmt(data.external_paid!)} was paid by someone outside this household (still counts in the total).
              </div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
            {data.credits.map(c => (
              <div
                key={c.user_id}
                style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border, rgba(0,0,0,0.08))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.name}</div>
                  <div className="text-muted" style={{ fontSize: '0.74rem', marginTop: '0.15rem' }}>
                    Put in {fmt(c.credit)}
                    {c.contributions > 0 && c.expenses_paid > 0
                      ? ` (${fmt(c.expenses_paid)} wallet + ${fmt(c.contributions)} pot)`
                      : c.contributions > 0
                        ? ` (${fmt(c.contributions)} pot)`
                        : c.expenses_paid > 0
                          ? ` (${fmt(c.expenses_paid)} wallet)`
                          : ''}
                    {' · share '}{fmt(c.fair_share)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    style={{ fontWeight: 800, fontSize: '0.88rem' }}
                    className={c.net > 0.01 ? 'amt-positive' : c.net < -0.01 ? 'amt-negative' : undefined}
                  >
                    {balanceLabel(c.net)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data.transfers.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0' }}>
              <CheckCircle2 size={18} className="amt-positive" />
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Everyone is even — no payments needed.</span>
            </div>
          ) : (
            <>
              <div className="text-muted" style={{ fontSize: '0.72rem', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Pay these people
              </div>
              <div className="list" style={{ marginBottom: '0.65rem' }}>
                {data.transfers.map((t, i) => (
                  <div
                    key={`${t.from_user_id}-${t.to_user_id}-${i}`}
                    style={{
                      padding: '0.65rem 0',
                      borderBottom: i < data.transfers.length - 1 ? '1px solid var(--border, rgba(0,0,0,0.06))' : undefined,
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                        {t.from_name} pays {t.to_name}
                      </div>
                      {t.settled ? (
                        <span className="badge badge-green" style={{ fontSize: '0.62rem', marginTop: '0.2rem' }}>
                          Marked paid{t.mark_note ? ` · ${t.mark_note}` : ''}
                        </span>
                      ) : (
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>Tap when done in cash or bank transfer</div>
                      )}
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{fmt(t.amount)}</span>
                    {!t.settled && (
                      <button type="button" className="btn-primary" style={{ fontSize: '0.75rem' }} onClick={() => markSettled(t)}>
                        Mark paid
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-muted" style={{ fontSize: '0.72rem', margin: 0, lineHeight: 1.4 }}>{data.disclaimer}</p>
        </>
      )}
    </div>
  )
}
