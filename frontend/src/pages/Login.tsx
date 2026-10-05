import { useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login, addingAccount, cancelAddAccount, savedAccounts } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const registered = Boolean((location.state as { registered?: boolean } | null)?.registered)
  const resetDone = Boolean((location.state as { reset?: boolean } | null)?.reset)
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? ''

  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid email or password. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const onCancelAdd = async () => {
    setCancelBusy(true)
    try {
      await cancelAddAccount()
      navigate('/', { replace: true })
    } finally {
      setCancelBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card glass">
        {addingAccount ? (
          <button
            type="button"
            className="btn-glass"
            style={{ marginBottom: '1rem', fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
            onClick={() => void onCancelAdd()}
            disabled={cancelBusy}
          >
            {cancelBusy ? 'Restoring…' : '← Back to accounts'}
          </button>
        ) : null}

        <div className="auth-logo">
          <img src="/wallettrail-logo.png" alt="WalletTrails" className="brand-logo brand-logo-lg" />
        </div>

        <h2 style={{ marginBottom: '0.35rem' }}>{addingAccount ? 'Add account' : 'Welcome back'}</h2>
        <p className="text-muted" style={{ marginBottom: addingAccount && savedAccounts.length ? '0.75rem' : '1.5rem' }}>
          {addingAccount
            ? 'Sign in to another WalletTrails account. Your other accounts stay saved in this browser.'
            : 'Sign in to your account'}
        </p>
        {addingAccount && savedAccounts.length > 0 ? (
          <p className="text-muted" style={{ marginBottom: '1.5rem', fontWeight: 700, fontSize: '0.85rem' }}>
            {savedAccounts.length} account{savedAccounts.length === 1 ? '' : 's'} already saved
          </p>
        ) : null}

        {registered && (
          <div className="auth-success" style={{ marginBottom: '1rem' }}>
            Account created. Sign in with your email and password.
          </div>
        )}
        {resetDone && (
          <div className="auth-success" style={{ marginBottom: '1rem' }}>
            Password updated. Sign in with your new password.
          </div>
        )}
        {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required autoFocus
            />
          </div>
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label>Password</label>
              {!addingAccount ? (
                <Link to="/forgot-password" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                  Forgot password?
                </Link>
              ) : null}
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', width: '100%', padding: '0.8rem' }} disabled={loading}>
            {loading
              ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}><span className="spinner" /> Signing in…</span>
              : addingAccount ? 'Add & switch' : 'Sign In'}
          </button>
        </form>

        {!addingAccount ? (
          <div className="auth-footer">
            Don&apos;t have an account? <Link to="/signup">Create one</Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}
