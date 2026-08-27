import { Download, Share, Plus, Smartphone, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Props {
  open: boolean
  ios: boolean
  canPrompt: boolean
  onClose: () => void
  onInstall: () => void
}

export default function InstallAppDialog({ open, ios, canPrompt, onClose, onInstall }: Props) {
  const navigate = useNavigate()
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet install-dialog">
        <div className="modal-header">
          <h2>Install CashTrail</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="install-dialog-hero">
          <img src="/logo.png" alt="CashTrail" className="install-dialog-logo" />
          <p>Add CashTrail to your home screen for a faster, full-screen experience.</p>
        </div>

        {canPrompt ? (
          <>
            <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={onInstall}>
              <Download size={16} strokeWidth={2.25} />
              Install now
            </button>
            <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.8rem', textAlign: 'center' }}>
              Your browser will show the install confirmation next.
            </p>
          </>
        ) : ios ? (
          <>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              iPhone / iPad can’t install from a button — use Safari:
            </p>
            <ol className="install-steps">
              <li>
                Tap <Share size={14} strokeWidth={2} className="install-inline-icon" /> Share
              </li>
              <li>
                Tap <Plus size={14} strokeWidth={2} className="install-inline-icon" /> Add to Home Screen
              </li>
              <li>Tap Add</li>
            </ol>
            <button type="button" className="btn-glass" style={{ width: '100%', marginTop: '0.85rem' }} onClick={onClose}>
              Got it
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Install isn’t ready in this browser yet. Use <strong>Chrome</strong> or <strong>Edge</strong> on Android,
              stay on the site a few seconds, then tap <strong>Install</strong> again — the system install popup should appear.
            </p>
            <button type="button" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={onInstall}>
              <Download size={16} strokeWidth={2.25} />
              Try install again
            </button>
            <button type="button" className="btn-glass" style={{ width: '100%', marginTop: '0.55rem' }} onClick={onClose}>
              Close
            </button>
          </>
        )}

        {!ios ? (
          <div className="install-android-apk">
            <p>
              Need <strong>auto bank SMS</strong>? The home-screen install can’t read messages — get the Android APK instead.
            </p>
            <button
              type="button"
              className="btn-glass"
              style={{ width: '100%' }}
              onClick={() => {
                onClose()
                navigate('/get-android')
              }}
            >
              <Smartphone size={16} strokeWidth={2} />
              Android APK install guide
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
