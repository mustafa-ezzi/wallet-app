import { useEffect, useState } from 'react'
import {
  fetchEntitlements,
  fetchPremiumStats,
  fetchPurchaseQueue,
  grantPremium,
  revokePremium,
  type OpsEntitlement,
  type PremiumStats,
  type PurchaseQueueItem,
} from '../api'

export function PremiumPage() {
  const [stats, setStats] = useState<PremiumStats | null>(null)
  const [rows, setRows] = useState<OpsEntitlement[]>([])
  const [queue, setQueue] = useState<PurchaseQueueItem[]>([])
  const [count, setCount] = useState(0)
  const [status, setStatus] = useState('live')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [username, setUsername] = useState('')
  const [productId, setProductId] = useState('premium_monthly')
  const [days, setDays] = useState('30')
  const [note, setNote] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [s, list, q] = await Promise.all([
        fetchPremiumStats(),
        fetchEntitlements({ status: status || undefined, page_size: 50 }),
        fetchPurchaseQueue({ page_size: 20 }),
      ])
      setStats(s)
      setRows(list.results)
      setCount(list.count)
      setQueue(q.results)
    } catch {
      setError('Failed to load premium data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [status])

  async function onGrant(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) {
      setError('Enter a username to grant.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await grantPremium({
        username: username.trim(),
        product_id: productId,
        days: productId === 'premium_lifetime' ? undefined : Number(days) || 30,
        note: note.trim() || undefined,
        source: 'manual_grant',
      })
      setUsername('')
      setNote('')
      await load()
    } catch {
      setError('Grant failed — check username and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onRevoke(id: number) {
    if (!window.confirm('Revoke this entitlement?')) return
    setBusy(true)
    try {
      await revokePremium(id)
      await load()
    } catch {
      setError('Revoke failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Premium</h1>
          <p>Play Billing + manual grants — who is Premium, never what they spend in WalletTrails.</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="live">Live</option>
          <option value="active">Active (incl. expired clock)</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
          <option value="">All</option>
        </select>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {stats ? (
        <div className="grid" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="label">Live premium</div>
            <div className="value">{stats.live_premium}</div>
          </div>
          <div className="card">
            <div className="label">Monthly / Yearly / Lifetime</div>
            <div className="value">
              {stats.live_monthly} / {stats.live_yearly} / {stats.live_lifetime}
            </div>
          </div>
          <div className="card">
            <div className="label">Play / Manual</div>
            <div className="value">
              {stats.play_live} / {stats.manual_grants_live}
            </div>
          </div>
          <div className="card">
            <div className="label">Failed verifies</div>
            <div className="value">{stats.pending_or_failed_purchases}</div>
          </div>
        </div>
      ) : null}

      {!stats?.play_verify_configured ? (
        <p className="note">
          Play verification is not configured yet. Set <code>GOOGLE_PLAY_SERVICE_ACCOUNT_JSON</code> on
          Railway (or use manual grants below). Client purchases will fail until then.
        </p>
      ) : null}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Manual grant</h2>
        <form onSubmit={(e) => void onGrant(e)} className="form-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ minWidth: 160 }}
          />
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="premium_monthly">Monthly</option>
            <option value="premium_yearly">Yearly</option>
            <option value="premium_lifetime">Lifetime</option>
          </select>
          {productId !== 'premium_lifetime' ? (
            <input
              type="number"
              min={1}
              placeholder="Days"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              style={{ width: 88 }}
            />
          ) : null}
          <input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ minWidth: 180, flex: 1 }}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : 'Grant'}
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Product</th>
              <th>Source</th>
              <th>Status</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No entitlements ({count}).
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    @{row.username}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {row.email}
                    </div>
                  </td>
                  <td>{row.product_id}</td>
                  <td>{row.source}</td>
                  <td>
                    {row.is_live ? <span className="badge ok">live</span> : <span className="badge">{row.status}</span>}
                  </td>
                  <td>{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : '—'}</td>
                  <td>
                    {row.is_live || row.status === 'active' ? (
                      <button className="btn" type="button" disabled={busy} onClick={() => void onRevoke(row.id)}>
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {queue.length > 0 ? (
        <>
          <h2 style={{ marginTop: 28, fontSize: 16 }}>Failed / pending Play verifies</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Error</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((ev) => (
                  <tr key={ev.id}>
                    <td>@{ev.username}</td>
                    <td>{ev.product_id}</td>
                    <td>{ev.status}</td>
                    <td className="muted">{ev.error || '—'}</td>
                    <td>{ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
