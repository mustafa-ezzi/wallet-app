import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { authApi, apiErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

type Gender = 'male' | 'female'
type UserType = 'student' | 'professional' | 'self_employed' | 'retired'

type Draft = {
  name: string
  date_of_birth: string
  gender: Gender | ''
  user_type: UserType | ''
  country: string
}

const DRAFT_KEY = 'cashtrail_onboarding_draft'

const USER_TYPES: { id: UserType; label: string; emoji: string }[] = [
  { id: 'student', label: 'Student', emoji: '🎓' },
  { id: 'professional', label: 'Professional', emoji: '💼' },
  { id: 'self_employed', label: 'Self Employed', emoji: '💻' },
  { id: 'retired', label: 'Retired', emoji: '🏡' },
]

const COUNTRIES = [
  'Pakistan',
  'India',
  'United Arab Emirates',
  'Saudi Arabia',
  'United Kingdom',
  'United States',
  'Canada',
  'Australia',
  'Germany',
  'Other',
]

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) {
      return { name: '', date_of_birth: '2000-01-01', gender: '', user_type: '', country: 'Pakistan' }
    }
    return {
      name: '',
      date_of_birth: '2000-01-01',
      gender: '',
      user_type: '',
      country: 'Pakistan',
      ...JSON.parse(raw),
    }
  } catch {
    return { name: '', date_of_birth: '2000-01-01', gender: '', user_type: '', country: 'Pakistan' }
  }
}

function saveDraft(patch: Partial<Draft>) {
  const next = { ...loadDraft(), ...patch }
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
  return next
}

function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY)
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

/** Step 1 — name, DOB, gender */
export function OnboardingAbout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const initial = useMemo(() => {
    const d = loadDraft()
    const prefill =
      d.name
      || [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
    return {
      name: prefill,
      date_of_birth: d.date_of_birth || user?.date_of_birth || '2000-01-01',
      gender: (d.gender || user?.gender || '') as Gender | '',
    }
  }, [user])

  const [name, setName] = useState(initial.name)
  const [dob, setDob] = useState(initial.date_of_birth)
  const [gender, setGender] = useState<Gender | ''>(initial.gender)
  const [error, setError] = useState('')

  if (user && user.onboarding_complete !== false) {
    return <Navigate to="/" replace />
  }

  const onContinue = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Please enter your name.')
    if (!dob) return setError('Please pick your date of birth.')
    if (!gender) return setError('Please select your gender.')
    saveDraft({ name: name.trim(), date_of_birth: dob, gender })
    navigate('/onboarding/user-type')
  }

  return (
    <div className="auth-page onboarding-page">
      <div className="auth-card glass onboarding-card">
        <button
          type="button"
          className="onboarding-back"
          onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}
        >
          ← Back
        </button>
        <h2 style={{ marginBottom: '0.35rem' }}>Help us know you</h2>
        <p className="text-muted" style={{ marginBottom: '1.25rem' }}>A few details to personalize CashTrail</p>
        {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        <form className="auth-form" onSubmit={onContinue}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              required
            />
          </div>
          <div className="form-group">
            <label>What is your date of birth?</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>What is your Gender?</label>
            <div className="onboarding-gender">
              {([
                { id: 'male' as const, label: '♂ Male' },
                { id: 'female' as const, label: '♀ Female' },
              ]).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`onboarding-choice ${gender === g.id ? 'on' : ''}`}
                  onClick={() => setGender(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.75rem', padding: '0.85rem' }}>
            Continue
          </button>
        </form>
      </div>
    </div>
  )
}

/** Step 2 — user type + country, then save everything */
export function OnboardingUserType() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()
  const draft = loadDraft()
  const [userType, setUserType] = useState<UserType | ''>(draft.user_type || '')
  const [country, setCountry] = useState(draft.country || 'Pakistan')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!draft.name || !draft.gender || !draft.date_of_birth) {
      navigate('/onboarding', { replace: true })
    }
  }, [draft.name, draft.gender, draft.date_of_birth, navigate])

  if (user && user.onboarding_complete !== false) {
    return <Navigate to="/" replace />
  }

  const finish = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!userType) return setError('Please select what kind of user you are.')
    if (!country) return setError('Please pick your country.')

    const about = loadDraft()
    if (!about.name.trim() || !about.date_of_birth || !about.gender) {
      navigate('/onboarding', { replace: true })
      return
    }

    saveDraft({ user_type: userType, country })
    setLoading(true)

    const parts = about.name.trim().split(/\s+/)
    const payload = {
      first_name: parts[0] || '',
      last_name: parts.slice(1).join(' '),
      date_of_birth: about.date_of_birth,
      gender: about.gender,
      user_type: userType,
      country,
      onboarding_complete: true,
    }

    try {
      let lastErr: unknown = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await authApi.updateMe(payload)
          lastErr = null
          break
        } catch (err) {
          lastErr = err
          await sleep(1200 * (attempt + 1))
        }
      }
      if (lastErr) throw lastErr
      try {
        await refreshUser()
      } catch {
        /* ignore */
      }
      clearDraft()
      navigate('/', { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not finish setup. Wait a few seconds and try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page onboarding-page">
      <div className="auth-card glass onboarding-card">
        <button type="button" className="onboarding-back" onClick={() => navigate('/onboarding')}>
          ← Back
        </button>
        <h2 style={{ marginBottom: '0.35rem', textAlign: 'center' }}>What kind of user are you?</h2>
        <p className="text-muted" style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
          This helps us tailor CashTrail for you
        </p>
        {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        <form className="auth-form" onSubmit={finish}>
          <div className="onboarding-type-grid">
            {USER_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`onboarding-type ${userType === t.id ? 'on' : ''}`}
                onClick={() => setUserType(t.id)}
              >
                <span className="onboarding-type-emoji">{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="form-group" style={{ marginTop: '1.25rem' }}>
            <label>Default Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', marginTop: '0.75rem', padding: '0.85rem' }}
            disabled={loading}
          >
            {loading ? 'Finishing…' : 'Continue'}
          </button>
        </form>
        <div className="auth-footer">
          <button
            type="button"
            className="linkish"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
          >
            Sign out
          </button>
          {' · '}
          <Link to="/login">Login</Link>
        </div>
      </div>
    </div>
  )
}
