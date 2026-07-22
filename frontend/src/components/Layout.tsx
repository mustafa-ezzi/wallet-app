import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, type ReactNode } from 'react'
import {
  LayoutDashboard,
  Wallet,
  Briefcase,
  Receipt,
  BarChart3,
  LogOut,
  Plus,
  Download,
} from 'lucide-react'
import AddTransactionModal from './AddTransactionModal'
import InstallAppDialog from './InstallAppDialog'
import { usePwaInstall } from '../hooks/usePwaInstall'

const NAV: { path: string; label: string; icon: ReactNode }[] = [
  { path: '/',          label: 'Overview',      icon: <LayoutDashboard size={18} strokeWidth={1.75} /> },
  { path: '/accounts',  label: 'Accounts',      icon: <Wallet size={18} strokeWidth={1.75} /> },
  { path: '/projects',  label: 'Projects',      icon: <Briefcase size={18} strokeWidth={1.75} /> },
  { path: '/expenses',  label: 'Bills & Loans', icon: <Receipt size={18} strokeWidth={1.75} /> },
  { path: '/reports',   label: 'Reports',       icon: <BarChart3 size={18} strokeWidth={1.75} /> },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const pwa = usePwaInstall()

  const handleAdded = () => { setShowAdd(false); setRefreshKey(k => k + 1) }

  const initials = user
    ? (
        ((user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '')).toUpperCase()
        || (user.email?.[0] ?? user.username?.[0] ?? '?').toUpperCase()
      )
    : '?'

  const openInstall = () => {
    if (pwa.canPrompt) {
      void pwa.install()
    } else {
      pwa.setDialogOpen(true)
    }
  }

  return (
    <div className="app-shell" key={refreshKey}>

      {/* ── Mobile top header ── */}
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <img src="/logo.png" alt="CashTrail" className="brand-logo brand-logo-sm" />
          <span className="mobile-header-title">CashTrail</span>
        </div>
        {pwa.showInstallUi && (
          <button className="mobile-header-install" onClick={openInstall} aria-label="Install app">
            <Download size={16} strokeWidth={2} />
            <span>Install</span>
          </button>
        )}
      </header>

      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="CashTrail" className="brand-logo brand-logo-md" />
          <div>
            <div className="sidebar-title">CashTrail</div>
            <div className="sidebar-subtitle">Follow every rupee</div>
          </div>
        </div>

        <button className="sidebar-add-btn" onClick={() => setShowAdd(true)}>
          <Plus size={16} strokeWidth={2.25} />
          Add Transaction
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
          {pwa.showInstallUi && (
            <button className="sidebar-nav-item sidebar-install-btn" onClick={openInstall}>
              <span className="nav-icon"><Download size={18} strokeWidth={1.75} /></span>
              Download app
            </button>
          )}
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
            <span className="nav-icon"><LogOut size={18} strokeWidth={1.75} /></span>
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
        <Plus size={22} strokeWidth={2.25} />
      </button>

      {/* ── Mobile liquid-glass nav ── */}
      <nav className="bottom-nav" aria-label="Main">
        <div className="bottom-nav-sheen" aria-hidden />
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

      <InstallAppDialog
        open={pwa.dialogOpen}
        ios={pwa.ios}
        canPrompt={pwa.canPrompt}
        onClose={() => pwa.setDialogOpen(false)}
        onInstall={() => void pwa.install()}
      />
    </div>
  )
}
