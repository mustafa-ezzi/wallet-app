import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, Palette, UserRound, X } from 'lucide-react'
import { authApi, apiErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../hooks/useConfirm'
import { useTheme } from '../theme/ThemeProvider'

export default function Settings() {
  const { user, refreshUser, logout } = useAuth()
  const { themeId, themes, setTheme, transitioning } = useTheme()
  const navigate = useNavigate()
  const { confirm, dialog: confirmDialog } = useConfirm()

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

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to access your CashTrail.',
      confirmLabel: 'Sign out',
      danger: true,
    })
    if (!ok) return
    logout()
    navigate('/login', { replace: true })
  }

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await confirm({
      title: 'Update name?',
      message: 'Save your first and last name?',
      confirmLabel: 'Save',
    })
    if (!ok) return
    setNameSaving(true); setNameError(''); setNameOk('')
    try {
      await authApi.updateMe({ first_name: firstName.trim(), last_name: lastName.trim() })
      await refreshUser()
      setNameOk('Name updated.')
    } catch (err: any) {
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
    const ok = await confirm({
      title: 'Change password?',
      message: 'You will use the new password the next time you sign in.',
      confirmLabel: 'Change password',
      danger: true,
    })
    if (!ok) return
    setPwSaving(true)
    try {
      await authApi.updateMe({
        current_password: currentPassword,
        password: newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwOk('Password changed.')
    } catch (err: any) {
      setPwError(apiErrorMessage(err, 'Could not change password.'))
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="page">
      {confirmDialog}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Settings</h1>
          <p className="page-subtitle">Profile, theme, and security.</p>
        </div>
        <button className="btn-glass" style={{ fontSize: '0.82rem', padding: '0.5rem 0.9rem' }} onClick={() => navigate(-1)}>
          <X size={14} strokeWidth={2} /> Close
        </button>
      </div>

      <div className="glass" style={{ padding: '1.1rem 1.15rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
          <div className="sidebar-avatar" style={{ width: 40, height: 40, fontSize: '0.85rem' }}>
            {((firstName?.[0] ?? '') + (lastName?.[0] ?? '')).toUpperCase() || '?'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {[firstName, lastName].filter(Boolean).join(' ') || user?.email}
            </div>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>{user?.email}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem' }}>
          <UserRound size={16} strokeWidth={1.75} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Name</h3>
        </div>
        {nameError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{nameError}</div>}
        {nameOk && <div className="auth-success" style={{ marginBottom: '0.75rem' }}>{nameOk}</div>}
        <form onSubmit={saveName} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="grid-2">
            <div className="form-group">
              <label>First name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Last name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={nameSaving} style={{ alignSelf: 'flex-start', padding: '0.65rem 1.1rem' }}>
            {nameSaving ? <span className="spinner" /> : 'Save name'}
          </button>
        </form>
      </div>

      <div className="glass" style={{ padding: '1.1rem 1.15rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
          <Palette size={16} strokeWidth={1.75} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Theme</h3>
        </div>
        <p className="text-muted" style={{ fontSize: '0.78rem', marginBottom: '0.9rem' }}>
          Soft color palettes — tap a circle to switch.
        </p>
        <div className="theme-swatch-row" role="radiogroup" aria-label="Color theme">
          {themes.map(t => {
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
                onClick={e => setTheme(t.id, { x: e.clientX, y: e.clientY })}
                title={t.name}
                disabled={transitioning}
              >
                {selected && <span className="theme-swatch-check" aria-hidden>✓</span>}
              </button>
            )
          })}
        </div>
        <div className="theme-swatch-labels">
          {themes.map(t => (
            <span key={t.id} className={themeId === t.id ? 'active' : ''}>{t.name}</span>
          ))}
        </div>
      </div>

      <div className="glass" style={{ padding: '1.1rem 1.15rem', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem' }}>
          <KeyRound size={16} strokeWidth={1.75} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Change password</h3>
        </div>
        {pwError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{pwError}</div>}
        {pwOk && <div className="auth-success" style={{ marginBottom: '0.75rem' }}>{pwOk}</div>}
        <form onSubmit={savePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="form-group">
            <label>Current password</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label>New password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label>Confirm new password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
          <button type="submit" className="btn-primary" disabled={pwSaving} style={{ alignSelf: 'flex-start', padding: '0.65rem 1.1rem' }}>
            {pwSaving ? <span className="spinner" /> : 'Update password'}
          </button>
        </form>
      </div>

      <button
        className="btn-glass"
        style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--red-600)', borderColor: '#f5c4c0' }}
        onClick={handleLogout}
      >
        <LogOut size={16} strokeWidth={2} />
        Sign out
      </button>
    </div>
  )
}
