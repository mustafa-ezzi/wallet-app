import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchCampaign, type OpsCampaign } from '../api'

export function CampaignDetailPage() {
  const { id } = useParams()
  const campaignId = Number(id)
  const [campaign, setCampaign] = useState<OpsCampaign | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isFinite(campaignId)) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchCampaign(campaignId)
        if (!cancelled) setCampaign(data)
      } catch {
        if (!cancelled) setError('Campaign not found.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [campaignId])

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
      </div>
      {error ? <p className="error">{error}</p> : null}
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
