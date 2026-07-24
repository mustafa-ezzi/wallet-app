import { useCallback, useEffect, useState } from 'react'
import { householdsApi, apiErrorMessage } from '../api/client'
import { fmt } from '../utils/format'

export interface SettlementData {
  member_count: number
  total_expenses: number
  total_contributions: number
  fair_share: number
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
  /** When true, show Split equal results immediately */
  autoLoad?: boolean
}

export default function HouseholdSettlementPanel({ ledgerId, refreshKey = 0, autoLoad = false }: Props) {
  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shown, setShown] = useState(autoLoad)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await householdsApi.settlement(ledgerId)
      setData(res.data)
      setShown(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not compute split.'))
    } finally {
      setLoading(false)
    }
  }, [ledgerId])

  useEffect(() => {
    if (autoLoad || shown) load()
  }, [load, refreshKey, autoLoad, shown])

  const markSettled = async (t: SettlementData['transfers'][0]) => {
    try {
      const res = await householdsApi.markSettlement(ledgerId, {
        from_user_id: t.from_user_id,
        to_user_id: t.to_user_id,
        amount: t.amount,
        note: 'Settled outside CashTrail',
      })
      setData(res.data.settlement)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not mark settled.'))
    }
  }

  return (
    <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-md)', marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Split equal</h3>
        {!shown ? (
          <button type="button" className="btn-primary" style={{ fontSize: '0.82rem' }} disabled={loading} onClick={load}>
            {loading ? '…' : 'Split equal'}
          </button>
        ) : (
          <button type="button" className="btn-glass" style={{ fontSize: '0.78rem' }} disabled={loading} onClick={load}>
            Refresh
          </button>
        )}
      </div>

      {error && <div className="auth-error" style={{ marginBottom: '0.65rem' }}>{error}</div>}

      {loading && !data && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
          <div className="spinner spinner-dark" style={{ width: '1.5rem', height: '1.5rem' }} />
        </div>
      )}

      {shown && data && (
        <>
          <p className="text-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
            Fair share {fmt(data.fair_share)} each ({data.member_count} members) · expenses {fmt(data.total_expenses)}
            {data.total_contributions > 0 ? ` · pot ${fmt(data.total_contributions)}` : ''}
          </p>

          <div className="text-muted" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Member credits</div>
          <div className="list" style={{ marginBottom: '0.85rem' }}>
            {data.credits.map(c => (
              <div key={c.user_id} className="list-item" style={{ padding: '0.45rem 0', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.name}</div>
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                    Paid {fmt(c.expenses_paid)}
                    {c.contributions > 0 ? ` + pot ${fmt(c.contributions)}` : ''}
                    {' = '}credit {fmt(c.credit)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    style={{ fontWeight: 800, fontSize: '0.85rem' }}
                    className={c.net > 0 ? 'amt-positive' : c.net < 0 ? 'amt-negative' : undefined}
                  >
                    {c.net > 0 ? `+${fmt(c.net)}` : c.net < 0 ? fmt(c.net) : fmt(0)}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                    {c.meaning === 'owed' ? 'owed' : c.meaning === 'owes' ? 'owes' : 'settled'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data.transfers.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>Everyone is even — nothing to settle.</p>
          ) : (
            <>
              <div className="text-muted" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Who pays whom</div>
              <div className="list" style={{ marginBottom: '0.65rem' }}>
                {data.transfers.map((t, i) => (
                  <div key={`${t.from_user_id}-${t.to_user_id}-${i}`} className="list-item" style={{ padding: '0.5rem 0', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        {t.from_name} → {t.to_name}
                      </div>
                      {t.settled && (
                        <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>
                          Marked settled{t.mark_note ? ` · ${t.mark_note}` : ''}
                        </span>
                      )}
                    </div>
                    <span style={{ fontWeight: 800 }}>{fmt(t.amount)}</span>
                    {!t.settled && (
                      <button
                        type="button"
                        className="btn-glass"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => markSettled(t)}
                      >
                        Mark settled
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-muted" style={{ fontSize: '0.72rem', margin: 0 }}>{data.disclaimer}</p>
        </>
      )}
    </div>
  )
}
