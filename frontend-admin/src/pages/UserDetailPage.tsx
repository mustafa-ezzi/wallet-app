import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchOpsUser,
  suspendOpsUser,
  unsuspendOpsUser,
  type OpsUser,
} from '../api'

export function UserDetailPage() {
  const { id } = useParams()
  const userId = Number(id)
  const [user, setUser] = useState<OpsUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError(null)
    try {
      setUser(await fetchOpsUser(userId))
    } catch {
      setError('User not found or Ops API failed.')
      setUser(null)
    }
  }

  useEffect(() => {
    if (!Number.isFinite(userId)) return
    void load()
  }, [userId])

  async function toggleSuspend() {
    if (!user) return
    const ok = window.confirm(
      user.suspended
        ? `Unsuspend @${user.username}?`
        : `Suspend @${user.username}? They will not be able to sign in.`,
    )
    if (!ok) return
    setBusy(true)
    try {
      const next = user.suspended
        ? await unsuspendOpsUser(user.id)
        : await suspendOpsUser(user.id)
      setUser({ ...user, ...next })
    } catch {
      setError('Action failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!Number.isFinite(userId)) {
    return <p className="error">Invalid user id.</p>
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link to="/users">← Users</Link>
          </p>
          <h1>{user ? `@${user.username}` : 'User'}</h1>
          <p>Hosted profile summary — no ledger access.</p>
        </div>
        {user ? (
          <button
            className={`btn ${user.suspended ? 'primary' : 'danger'}`}
            type="button"
            disabled={busy || user.is_superuser}
            onClick={() => void toggleSuspend()}
          >
            {user.suspended ? 'Unsuspend' : 'Suspend'}
          </button>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {!user ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="detail-grid">
            <div className="kv">
              <div className="k">Email</div>
              <div className="v">{user.email || '—'}</div>
            </div>
            <div className="kv">
              <div className="k">Name</div>
              <div className="v">
                {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
              </div>
            </div>
            <div className="kv">
              <div className="k">Joined</div>
              <div className="v">
                {user.date_joined ? new Date(user.date_joined).toLocaleString() : '—'}
              </div>
            </div>
            <div className="kv">
              <div className="k">Last login</div>
              <div className="v">
                {user.last_login ? new Date(user.last_login).toLocaleString() : '—'}
              </div>
            </div>
            <div className="kv">
              <div className="k">Last seen</div>
              <div className="v">
                {user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : '—'}
              </div>
            </div>
            <div className="kv">
              <div className="k">Inactivity</div>
              <div className="v">{user.inactivity_tier}</div>
            </div>
            <div className="kv">
              <div className="k">Push devices</div>
              <div className="v">
                {user.device_count} · {user.platforms.join(', ') || 'none'}
              </div>
            </div>
            <div className="kv">
              <div className="k">Latest device</div>
              <div className="v">
                {user.latest_device
                  ? `${user.latest_device.platform} · ${new Date(user.latest_device.updated_at).toLocaleString()}`
                  : '—'}
              </div>
            </div>
            <div className="kv">
              <div className="k">Wallets (count)</div>
              <div className="v">{user.wallet_count}</div>
            </div>
            <div className="kv">
              <div className="k">Transactions 30d (count)</div>
              <div className="v">{user.tx_count_30d}</div>
            </div>
            <div className="kv">
              <div className="k">Status</div>
              <div className="v">{user.suspended ? 'Suspended' : 'Active'}</div>
            </div>
            <div className="kv">
              <div className="k">Staff</div>
              <div className="v">{user.is_staff ? 'Yes' : 'No'}</div>
            </div>
          </div>
          {user.internal_notes ? (
            <p className="note">Internal notes: {user.internal_notes}</p>
          ) : (
            <p className="note">
              Premium, ads config, and push campaigns are available in the Ops sidebar.
            </p>
          )}
        </>
      )}
    </div>
  )
}
