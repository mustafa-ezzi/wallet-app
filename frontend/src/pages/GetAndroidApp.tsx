import { useNavigate } from 'react-router-dom'
import { Download, Play, Smartphone, X } from 'lucide-react'
import { ANDROID_APK_URL, ANDROID_APP_LABEL } from '../config/androidApp'
import { startAndroidInstallTour } from '../components/AndroidInstallTour'
import { track } from '../lib/analytics'

export default function GetAndroidAppPage() {
  const navigate = useNavigate()

  const onDownload = () => {
    track('android_apk_download_click')
    window.open(ANDROID_APK_URL, '_blank', 'noopener,noreferrer')
  }

  const onStartTour = () => {
    startAndroidInstallTour(0)
  }

  return (
    <div className="page get-android-page">
      <div className="page-header">
        <div className="page-header-left bsms-hero">
          <div className="bsms-hero-icon" aria-hidden>
            <Smartphone size={20} strokeWidth={1.75} />
          </div>
          <div>
            <h1 style={{ margin: 0 }}>Android app</h1>
            <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
              Auto bank SMS needs the native Android app — follow the guided walkthrough below.
            </p>
          </div>
        </div>
        <button className="btn-glass" type="button" onClick={() => navigate(-1)}>
          <X size={14} strokeWidth={2} /> Close
        </button>
      </div>

      <section className="glass get-android-card get-android-hero" data-tour="android-walkthrough-start">
        <p className="get-android-label">{ANDROID_APP_LABEL}</p>
        <p className="text-muted" style={{ fontSize: '0.88rem', lineHeight: 1.45, margin: '0 0 1rem' }}>
          We’ll highlight each step on screen — Settings → Android app → Download → Play Protect → Bank alerts.
        </p>
        <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={onStartTour}>
          <Play size={16} strokeWidth={2.25} fill="currentColor" />
          Start install walkthrough
        </button>
        <button
          type="button"
          className="btn-glass"
          style={{ width: '100%', marginTop: '0.55rem' }}
          data-tour="android-download"
          onClick={onDownload}
        >
          <Download size={16} strokeWidth={2.25} />
          Download Android APK directly
        </button>
      </section>

      <section className="glass get-android-card get-android-warn" data-tour="android-play-protect">
        <h2 className="get-android-h2">If Play Protect blocks install</h2>
        <ol className="get-android-steps">
          <li>Open <strong>Play Store</strong> → profile → <strong>Play Protect</strong>.</li>
          <li>Settings gear → turn <strong>Scan apps</strong> off temporarily.</li>
          <li>Or tap <strong>Install anyway</strong> on the block screen.</li>
          <li>After WalletTrails installs, turn Play Protect <strong>back on</strong>.</li>
        </ol>
      </section>

      <section className="glass get-android-card" data-tour="android-bank-setup">
        <h2 className="get-android-h2">After install — bank alerts</h2>
        <ol className="get-android-steps">
          <li>Open WalletTrails on Android and sign in.</li>
          <li>Go to <strong>Settings → Bank alerts</strong>.</li>
          <li>Enable <strong>SMS</strong> and/or <strong>Bank apps</strong>.</li>
          <li><strong>Approve</strong> or <strong>Reject</strong> each draft — same queue as this website.</li>
        </ol>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '1rem' }}>
          <button type="button" className="btn-glass" onClick={onStartTour}>
            <Play size={14} strokeWidth={2.25} />
            Replay walkthrough
          </button>
          <button type="button" className="btn-glass" onClick={() => navigate('/bank-sms')}>
            Open Bank SMS on web
          </button>
        </div>
      </section>
    </div>
  )
}
