import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PieChart } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { track } from '../lib/analytics'
import {
  markBudgetsFeatureSeen,
  shouldShowBudgetsWhatsNew,
} from '../features/budgetsAnnounce'

/**
 * Shown after a PWA refresh (or first open of this build) so users discover Budgets.
 * The update dialog itself lives in the *previous* bundle — this is the reliable announce.
 */
export default function BudgetsWhatsNewDialog() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (loading || !user) return
    // Let the shell paint first; after-refresh announce beats the Android install tour.
    const t = window.setTimeout(() => {
      if (shouldShowBudgetsWhatsNew()) {
        setOpen(true)
        track('feature_whats_new_shown', { feature: 'budgets_v1' })
      }
    }, 900)
    return () => window.clearTimeout(t)
  }, [loading, user])

  const dismiss = (goToBudgets: boolean) => {
    markBudgetsFeatureSeen()
    setOpen(false)
    track('feature_whats_new_dismissed', { feature: 'budgets_v1', go_to: goToBudgets })
    if (goToBudgets) navigate('/budgets')
  }

  if (!open) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 1280 }} onClick={e => e.target === e.currentTarget && dismiss(false)}>
      <div
        className="modal-sheet"
        style={{ maxWidth: 420 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="budgets-whats-new-title"
      >
        <div className="modal-header">
          <h2 id="budgets-whats-new-title">New · Budgets</h2>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.85rem' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(34,197,94,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PieChart size={28} color="var(--primary, #16a34a)" strokeWidth={2} />
          </div>
        </div>

        <p style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.5, textAlign: 'center' }}>
          We’ve added <strong>Budgets</strong> — set monthly spending limits by category and see how much you’ve used.
        </p>

        <div
          style={{
            background: 'var(--surface-2, rgba(0,0,0,0.04))',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 0.9rem',
            marginBottom: '1.15rem',
            fontSize: '0.85rem',
            lineHeight: 1.45,
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Where to find it</div>
          <div>
            Open <strong>Budgets</strong> in the bottom nav (mobile) or the left sidebar (desktop).
            You can also tap <strong>Budgets →</strong> on the Home spending card.
          </div>
        </div>

        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', padding: '0.8rem', marginBottom: '0.5rem' }}
          onClick={() => dismiss(true)}
        >
          Open Budgets
        </button>
        <button
          type="button"
          className="btn-glass"
          style={{ width: '100%', padding: '0.7rem' }}
          onClick={() => dismiss(false)}
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
