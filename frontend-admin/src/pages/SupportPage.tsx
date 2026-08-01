import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSupportThreads, type SupportThread } from '../api'

function statusBadge(status: string) {
  if (status === 'waiting_ops') return <span className="badge warn">needs reply</span>
  if (status === 'waiting_user') return <span className="badge ok">waiting user</span>
  if (status === 'closed') return <span className="badge">closed</span>
  return <span className="badge">{status}</span>
}

export function SupportPage() {
  const [rows, setRows] = useState<SupportThread[]>([])
  const [count, setCount] = useState(0)
  const [status, setStatus] = useState('waiting_ops')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchSupportThreads({
          page_size: 50,
          status: status || undefined,
        })
        if (!cancelled) {
          setRows(data.results)
          setCount(data.count)
        }
      } catch {
        if (!cancelled) setError('Failed to load support inbox.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status])

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Support</h1>
          <p>{count} tickets · reply from here; users get a push when you answer</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="waiting_ops">Needs reply</option>
          <option value="waiting_user">Waiting on user</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="">All</option>
        </select>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>S.No</th>
              <th>Ticket</th>
              <th>User</th>
              <th>Category</th>
              <th>Status</th>
              <th>Updated</th>
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
                  No tickets in this filter.
                </td>
              </tr>
            ) : (
              rows.map((t, idx) => (
                <tr key={t.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <Link to={`/support/${t.id}`}>
                      <strong>#{t.id} {t.subject}</strong>
                    </Link>
                    <div className="muted" style={{ fontSize: '0.8rem', maxWidth: 320, whiteSpace: 'normal' }}>
                      {t.last_message_preview || '—'}
                    </div>
                  </td>
                  <td>
                    @{t.username}
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      {t.email || '—'}
                    </div>
                  </td>
                  <td>{t.category}</td>
                  <td>{statusBadge(t.status)}</td>
                  <td>{t.updated_at ? new Date(t.updated_at).toLocaleString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
