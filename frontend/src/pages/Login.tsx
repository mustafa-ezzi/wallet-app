import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card glass">
        <div className="auth-logo">
          <div className="auth-logo-mark">W</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Wallet Manager</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Personal Finance</div>
          </div>
        </div>

        <h2 style={{ marginBottom: '0.35rem' }}>Welcome back</h2>
        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Sign in to your account</p>

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
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', width: '100%', padding: '0.8rem' }} disabled={loading}>
            {loading ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}><span className="spinner" /> Signing in…</span> : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account? <Link to="/signup">Create one</Link>
        </div>
      </div>
    </div>
  )
}
