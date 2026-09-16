import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  CloudDownload,
  Coins,
  Download,
  Landmark,
  Lock,
  LogOut,
  MessageSquareText,
  Palette,
  Plane,
  Receipt,
  Smartphone,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import { authApi, accountsApi, asList, apiErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../hooks/useConfirm'
import { useTheme } from '../theme/ThemeProvider'

type ExpandId = 'profile' | 'password' | 'appearance' | null

function Row({
  icon,
  title,
  value,
  onClick,
  danger,
  tour,
}: {
  icon: ReactNode
  title: string
  value?: string
  onClick?: () => void
  danger?: boolean
  tour?: string
}) {
  return (
    <button type="button" className={`settings-row${danger ? ' settings-row--danger' : ''}`} onClick={onClick} data-tour={tour}>
      <span className="settings-row-icon">{icon}</span>
      <span className="settings-row-title">{title}</span>
      {value ? <span className="settings-row-value">{value}</span> : null}
      {onClick ? <ChevronRight size={14} className="settings-row-chevron" /> : null}
    </button>
  )
}

export default function Settings() {
  const { user, refreshUser, logout } = useAuth()
  const { themeId, themes, setTheme, transitioning } = useTheme()
  const navigate = useNavigate()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const themeName = themes.find((t) => t.id === themeId)?.name ?? 'System'

  const [expand, setExpand] = useState<ExpandId>(null)
  const [walletCount, setWalletCount] = useState<number | null>(null)
  const [bankCount, setBankCount] = useState<number | null>(null)

  const [firstName, setFirstName] = useState(user?.first_name ?? '')
  const [lastName, setLastName] = useState(user?.last_name ?? '')
  useEffect(() => {
    setFirstName(user?.first_name ?? '')
    setLastName(user?.last_name ?? '')
  }, [user])
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [nameOk, setNameOk] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwOk, setPwOk] = useState('')

  const [currencyBusy, setCurrencyBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void accountsApi.list().then((res) => {
      if (cancelled) return
      const list = asList<{ type?: string }>(res.data)
      const wallets = list.filter((a) => a.type === 'bank' || a.type === 'cash')
      setWalletCount(wallets.length)
      setBankCount(list.filter((a) => a.type === 'bank').length)
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (id: ExpandId) => setExpand((cur) => (cur === id ? null : id))

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to access your WalletTrails.',
      confirmLabel: 'Sign out',
      danger: true,
    })
    if (!ok) return
    logout()
    navigate('/login', { replace: true })
  }

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameSaving(true); setNameError(''); setNameOk('')
    try {
      await authApi.updateMe({ first_name: firstName.trim(), last_name: lastName.trim() })
      await refreshUser()
      setNameOk('Saved')
    } catch (err: unknown) {
      setNameError(apiErrorMessage(err, 'Could not update name.'))
    } finally {
      setNameSaving(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(''); setPwOk('')
    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.')
      return
    }
    setPwSaving(true)
    try {
      await authApi.updateMe({
        current_password: currentPassword,
        password: newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwOk('Saved')
    } catch (err: unknown) {
      setPwError(apiErrorMessage(err, 'Could not change password.'))
    } finally {
      setPwSaving(false)
    }
  }

  const saveCurrency = async (code: string) => {
    if (!code || code === user?.currency) return
    setCurrencyBusy(true)
    try {
      await authApi.updateMe({ currency: code })
      await refreshUser()
    } catch {
      /* keep previous */
    } finally {
      setCurrencyBusy(false)
    }
  }

  const icon = { size: 15, strokeWidth: 1.85 }

  return (
    <div className="page settings-page">
      {confirmDialog}
      <div className="page-header">
        <h1>Settings</h1>
        <button className="btn-glass" style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }} onClick={() => navigate(-1)}>
          <X size={14} strokeWidth={2} /> Close
        </button>
      </div>

      <div className="settings-stack">
        <div className="settings-group">
          <Row icon={<Wallet {...icon} />} title="Wallets" value={walletCount == null ? undefined : String(walletCount)} onClick={() => navigate('/accounts')} />
          <Row icon={<Landmark {...icon} />} title="Bank Accounts" value={bankCount ? String(bankCount) : 'Add'} onClick={() => navigate('/accounts')} />
          <Row icon={<Receipt {...icon} />} title="Scheduled Transactions" value="Add" onClick={() => navigate('/expenses')} />
        </div>

        <div className="settings-group">
          <Row icon={<UserRound {...icon} />} title="Profile" value={[firstName, lastName].filter(Boolean).join(' ') || undefined} onClick={() => toggle('profile')} />
          {expand === 'profile' ? (
            <div className="settings-expand">
              {nameError ? <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{nameError}</div> : null}
              {nameOk ? <div className="auth-success" style={{ marginBottom: '0.75rem' }}>{nameOk}</div> : null}
              <form onSubmit={saveName}>
                <div className="grid-2">
                  <div className="form-group">
                    <label>First name</label>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Last name</label>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className="btn-primary" disabled={nameSaving} style={{ padding: '0.55rem 1rem' }}>
                  {nameSaving ? <span className="spinner" /> : 'Save'}
                </button>
              </form>
            </div>
          ) : null}

          <button type="button" className="settings-row" onClick={() => toggle('appearance')}>
            <span className="settings-row-icon"><Palette {...icon} /></span>
            <span className="settings-row-title">Appearance</span>
            <span className="settings-row-value">{themeName}</span>
            <ChevronRight size={14} className="settings-row-chevron" />
          </button>
          {expand === 'appearance' ? (
            <div className="settings-expand">
              <div className="theme-swatch-row" role="radiogroup" aria-label="Color theme">
                {themes.map((t) => {
                  const selected = themeId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={t.name}
                      className={`theme-swatch ${selected ? 'selected' : ''}`}
                      style={{ background: t.swatch, boxShadow: selected ? `0 0 0 2px var(--surface), 0 0 0 4px ${t.swatchEdge}` : undefined }}
                      onClick={(e) => setTheme(t.id, { x: e.clientX, y: e.clientY })}
                      title={t.name}
                      disabled={transitioning}
                    >
                      {selected && <span className="theme-swatch-check" aria-hidden>✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <label className="settings-row" style={{ cursor: currencyBusy ? 'wait' : 'pointer' }}>
            <span className="settings-row-icon"><Coins {...icon} /></span>
            <span className="settings-row-title">Currency</span>
            <select
              value={user?.currency || 'PKR'}
              disabled={currencyBusy}
              onChange={(e) => void saveCurrency(e.target.value)}
              style={{ border: 0, background: 'transparent', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.88rem', textAlign: 'right' }}
            >
              <option value="PKR">PKR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="AED">AED</option>
              <option value="SAR">SAR</option>
              <option value="INR">INR</option>
            </select>
          </label>

          <Row icon={<Download {...icon} />} title="Export" onClick={() => navigate('/reports')} />
          <Row icon={<Plane {...icon} />} title="Travel Mode" onClick={() => navigate('/travel-mode')} />
          <Row icon={<Smartphone {...icon} />} title="Android app" tour="android-app-settings" onClick={() => navigate('/get-android')} />
          <Row icon={<MessageSquareText {...icon} />} title="Bank alerts" onClick={() => navigate('/bank-sms')} />
          <Row icon={<Lock {...icon} />} title="Password" onClick={() => toggle('password')} />
          {expand === 'password' ? (
            <div className="settings-expand">
              {pwError ? <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{pwError}</div> : null}
              {pwOk ? <div className="auth-success" style={{ marginBottom: '0.75rem' }}>{pwOk}</div> : null}
              <form onSubmit={savePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Current password</label>
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
                </div>
                <div className="form-group">
                  <label>New password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                </div>
                <div className="form-group">
                  <label>Confirm new password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                </div>
                <button type="submit" className="btn-primary" disabled={pwSaving} style={{ alignSelf: 'flex-start', padding: '0.55rem 1rem' }}>
                  {pwSaving ? <span className="spinner" /> : 'Update'}
                </button>
              </form>
            </div>
          ) : null}
          <Row icon={<CloudDownload {...icon} />} title="Restore Purchase" value={user?.is_premium ? 'Premium' : undefined} />
        </div>

        <div className="settings-group">
          <Row icon={<LogOut {...icon} />} title="Logout" danger onClick={() => void handleLogout()} />
        </div>
      </div>
    </div>
  )
}
