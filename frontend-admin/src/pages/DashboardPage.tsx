import { useEffect, useState } from 'react'
import { fetchOpsDashboard, refreshInactivityFlags, type OpsDashboard } from '../api'

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}

export function DashboardPage() {
  const [data, setData] = useState<OpsDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError(null)
    try {
      setData(await fetchOpsDashboard())
    } catch {
      setError('Failed to load dashboard.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onRefreshFlags() {
    setBusy(true)
    try {
      await refreshInactivityFlags()
      await load()
    } catch {
      setError('Could not refresh inactivity flags.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Hosting metrics only — no money data.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="button" onClick={() => void load()}>
            Refresh
          </button>
          <button className="btn primary" type="button" disabled={busy} onClick={() => void onRefreshFlags()}>
            {busy ? 'Updating…' : 'Recompute inactivity'}
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="grid">
            <Stat label="Total users" value={data.users.total} />
            <Stat label="New (7d)" value={data.users.new_7d} />
            <Stat label="New (24h)" value={data.users.new_24h} />
            <Stat label="Active (7d)" value={data.users.active_7d} />
            <Stat label="Suspended" value={data.users.suspended} />
            <Stat label="Users w/ push" value={data.push.users_with_device} />
            <Stat label="Push tokens" value={data.push.total_tokens} />
            <Stat label="Inactive 7d" value={data.inactivity.tier_7d} />
            <Stat label="Inactive 30d" value={data.inactivity.tier_30d} />
            <Stat label="Inactive 90d" value={data.inactivity.tier_90d} />
            <Stat label="Wallets (count)" value={data.volume_counts_only.wallet_accounts} />
            <Stat label="Tx (30d count)" value={data.volume_counts_only.transactions_30d} />
            <Stat label="Support open" value={data.support?.open ?? 0} />
            <Stat label="Needs reply" value={data.support?.waiting_ops ?? 0} />
            <Stat label="Premium live" value={data.premium?.live ?? 0} />
          </div>
          <p className="note">
            Wallet and transaction figures are <strong>counts only</strong> — amounts and categories are never exposed
            to Ops. Generated {new Date(data.generated_at).toLocaleString()}.
          </p>
        </>
      )}
    </div>
  )
}
