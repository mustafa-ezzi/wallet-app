import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchCampaign, sendCampaign, type OpsCampaign } from '../api'

export function CampaignDetailPage() {
  const { id } = useParams()
  const campaignId = Number(id)
  const [campaign, setCampaign] = useState<OpsCampaign | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!Number.isFinite(campaignId)) return
    try {
      const data = await fetchCampaign(campaignId)
      setCampaign(data)
      setError(null)
    } catch {
      setError('Campaign not found.')
    }
  }

  useEffect(() => {
    void load()
  }, [campaignId])

  async function onRetry() {
    if (!campaign) return
    const ok = window.confirm('Retry sending this push now?')
    if (!ok) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await sendCampaign(campaign.id, { confirm: true })
      setMessage(
        result.ok
          ? `Sent: ${result.sent_ok} ok, ${result.sent_failed} failed.`
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

  const canRetry =
    campaign && (campaign.status === 'failed' || campaign.status === 'draft' || campaign.status === 'scheduled')

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link to="/campaigns">← Notifications</Link>
          </p>
          <h1>{campaign ? campaign.title : `Campaign #${id}`}</h1>
          <p>Delivery summary — no user finance data.</p>
        </div>
        {canRetry ? (
          <button className="btn primary" type="button" disabled={busy} onClick={() => void onRetry()}>
            {campaign?.status === 'failed' ? 'Retry send' : 'Send now'}
          </button>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="note">{message}</p> : null}
      {!campaign ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="detail-grid">
          <div className="kv">
            <div className="k">Status</div>
            <div className="v">{campaign.status}</div>
          </div>
          <div className="kv">
            <div className="k">Audience</div>
            <div className="v">{campaign.audience}</div>
          </div>
          <div className="kv">
            <div className="k">Body</div>
            <div className="v">{campaign.body}</div>
          </div>
          <div className="kv">
            <div className="k">Deep link</div>
            <div className="v">{String((campaign.data as { route?: string })?.route || '—')}</div>
          </div>
          <div className="kv">
            <div className="k">Estimate (users)</div>
            <div className="v">{campaign.recipient_estimate}</div>
          </div>
          <div className="kv">
            <div className="k">Sent ok / failed</div>
            <div className="v">
              {campaign.sent_ok} / {campaign.sent_failed}
            </div>
          </div>
          <div className="kv">
            <div className="k">Deliveries</div>
            <div className="v">
              {campaign.deliveries_summary
                ? `ok ${campaign.deliveries_summary.ok} · fail ${campaign.deliveries_summary.failed} · skip ${campaign.deliveries_summary.skipped}`
                : '—'}
            </div>
          </div>
          <div className="kv">
            <div className="k">Created</div>
            <div className="v">
              {campaign.created_at ? new Date(campaign.created_at).toLocaleString() : '—'}
              {campaign.created_by_username ? ` · @${campaign.created_by_username}` : ''}
            </div>
          </div>
          {campaign.last_error ? (
            <div className="kv">
              <div className="k">Last error</div>
              <div className="v">{campaign.last_error}</div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
