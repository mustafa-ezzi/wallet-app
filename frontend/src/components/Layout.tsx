import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOffline } from '../offline'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  LayoutDashboard,
  Wallet,
  Coins,
  Receipt,
  BarChart3,
  LogOut,
  Plus,
  Download,
  Settings,
  Users,
} from 'lucide-react'
import anime from 'animejs'
import AddTransactionModal from './AddTransactionModal'
import InstallAppDialog from './InstallAppDialog'
import OnboardingTour from './OnboardingTour'
import { usePwaInstall } from '../hooks/usePwaInstall'

const NAV: { path: string; label: string; short: string; tour: string; icon: ReactNode }[] = [
  { path: '/',          label: 'Overview', icon: <LayoutDashboard size={18} strokeWidth={1.75} />, short: 'Overview', tour: 'nav-overview' },
  { path: '/accounts',  label: 'Wallets',  icon: <Wallet size={18} strokeWidth={1.75} />, short: 'Wallets', tour: 'nav-accounts' },
  { path: '/income',    label: 'Income',   icon: <Coins size={18} strokeWidth={1.75} />, short: 'Income', tour: 'nav-income' },
  { path: '/expenses',  label: 'Bills',    icon: <Receipt size={18} strokeWidth={1.75} />, short: 'Bills', tour: 'nav-bills' },
  { path: '/reports',   label: 'Reports',  icon: <BarChart3 size={18} strokeWidth={1.75} />, short: 'Reports', tour: 'nav-reports' },
]

/** Sidebar-only — keeps bottom nav at 5 items (Dashboard entry for Household on mobile). */
const SIDE_EXTRA: { path: string; label: string; icon: ReactNode }[] = [
  { path: '/household', label: 'Household', icon: <Users size={18} strokeWidth={1.75} /> },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { online, pending, syncing, syncNow } = useOffline()
  const location = useLocation()
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [hhUnread, setHhUnread] = useState(0)
  const pwa = usePwaInstall()
  const fabRef = useRef<HTMLButtonElement>(null)

  const handleAdded = () => { setShowAdd(false); setRefreshKey(k => k + 1) }

  useEffect(() => {
    let cancelled = false
    const tick = () => {
      import('../api/client').then(({ householdsApi }) =>
        householdsApi.unreadNotificationCount()
          .then(res => { if (!cancelled) setHhUnread(Number(res.data?.count) || 0) })
          .catch(() => { if (!cancelled) setHhUnread(0) }),
      )
    }
    tick()
    const id = window.setInterval(tick, 60000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [location.pathname, refreshKey])

  const initials = user
    ? (
        ((user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '')).toUpperCase()
        || (user.email?.[0] ?? user.username?.[0] ?? '?').toUpperCase()
      )
    : '?'

  const openInstall = () => { void pwa.install() }

  // FAB rises in on every page change
  useEffect(() => {
    const el = fabRef.current
    if (!el) return
    anime.remove(el)
    anime({
      targets: el,
      translateY: [72, 0],
      opacity: [0, 1],
      scale: [0.7, 1],
      duration: 520,
      easing: 'easeOutElastic(1, .65)',
    })
  }, [location.pathname])

  return (
    <div className="app-shell" key={refreshKey}>
      <header className="mobile-header">
        <div className="mobile-header-brand" data-tour="brand">
          <img src="/logo.png" alt="CashTrail" className="brand-logo brand-logo-sm" />
          <span className="mobile-header-title">CashTrail</span>
        </div>
        <div className="mobile-header-actions">
          {(!online || pending > 0) && (
            <button
              type="button"
              className={`sync-chip ${online ? 'sync-chip-pending' : 'sync-chip-offline'}`}
              onClick={() => { if (online) void syncNow() }}
              title={online ? 'Tap to sync pending transactions' : 'You are offline'}
            >
              {!online ? 'Offline' : syncing ? 'Syncing…' : `${pending} pending`}
            </button>
          )}
          {pwa.showInstallUi && (
            <button className="mobile-header-install" onClick={openInstall} aria-label="Install app">
              <Download size={16} strokeWidth={2} />
              <span>Install</span>
            </button>
          )}
          <button
            className="mobile-header-settings"
            onClick={() => navigate('/settings')}
            aria-label="Settings"
          >
            <Settings size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-brand" data-tour="brand">
          <img src="/logo.png" alt="CashTrail" className="brand-logo brand-logo-md" />
          <div>
            <div className="sidebar-title">CashTrail</div>
            <div className="sidebar-subtitle">Follow every rupee</div>
          </div>
        </div>

        <button className="sidebar-add-btn" onClick={() => setShowAdd(true)}>
          <Plus size={16} strokeWidth={2.25} />
          Add money in / out
        </button>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {NAV.map(n => (
            <button
              key={n.path}
              data-tour={n.tour}
              className={`sidebar-nav-item ${location.pathname === n.path ? 'active' : ''}`}
              onClick={() => navigate(n.path)}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
          {SIDE_EXTRA.map(n => (
            <button
              key={n.path}
              className={`sidebar-nav-item ${location.pathname === n.path ? 'active' : ''}`}
              onClick={() => navigate(n.path)}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
              {n.path === '/household' && hhUnread > 0 && (
                <span className="badge badge-red" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>
                  {hhUnread > 9 ? '9+' : hhUnread}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {(!online || pending > 0) && (
            <button
              type="button"
              className={`sidebar-nav-item sync-chip ${online ? 'sync-chip-pending' : 'sync-chip-offline'}`}
              onClick={() => { if (online) void syncNow() }}
              style={{ marginBottom: '0.35rem' }}
            >
              {!online ? 'Offline — changes saved locally' : syncing ? 'Syncing…' : `${pending} waiting to sync`}
            </button>
          )}
          {pwa.showInstallUi && (
            <button className="sidebar-nav-item sidebar-install-btn" onClick={openInstall}>
              <span className="nav-icon"><Download size={18} strokeWidth={1.75} /></span>
              Download app
            </button>
          )}
          <button
            className={`sidebar-nav-item ${location.pathname === '/settings' ? 'active' : ''}`}
            onClick={() => navigate('/settings')}
          >
            <span className="nav-icon"><Settings size={18} strokeWidth={1.75} /></span>
            Settings
          </button>
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div>
              <div className="sidebar-user-name">
                {user?.first_name ? `${user.first_name} ${user.last_name ?? ''}`.trim() : user?.username}
              </div>
              <div className="sidebar-user-email">{user?.email}</div>
            </div>
          </div>
          <button className="sidebar-nav-item" onClick={logout} style={{ color: 'var(--red-600)' }}>
            <span className="nav-icon"><LogOut size={18} strokeWidth={1.75} /></span>
            Sign Out
          </button>
        </div>
      </aside>

      <main>
        <Outlet />
      </main>

      <button
        ref={fabRef}
        className="fab"
        data-tour="fab"
        onClick={() => setShowAdd(true)}
        aria-label="Add income or expense"
      >
        <Plus size={22} strokeWidth={2.25} />
      </button>

      <nav className="bottom-nav" aria-label="Main">
        <div className="bottom-nav-sheen" aria-hidden />
        {NAV.map(n => (
          <button
            key={n.path}
            data-tour={n.tour}
            className={`bottom-nav-item ${location.pathname === n.path ? 'active' : ''}`}
            onClick={() => navigate(n.path)}
          >
            <span className="nav-icon">{n.icon}</span>
            <span>{n.short}</span>
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

      <OnboardingTour />
    </div>
  )
}
