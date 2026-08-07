import { useEffect, useState } from 'react'
import { fetchAuditLog, type OpsAuditRow } from '../api'

export function AuditPage() {
  const [rows, setRows] = useState<OpsAuditRow[]>([])
  const [count, setCount] = useState(0)
  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchAuditLog({ page_size: 50, q: q || undefined })
        if (!cancelled) {
          setRows(data.results)
          setCount(data.count)
        }
      } catch {
        if (!cancelled) setError('Failed to load audit log.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [q])

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Audit</h1>
          <p>{count} staff actions · grants, pushes, suspends, config changes</p>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search action, actor, target…"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setQ(qDraft.trim())
          }}
        />
        <button className="btn" type="button" onClick={() => setQ(qDraft.trim())}>
          Search
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Meta</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No audit rows.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                  <td>{r.actor_username ? `@${r.actor_username}` : '—'}</td>
                  <td>
                    <code>{r.action}</code>
                  </td>
                  <td>
                    {r.target_type}
                    {r.target_id ? ` #${r.target_id}` : ''}
                  </td>
                  <td className="muted" style={{ maxWidth: 280, whiteSpace: 'normal', fontSize: 12 }}>
                    {Object.keys(r.meta || {}).length ? JSON.stringify(r.meta) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
