import { Download, Share, Plus, X } from 'lucide-react'

interface Props {
  open: boolean
  ios: boolean
  canPrompt: boolean
  onClose: () => void
  onInstall: () => void
}

export default function InstallAppDialog({ open, ios, canPrompt, onClose, onInstall }: Props) {
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
          <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={onInstall}>
            <Download size={16} strokeWidth={2.25} />
            Download app
          </button>
        ) : ios ? (
          <ol className="install-steps">
            <li>
              Tap <Share size={14} strokeWidth={2} className="install-inline-icon" /> Share in Safari
            </li>
            <li>
              Scroll and tap <Plus size={14} strokeWidth={2} className="install-inline-icon" /> Add to Home Screen
            </li>
            <li>Confirm by tapping Add</li>
          </ol>
        ) : (
          <div className="install-steps" style={{ listStyle: 'none', paddingLeft: 0 }}>
            <p style={{ margin: 0 }}>
              Open this site in Chrome or Edge on your phone, then tap
              {' '}<strong>Download app</strong> when the install banner appears.
            </p>
          </div>
        )}

        {!canPrompt && (
          <button type="button" className="btn-glass" style={{ width: '100%', marginTop: '0.85rem' }} onClick={onClose}>
            Got it
          </button>
        )}
      </div>
    </div>
  )
}
