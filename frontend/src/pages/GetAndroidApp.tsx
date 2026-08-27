import { useNavigate } from 'react-router-dom'
import {
  Download,
  MessageSquareText,
  ShieldAlert,
  Smartphone,
  X,
} from 'lucide-react'
import { ANDROID_APK_URL, ANDROID_APP_LABEL } from '../config/androidApp'
import { track } from '../lib/analytics'

export default function GetAndroidAppPage() {
  const navigate = useNavigate()

  const onDownload = () => {
    track('android_apk_download_click')
    window.open(ANDROID_APK_URL, '_blank', 'noopener,noreferrer')
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
              Auto bank SMS &amp; wallet notifications need the native Android app — not the website PWA.
            </p>
          </div>
        </div>
        <button className="btn-glass" type="button" onClick={() => navigate(-1)}>
          <X size={14} strokeWidth={2} /> Close
        </button>
      </div>

      <section className="glass get-android-card">
        <p className="get-android-label">{ANDROID_APP_LABEL}</p>
        <p className="text-muted" style={{ fontSize: '0.88rem', lineHeight: 1.45, margin: '0 0 1rem' }}>
          Direct Expo install (not from Google Play). Open this page on your <strong>Android phone</strong>,
          then follow the steps below.
        </p>
        <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={onDownload}>
          <Download size={16} strokeWidth={2.25} />
          Download Android APK
        </button>
        <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.65rem', textAlign: 'center' }}>
          Opens the Expo build page — tap Install / Download APK there.
        </p>
      </section>

      <section className="glass get-android-card">
        <h2 className="get-android-h2">
          <Download size={16} strokeWidth={2} color="var(--primary)" />
          1. Download &amp; install
        </h2>
        <ol className="get-android-steps">
          <li>On your phone, tap <strong>Download Android APK</strong> above.</li>
          <li>On the Expo page, choose <strong>Install</strong> or download the <strong>.apk</strong> file.</li>
          <li>
            If Android asks “Install unknown apps?”, allow it for <strong>Chrome</strong> or{' '}
            <strong>Files</strong> (whichever opened the APK).
          </li>
          <li>Open the downloaded file and tap <strong>Install</strong>.</li>
        </ol>
      </section>

      <section className="glass get-android-card get-android-warn">
        <h2 className="get-android-h2">
          <ShieldAlert size={16} strokeWidth={2} color="#c2410c" />
          2. If Play Protect blocks the install
        </h2>
        <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.45, margin: '0 0 0.75rem' }}>
          Sideloaded apps that use SMS often trigger Google Play Protect. This is common for Expo preview
          builds — not proof CashTrail is malware. Pause Protect only while installing, then turn it back on.
        </p>
        <ol className="get-android-steps">
          <li>Open the <strong>Play Store</strong> app on your phone.</li>
          <li>Tap your profile picture → <strong>Play Protect</strong>.</li>
          <li>Tap the settings gear → turn <strong>Scan apps with Play Protect</strong> off temporarily.</li>
          <li>Or on the block screen, tap <strong>More details</strong> → <strong>Install anyway</strong> if shown.</li>
          <li>Install CashTrail, open it once, then return to Play Protect and turn scanning <strong>back on</strong>.</li>
        </ol>
        <p className="get-android-note">
          Leaving Play Protect off long-term is not recommended. Turn it back on after CashTrail is installed.
        </p>
      </section>

      <section className="glass get-android-card">
        <h2 className="get-android-h2">
          <MessageSquareText size={16} strokeWidth={2} color="var(--primary)" />
          3. Turn on bank auto-detect
        </h2>
        <ol className="get-android-steps">
          <li>Open <strong>CashTrail</strong> and sign in with the same account as the website.</li>
          <li>Go to <strong>Settings → Bank alerts</strong> (or the Home banner).</li>
          <li>
            Enable <strong>SMS</strong> and/or <strong>Bank apps</strong> (notification access for Meezan,
            NayaPay, SadaPay, etc.).
          </li>
          <li>Grant the permissions Android asks for.</li>
          <li>
            When a bank alert arrives, open the pending draft → <strong>Approve</strong> or{' '}
            <strong>Reject</strong>. Nothing posts without you.
          </li>
          <li>The same pending queue also appears here on the website under Bank SMS.</li>
        </ol>
      </section>

      <section className="glass get-android-card">
        <h2 className="get-android-h2">Tips</h2>
        <ul className="get-android-tips">
          <li>
            The website <strong>Install</strong> (PWA) is only a home-screen shortcut — it cannot read SMS.
          </li>
          <li>
            On Xiaomi / Redmi / POCO, also check Autostart and “other permissions” if SMS never arrives.
          </li>
          <li>
            Prefer <strong>Bank apps</strong> notification access if SMS is blocked on your phone.
          </li>
          <li>
            Need a newer build? Ask for an updated Expo link — old build pages expire.
          </li>
        </ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '1rem' }}>
          <button type="button" className="btn-primary" onClick={onDownload}>
            <Download size={16} strokeWidth={2.25} />
            Download again
          </button>
          <button type="button" className="btn-glass" onClick={() => navigate('/bank-sms')}>
            Open Bank SMS on web
          </button>
        </div>
      </section>
    </div>
  )
}
