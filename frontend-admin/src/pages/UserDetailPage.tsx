import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteOpsUser,
  fetchOpsUser,
  suspendOpsUser,
  unsuspendOpsUser,
  type OpsUser,
} from '../api'

export function UserDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const userId = Number(id)
  const [user, setUser] = useState<OpsUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [showDelete, setShowDelete] = useState(false)

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

  async function onDelete() {
    if (!user) return
    if (confirmName.trim() !== user.username) {
      setError(`Type “${user.username}” exactly to confirm delete.`)
      return
    }
    const ok = window.confirm(
      `Permanently delete @${user.username} and ALL linked data?\n\n`
      + 'Wallets, transactions, bank SMS drafts, support threads, devices, entitlements, '
      + 'and their household contributions will be removed. This cannot be undone.',
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await deleteOpsUser(user.id, confirmName.trim())
      navigate('/users', { replace: true })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Delete failed.')
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={`btn ${user.suspended ? 'primary' : 'danger'}`}
              type="button"
              disabled={busy || user.is_superuser}
              onClick={() => void toggleSuspend()}
            >
              {user.suspended ? 'Unsuspend' : 'Suspend'}
            </button>
            <button
              className="btn danger"
              type="button"
              disabled={busy || user.is_superuser}
              onClick={() => {
                setShowDelete((v) => !v)
                setConfirmName('')
                setError(null)
              }}
            >
              Delete user
            </button>
          </div>
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
              <div className="k">Plan</div>
              <div className="v">
                {user.premium?.is_premium ? (
                  <span className="badge ok">
                    Premium{user.premium.product_id ? ` · ${user.premium.product_id}` : ''}
                  </span>
                ) : (
                  <span className="badge">Free</span>
                )}
              </div>
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

          {showDelete ? (
            <div
              className="note"
              style={{
                marginTop: '1.25rem',
                borderColor: '#f5c4c0',
                background: '#fff5f5',
              }}
            >
              <strong style={{ color: '#b91c1c' }}>Permanent delete</strong>
              <p style={{ margin: '0.5rem 0 0.85rem', lineHeight: 1.45 }}>
                This removes @{user.username} and all linked personal data (wallets, transactions,
                bank SMS, devices, support, entitlements, people links, and their household rows).
                Empty households they alone belonged to are removed. Superusers cannot be deleted.
              </p>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6 }}>
                Type <code>{user.username}</code> to confirm
              </label>
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={user.username}
                autoComplete="off"
                style={{ maxWidth: 320, width: '100%', marginBottom: 10 }}
                disabled={busy}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn danger"
                  type="button"
                  disabled={busy || confirmName.trim() !== user.username}
                  onClick={() => void onDelete()}
                >
                  {busy ? 'Deleting…' : 'Delete forever'}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setShowDelete(false)
                    setConfirmName('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
