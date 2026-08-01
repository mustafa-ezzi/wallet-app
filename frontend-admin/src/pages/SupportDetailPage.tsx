import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchSupportThread,
  replySupportThread,
  setSupportStatus,
  type SupportThread,
} from '../api'

export function SupportDetailPage() {
  const { id } = useParams()
  const threadId = Number(id)
  const [thread, setThread] = useState<SupportThread | null>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError(null)
    try {
      setThread(await fetchSupportThread(threadId))
    } catch {
      setError('Ticket not found.')
      setThread(null)
    }
  }

  useEffect(() => {
    if (!Number.isFinite(threadId)) return
    void load()
  }, [threadId])

  async function onReply(e: FormEvent, close = false) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    try {
      const next = await replySupportThread(threadId, { body: body.trim(), close })
      setThread(next)
      setBody('')
    } catch {
      setError('Reply failed.')
    } finally {
      setBusy(false)
    }
  }

  async function onClose() {
    setBusy(true)
    try {
      setThread(await setSupportStatus(threadId, 'closed'))
    } catch {
      setError('Could not close ticket.')
    } finally {
      setBusy(false)
    }
  }

  if (!Number.isFinite(threadId)) {
    return <p className="error">Invalid ticket.</p>
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link to="/support">← Support</Link>
          </p>
          <h1>{thread ? `#${thread.id} ${thread.subject}` : `Ticket #${id}`}</h1>
          <p>
            {thread ? (
              <>
                @{thread.username} · {thread.email || 'no email'} · {thread.category} · {thread.status}
              </>
            ) : (
              'Loading…'
            )}
          </p>
        </div>
        {thread && thread.status !== 'closed' ? (
          <button className="btn danger" type="button" disabled={busy} onClick={() => void onClose()}>
            Close ticket
          </button>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {!thread ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16, maxHeight: 420, overflow: 'auto' }}>
            {(thread.messages || []).map((m) => (
              <div
                key={m.id}
                style={{
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: 12,
                  background:
                    m.sender === 'staff' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--line)',
                }}
              >
                <div className="muted" style={{ fontSize: '0.78rem', marginBottom: 6 }}>
                  {m.sender === 'staff' ? `Staff${m.author_username ? ` (@${m.author_username})` : ''}` : 'User'}
                  {' · '}
                  {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
              </div>
            ))}
          </div>

          {thread.status !== 'closed' ? (
            <form className="card" onSubmit={(e) => void onReply(e, false)}>
              <div className="field">
                <label htmlFor="reply">Your reply</label>
                <textarea
                  id="reply"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  required
                  maxLength={4000}
                  style={{
                    width: '100%',
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    color: 'var(--text)',
                    padding: 12,
                    resize: 'vertical',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn primary" type="submit" disabled={busy}>
                  Send reply
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={(e) => void onReply(e as unknown as FormEvent, true)}
                >
                  Reply & close
                </button>
              </div>
            </form>
          ) : (
            <p className="note">This ticket is closed.</p>
          )}
        </>
      )}
    </div>
  )
}
