import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function AppShell() {
  const { user, loading, logout } = useAuth()

  if (loading) {
    return (
      <div className="login-wrap">
        <p className="muted">Loading Ops…</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>WalletTrails Ops</strong>
          <span>Phase 0–5</span>
        </div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/premium">Premium</NavLink>
          <NavLink to="/promos">Promos</NavLink>
          <NavLink to="/campaigns">Notifications</NavLink>
          <NavLink to="/ads">Ads & Config</NavLink>
          <NavLink to="/support">Support</NavLink>
          <NavLink to="/audit">Audit</NavLink>
        </nav>
        <div className="meta">
          <div>Signed in as @{user.username}</div>
          <button className="btn" type="button" style={{ marginTop: 10 }} onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
