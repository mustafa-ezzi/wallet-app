import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiErrorMessage, authApi } from '../api/client'

type Step = 'email' | 'otp' | 'password'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')
    setInfo('')
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      const { data } = await authApi.forgotPassword(email.trim())
      setInfo(data?.detail || 'If an account exists, a code has been sent.')
      if (data?.debug_code) {
        setInfo(`${data.detail} Debug code: ${data.debug_code}`)
        setCode(String(data.debug_code))
      }
      setStep('otp')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send reset code.'))
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!code.trim()) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setLoading(true)
    try {
      const { data } = await authApi.verifyResetOtp(email.trim(), code.trim())
      setResetToken(data.reset_token)
      setInfo('Code verified. Choose a new password.')
      setStep('password')
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid or expired code.'))
    } finally {
      setLoading(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(resetToken, password)
      navigate('/login', { state: { reset: true, email: email.trim() } })
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card glass">
        <div className="auth-logo">
          <img src="/logo.png" alt="WalletTrails" className="brand-logo brand-logo-lg" />
        </div>

        <h2 style={{ marginBottom: '0.35rem' }}>Forgot password</h2>
        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
          {step === 'email' && 'We’ll email you a 6-digit code to reset your password.'}
          {step === 'otp' && `Enter the code sent to ${email.trim()}.`}
          {step === 'password' && 'Create a new password for your account.'}
        </p>

        {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        {info && (
          <div className="auth-success" style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>
            {info}
          </div>
        )}

        {step === 'email' && (
          <form className="auth-form" onSubmit={sendCode}>
            <div className="form-group">
              <label>Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.8rem' }} disabled={loading}>
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form className="auth-form" onSubmit={verifyCode}>
            <div className="form-group">
              <label>6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                maxLength={6}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.8rem' }} disabled={loading}>
              {loading ? 'Checking…' : 'Verify code'}
            </button>
            <button
              type="button"
              style={{
                width: '100%',
                padding: '0.75rem',
                marginTop: '0.65rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'transparent',
                fontWeight: 700,
                cursor: 'pointer',
                color: 'var(--text)',
              }}
              disabled={loading}
              onClick={() => void sendCode()}
            >
              Resend code
            </button>
          </form>
        )}

        {step === 'password' && (
          <form className="auth-form" onSubmit={savePassword}>
            <div className="form-group">
              <label>New password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label>Confirm password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.8rem' }} disabled={loading}>
              {loading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          Remembered it? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
