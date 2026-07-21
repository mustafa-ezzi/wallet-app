import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import AddTransactionModal from './AddTransactionModal'

const NAV = [
  { path: '/',          label: 'Overview',      icon: '⊞' },
  { path: '/accounts',  label: 'Accounts',      icon: '🏛' },
  { path: '/projects',  label: 'Projects',      icon: '📁' },
  { path: '/expenses',  label: 'Bills & Loans', icon: '🧾' },
  { path: '/reports',   label: 'Reports',       icon: '📊' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleAdded = () => { setShowAdd(false); setRefreshKey(k => k + 1) }

  const initials = user
    ? ((user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '')).toUpperCase() || user.email[0].toUpperCase()
    : '?'

  const currentNav = NAV.find(n => n.path === location.pathname) ?? NAV[0]

  return (
    <div className="app-shell" key={refreshKey}>

      {/* ── Mobile top header ── */}
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <div className="mobile-header-logo">W</div>
          <span className="mobile-header-title">Wallet</span>
        </div>
        <button className="mobile-header-settings" aria-label="Settings">⚙</button>
      </header>

      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">W</div>
          <div>
            <div className="sidebar-title">Wallet</div>
            <div className="sidebar-subtitle">Personal Finance</div>
          </div>
        </div>

        <button className="sidebar-add-btn" onClick={() => setShowAdd(true)}>
          + Add Transaction
        </button>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {NAV.map(n => (
            <button
              key={n.path}
              className={`sidebar-nav-item ${location.pathname === n.path ? 'active' : ''}`}
              onClick={() => navigate(n.path)}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div>
              <div className="sidebar-user-name">
                {user?.first_name ? `${user.first_name} ${user.last_name ?? ''}`.trim() : user?.username}
              </div>
              <div className="sidebar-user-email">{user?.email}</div>
            </div>
          </div>
          <button
            className="sidebar-nav-item"
            onClick={logout}
            style={{ color: 'var(--red-600)' }}
          >
            <span className="nav-icon">⏻</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main>
        <Outlet />
      </main>

      {/* ── Mobile FAB ── */}
      <button className="fab" onClick={() => setShowAdd(true)} aria-label="Add transaction">
        +
      </button>

      {/* ── Mobile floating pill nav ── */}
      <nav className="bottom-nav">
        {NAV.map(n => (
          <button
            key={n.path}
            className={`bottom-nav-item ${location.pathname === n.path ? 'active' : ''}`}
            onClick={() => navigate(n.path)}
          >
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label === 'Bills & Loans' ? 'Bills' : n.label}</span>
          </button>
        ))}
      </nav>

      {showAdd && (
        <AddTransactionModal onClose={() => setShowAdd(false)} onAdded={handleAdded} />
      )}
    </div>
  )
}
