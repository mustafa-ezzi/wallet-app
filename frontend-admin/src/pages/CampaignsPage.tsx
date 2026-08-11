import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  cancelCampaign,
  createCampaign,
  estimateCampaignAudience,
  fetchCampaigns,
  sendCampaign,
  type CampaignEstimate,
  type OpsCampaign,
} from '../api'

const AUDIENCES = [
  { value: 'all', label: 'All opted-in with a device' },
  { value: 'android', label: 'Android only' },
  { value: 'inactive_7d', label: 'Inactive 7d+' },
  { value: 'inactive_30d', label: 'Inactive 30d+' },
  { value: 'inactive_90d', label: 'Inactive 90d+' },
]

const ROUTES = [
  { value: '', label: 'Open app (default)' },
  { value: 'home', label: 'Home' },
  { value: 'wallets', label: 'Wallets' },
  { value: 'bills', label: 'Bills' },
  { value: 'income', label: 'Income' },
  { value: 'reports', label: 'Reports' },
  { value: 'family', label: 'Family' },
  { value: 'household', label: 'Family (household)' },
  { value: 'settings', label: 'Settings' },
]

const TEMPLATES = [
  {
    id: 'reengage_7d',
    label: 'Re-engage 7d',
    title: 'Your CashTrail is waiting',
    body: 'Open the app to sync wallets and stay on top of bills.',
    audience: 'inactive_7d',
    route: 'home',
  },
  {
    id: 'reengage_30d',
    label: 'Win-back 30d',
    title: 'We miss your CashTrail',
    body: 'Come back — your money history is safe. Tap to open.',
    audience: 'inactive_30d',
    route: 'home',
  },
  {
    id: 'reengage_90d',
    label: 'Win-back 90d',
    body: 'Your wallets are still here when you are ready. Open CashTrail anytime.',
    title: 'Still keeping your rupees?',
    audience: 'inactive_90d',
    route: 'home',
  },
  {
    id: 'whats_new',
    label: "What's new",
    title: 'CashTrail update',
    body: 'Widgets and reports got sharper — open the app to try them.',
    audience: 'all',
    route: 'home',
  },
]

function statusBadge(status: string) {
  if (status === 'sent') return <span className="badge ok">{status}</span>
  if (status === 'failed' || status === 'cancelled') return <span className="badge danger">{status}</span>
  if (status === 'scheduled' || status === 'sending') return <span className="badge warn">{status}</span>
  return <span className="badge">{status}</span>
}

export function CampaignsPage() {
  const [rows, setRows] = useState<OpsCampaign[]>([])
  const [count, setCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [route, setRoute] = useState('')
  const [estimate, setEstimate] = useState<CampaignEstimate | null>(null)

  async function load() {
    setError(null)
    try {
      const data = await fetchCampaigns({ page_size: 50 })
      setRows(data.results)
      setCount(data.count)
    } catch {
      setError('Failed to load campaigns.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const est = await estimateCampaignAudience(audience)
        if (!cancelled) setEstimate(est)
      } catch {
        if (!cancelled) setEstimate(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [audience])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const campaign = await createCampaign({
        title: title.trim(),
        body: body.trim(),
        audience,
        data: route ? { route } : {},
      })
      setTitle('')
      setBody('')
      setMessage(`Draft #${campaign.id} created. Review estimate, then Send.`)
      await load()
    } catch {
      setError('Could not create campaign.')
    } finally {
      setBusy(false)
    }
  }

  async function onDryRun(id: number) {
    setBusy(true)
    setError(null)
    try {
      const result = await sendCampaign(id, { dry_run: true })
      setMessage(
        `Dry run #${id}: ~${result.users ?? 0} users / ${result.tokens ?? 0} devices would be notified.`,
      )
    } catch {
      setError('Dry run failed.')
    } finally {
      setBusy(false)
    }
  }

  async function onSend(id: number) {
    const ok = window.confirm(
      'Send this push to all matching opted-in users now? This cannot be undone.',
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await sendCampaign(id, { confirm: true })
      setMessage(
        result.ok
          ? `Sent #${id}: ${result.sent_ok} ok, ${result.sent_failed} failed.`
          : `Send failed: ${result.detail || 'unknown error'}`,
      )
      await load()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Send failed.')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function onCancel(id: number) {
    setBusy(true)
    try {
      await cancelCampaign(id)
      await load()
    } catch {
      setError('Cancel failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p>Broadcast updates to opted-in users · max {estimate?.max_campaigns_per_day ?? 20}/day</p>
        </div>
        <button className="btn" type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="note">{message}</p> : null}

      <form className="card" onSubmit={onCreate} style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          Compose campaign
        </div>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="btn"
              type="button"
              onClick={() => {
                setTitle(t.title)
                setBody(t.body)
                setAudience(t.audience)
                setRoute(t.route)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            placeholder="CashTrail update"
          />
        </div>
        <div className="field">
          <label htmlFor="body">Body</label>
          <input
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={400}
            required
            placeholder="Widgets are sharper — open the app to sync."
          />
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <select value={route} onChange={(e) => setRoute(e.target.value)}>
            {ROUTES.map((r) => (
              <option key={r.value || 'default'} value={r.value}>
                Tap opens: {r.label}
              </option>
            ))}
          </select>
          <button className="btn primary" type="submit" disabled={busy}>
            Save draft
          </button>
        </div>
        {estimate ? (
          <p className="muted" style={{ margin: '12px 0 0', fontSize: '0.9rem' }}>
            Audience estimate: <strong>{estimate.users}</strong> users / {estimate.tokens} devices · sent
            today {estimate.campaigns_sent_today}/{estimate.max_campaigns_per_day}
          </p>
        ) : null}
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Campaign</th>
              <th>Audience</th>
              <th>Status</th>
              <th>Estimate</th>
              <th>Results</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No campaigns yet ({count}).
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/campaigns/${c.id}`}>#{c.id}</Link>
                  </td>
                  <td>
                    <strong>{c.title}</strong>
                    <div className="muted" style={{ fontSize: '0.8rem', maxWidth: 280, whiteSpace: 'normal' }}>
                      {c.body}
                    </div>
                  </td>
                  <td>{c.audience}</td>
                  <td>{statusBadge(c.status)}</td>
                  <td>{c.recipient_estimate}</td>
                  <td>
                    {c.status === 'sent' || c.status === 'failed'
                      ? `${c.sent_ok} ok / ${c.sent_failed} fail`
                      : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(c.status === 'draft' || c.status === 'scheduled') && (
                        <>
                          <button className="btn" type="button" disabled={busy} onClick={() => void onDryRun(c.id)}>
                            Dry run
                          </button>
                          <button className="btn primary" type="button" disabled={busy} onClick={() => void onSend(c.id)}>
                            Send
                          </button>
                          <button className="btn danger" type="button" disabled={busy} onClick={() => void onCancel(c.id)}>
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="note">
        Only users with a registered Expo push token and <strong>product updates</strong> enabled in the app
        receive broadcasts. Due-date reminders are separate.
        If estimate is <strong>0 devices</strong>, nobody has linked push yet — install a native EAS APK
        (with Firebase FCM), then Settings → <em>Link this device for push</em>. See{' '}
        <code>mobile/PUSH_SETUP.md</code>.
      </p>
    </div>
  )
}
