import { RefreshCw } from 'lucide-react'

interface Props {
  open: boolean
  refreshing: boolean
  onRefresh: () => void
}

export default function UpdateAvailableDialog({ open, refreshing, onRefresh }: Props) {
  if (!open) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 1300 }}>
      <div className="modal-sheet" style={{ maxWidth: 400 }} role="alertdialog" aria-modal="true" aria-labelledby="update-title">
        <div className="modal-header">
          <h2 id="update-title">Update available</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.85rem' }}>
          <img src="/logo.png" alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }} />
        </div>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.5, textAlign: 'center' }}>
          A new version of CashTrail is ready. Refresh to get the latest updates.
        </p>
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', padding: '0.8rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <span className="spinner" />
          ) : (
            <>
              <RefreshCw size={16} strokeWidth={2.25} />
              Refresh now
            </>
          )}
        </button>
      </div>
    </div>
  )
}
