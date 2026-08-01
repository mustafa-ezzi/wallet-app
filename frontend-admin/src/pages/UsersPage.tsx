import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchOpsUsers, type OpsUser } from '../api'

function tierBadge(tier: string) {
  if (tier === 'none') return <span className="badge ok">active</span>
  if (tier === '7d') return <span className="badge warn">inactive 7d</span>
  if (tier === '30d') return <span className="badge warn">inactive 30d</span>
  return <span className="badge danger">inactive 90d</span>
}

export function UsersPage() {
  const [rows, setRows] = useState<OpsUser[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [qDraft, setQDraft] = useState('')
  const [q, setQ] = useState('')
  const [inactivity, setInactivity] = useState('')
  const [suspended, setSuspended] = useState('')
  const [push, setPush] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function applySearch() {
    setPage(1)
    setQ(qDraft.trim())
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchOpsUsers({
          page,
          page_size: 25,
          q: q || undefined,
          inactivity: inactivity || undefined,
          suspended: suspended || undefined,
          push: push || undefined,
        })
        if (!cancelled) {
          setRows(data.results)
          setCount(data.count)
        }
      } catch {
        if (!cancelled) setError('Failed to load users.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, q, inactivity, suspended, push])

  const totalPages = Math.max(1, Math.ceil(count / 25))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Hosted users</h1>
          <p>
            {count} accounts · privacy-safe summaries only
          </p>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search name, email, username"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applySearch()
          }}
        />
        <button className="btn" type="button" onClick={applySearch}>
          Search
        </button>
        <select
          value={inactivity}
          onChange={(e) => {
            setPage(1)
            setInactivity(e.target.value)
          }}
        >
          <option value="">All activity</option>
          <option value="none">Active</option>
          <option value="7d">Inactive 7d</option>
          <option value="30d">Inactive 30d</option>
          <option value="90d">Inactive 90d</option>
        </select>
        <select
          value={suspended}
          onChange={(e) => {
            setPage(1)
            setSuspended(e.target.value)
          }}
        >
          <option value="">Any status</option>
          <option value="0">Not suspended</option>
          <option value="1">Suspended</option>
        </select>
        <select
          value={push}
          onChange={(e) => {
            setPage(1)
            setPush(e.target.value)
          }}
        >
          <option value="">Any push</option>
          <option value="1">Has device</option>
          <option value="0">No device</option>
        </select>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>S.No</th>
              <th>User</th>
              <th>Joined</th>
              <th>Last seen</th>
              <th>Activity</th>
              <th>Push</th>
              <th>Wallets*</th>
              <th>Tx count (30d)*</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No users match.
                </td>
              </tr>
            ) : (
              rows.map((u, idx) => (
                <tr key={u.id}>
                  <td>{(page - 1) * 25 + idx + 1}</td>
                  <td>
                    <Link to={`/users/${u.id}`}>
                      <strong>{u.username}</strong>
                    </Link>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      {u.email || '—'}
                    </div>
                  </td>
                  <td>{u.date_joined ? new Date(u.date_joined).toLocaleDateString() : '—'}</td>
                  <td>{u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : '—'}</td>
                  <td>{tierBadge(u.inactivity_tier)}</td>
                  <td>
                    {u.push_enabled ? (
                      <span className="badge ok">{u.platforms.join(', ') || 'yes'}</span>
                    ) : (
                      <span className="badge">none</span>
                    )}
                  </td>
                  <td>{u.wallet_count}</td>
                  <td>{u.tx_count_30d}</td>
                  <td>
                    {u.suspended ? (
                      <span className="badge danger">suspended</span>
                    ) : (
                      <span className="badge ok">active</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button className="btn" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span className="muted">
          Page {page} / {totalPages}
        </span>
        <button
          className="btn"
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      <p className="note">
        * Counts only — amounts are never shown in Ops.
        <br />
        <strong>Tx count (30d)</strong> = how many transactions that user created/synced with a date in the last 30 days
        (not money amounts).
        <br />
        Activity uses last API use, login, push-device ping, or latest transaction — not “days since signup”.
      </p>
    </div>
  )
}
