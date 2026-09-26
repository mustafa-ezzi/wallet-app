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
  Tags,
  Trash2,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import { authApi, accountsApi, asList, apiErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../context/CategoriesContext'
import { useConfirm } from '../hooks/useConfirm'
import { useTheme } from '../theme/ThemeProvider'

type ExpandId = 'profile' | 'password' | 'appearance' | 'categories' | null

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
  const { custom, create: createCategory, remove: removeCategory } = useCategories()
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

  const [catKind, setCatKind] = useState<'expense' | 'income'>('expense')
  const [catName, setCatName] = useState('')
  const [catError, setCatError] = useState('')
  const [catBusy, setCatBusy] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const username = user?.username || user?.email || ''

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

  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = catName.trim()
    if (!name) {
      setCatError('Enter a category name.')
      return
    }
    setCatBusy(true)
    setCatError('')
    try {
      await createCategory(catKind, name)
      setCatName('')
    } catch (err: unknown) {
      setCatError(apiErrorMessage(err, 'Could not create category.'))
    } finally {
      setCatBusy(false)
    }
  }

  const deleteCategory = async (id: number, name: string) => {
    const ok = await confirm({
      title: 'Delete category?',
      message: `“${name}” will be removed from your pickers. Existing transactions keep this name.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await removeCategory(id)
    } catch (err: unknown) {
      setCatError(apiErrorMessage(err, 'Could not delete category.'))
    }
  }

  const openDeleteAccount = () => {
    setDeleteConfirm('')
    setDeleteError('')
    setDeleteOpen(true)
  }

  const submitDeleteAccount = async () => {
    if (!username || deleteConfirm !== username) {
      setDeleteError(`Type ${username} exactly.`)
      return
    }
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await authApi.deleteAccount(deleteConfirm)
      setDeleteOpen(false)
      logout()
      navigate('/login', { replace: true })
    } catch (err: unknown) {
      setDeleteError(apiErrorMessage(err, 'Could not delete account.'))
    } finally {
      setDeleteBusy(false)
    }
  }

  const icon = { size: 15, strokeWidth: 1.85 }
  const customForKind = custom.filter((c) => c.kind === catKind)

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

          <Row
            icon={<Tags {...icon} />}
            title="Categories"
            value={custom.length ? String(custom.length) : 'Add'}
            onClick={() => toggle('categories')}
          />
          {expand === 'categories' ? (
            <div className="settings-expand">
              <p className="text-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.85rem' }}>
                Built-in categories stay available. Add your own for income or expenses.
              </p>
              {catError ? <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{catError}</div> : null}
              <div className="settings-cat-kind">
                <button
                  type="button"
                  className={catKind === 'expense' ? 'btn-primary' : 'btn-glass'}
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                  onClick={() => setCatKind('expense')}
                >
                  Expense
                </button>
                <button
                  type="button"
                  className={catKind === 'income' ? 'btn-primary' : 'btn-glass'}
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                  onClick={() => setCatKind('income')}
                >
                  Income
                </button>
              </div>
              <form onSubmit={(e) => void saveCategory(e)} className="settings-cat-form">
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>New category</label>
                  <input
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder={catKind === 'income' ? 'e.g. Freelance' : 'e.g. Pet care'}
                    maxLength={40}
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={catBusy} style={{ padding: '0.55rem 1rem', alignSelf: 'flex-end' }}>
                  {catBusy ? <span className="spinner" /> : 'Add'}
                </button>
              </form>
              <ul className="settings-cat-list">
                {customForKind.length === 0 ? (
                  <li className="text-muted" style={{ fontSize: '0.8rem' }}>No custom {catKind} categories yet.</li>
                ) : (
                  customForKind.map((c) => (
                    <li key={c.id}>
                      <span>{c.name}</span>
                      <button type="button" className="btn-glass" style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }} onClick={() => void deleteCategory(c.id, c.name)}>
                        Delete
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}

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
          <Row icon={<Trash2 {...icon} />} title="Delete my account" danger onClick={openDeleteAccount} />
        </div>
      </div>

      {deleteOpen ? (
        <div
          className="modal-overlay"
          style={{ zIndex: 1300, background: 'rgba(15, 23, 42, 0.55)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteBusy) setDeleteOpen(false)
          }}
        >
          <div
            className="modal-sheet"
            style={{ maxWidth: 420, background: '#ffffff' }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="delete-account-title">Delete my account</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => !deleteBusy && setDeleteOpen(false)}
                aria-label="Close"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This permanently deletes your WalletTrails account and all data.
              To confirm, type <strong>{username}</strong> below.
            </p>
            {deleteError ? <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{deleteError}</div> : null}
            <div className="form-group">
              <label>Type your username</label>
              <input
                value={deleteConfirm}
                onChange={(e) => {
                  setDeleteConfirm(e.target.value)
                  setDeleteError('')
                }}
                placeholder={username}
                autoCapitalize="off"
                autoCorrect="off"
                disabled={deleteBusy}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn-glass" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-glass"
                disabled={deleteBusy || deleteConfirm !== username}
                style={{ color: 'var(--red-600)', borderColor: '#f5c4c0', background: '#fef2f2' }}
                onClick={() => void submitDeleteAccount()}
              >
                {deleteBusy ? <span className="spinner" /> : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
