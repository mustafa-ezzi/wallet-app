import { useEffect, useLayoutEffect, useState, useCallback, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from 'animejs'
import { track } from '../lib/analytics'
import { BUDGETS_AFTER_UPDATE_KEY } from '../features/budgetsAnnounce'

export const ANDROID_INSTALL_TOUR_EVENT = 'wallettrails:android-install-tour'
const TOUR_AFTER_UPDATE_KEY = 'wallettrails_android_tour_after_update'

/** Call right before applying a PWA update — tour starts on the next page load. */
export function markAndroidTourAfterUpdate() {
  try {
    sessionStorage.setItem(TOUR_AFTER_UPDATE_KEY, '1')
  } catch {
    /* ignore */
  }
}

function consumeTourAfterUpdateFlag(): boolean {
  try {
    if (sessionStorage.getItem(TOUR_AFTER_UPDATE_KEY) !== '1') return false
    sessionStorage.removeItem(TOUR_AFTER_UPDATE_KEY)
    return true
  } catch {
    return false
  }
}

export type AndroidInstallTourStep = {
  id: string
  selector: string
  title: string
  body: string
  path?: string
  /** When true, Next opens the APK link (Expo build page). */
  openApk?: boolean
}

export const ANDROID_INSTALL_STEPS: AndroidInstallTourStep[] = [
  {
    id: 'settings',
    selector: '[data-tour="settings-nav"]',
    title: 'Step 1 · Open Settings',
    body: 'Tap the gear icon (mobile header) or Settings in the sidebar. Install guidance lives here.',
    path: '/',
  },
  {
    id: 'android-card',
    selector: '[data-tour="android-app-settings"]',
    title: 'Step 2 · Android app',
    body: 'Choose “Android app (auto bank alerts)” — this is where you download the native APK for SMS & bank notifications.',
    path: '/settings',
  },
  {
    id: 'download',
    selector: '[data-tour="android-download"]',
    title: 'Step 3 · Download APK',
    body: 'Tap Download Android APK. On the Expo page, install or save the .apk file. Use your Android phone for this step.',
    path: '/get-android',
    openApk: true,
  },
  {
    id: 'play-protect',
    selector: '[data-tour="android-play-protect"]',
    title: 'Step 4 · Play Protect',
    body: 'If Google blocks the install, follow these Play Protect steps — pause scanning only while installing, then turn it back on.',
    path: '/get-android',
  },
  {
    id: 'bank-setup',
    selector: '[data-tour="android-bank-setup"]',
    title: 'Step 5 · Bank auto-detect',
    body: 'After install, open WalletTrails on your phone → Settings → Bank alerts. Enable SMS and/or Bank apps, then Approve drafts.',
    path: '/get-android',
  },
]

function getRect(selector: string): DOMRect | null {
  const nodes = Array.from(document.querySelectorAll(selector))
  for (const el of nodes) {
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    if (rect.width > 2 && rect.height > 2 && style.visibility !== 'hidden' && style.display !== 'none') {
      if (rect.bottom > 0 && rect.top < window.innerHeight) return rect
    }
  }
  return nodes[0]?.getBoundingClientRect() ?? null
}

/** Launch the Android install spotlight walkthrough from anywhere in the app. */
export function startAndroidInstallTour(fromStep = 0) {
  window.dispatchEvent(
    new CustomEvent(ANDROID_INSTALL_TOUR_EVENT, { detail: { fromStep } }),
  )
}

interface Props {
  apkUrl: string
}

export default function AndroidInstallTour({ apkUrl }: Props) {
  const navigate = useNavigate()
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [hole, setHole] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const onStart = (e: Event) => {
      const fromStep = (e as CustomEvent<{ fromStep?: number }>).detail?.fromStep ?? 0
      setStep(Math.max(0, Math.min(fromStep, ANDROID_INSTALL_STEPS.length - 1)))
      setActive(true)
      track('android_install_tour_started', { from_step: fromStep })
    }
    window.addEventListener(ANDROID_INSTALL_TOUR_EVENT, onStart)
    return () => window.removeEventListener(ANDROID_INSTALL_TOUR_EVENT, onStart)
  }, [])

  useEffect(() => {
    if (!consumeTourAfterUpdateFlag()) return
    // Same reload may open Budgets What’s New — don’t stack two post-update flows.
    try {
      if (sessionStorage.getItem(BUDGETS_AFTER_UPDATE_KEY) === '1') return
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => {
      setStep(0)
      setActive(true)
      track('android_install_tour_started', { from_step: 0, reason: 'after_update' })
    }, 900)
    return () => window.clearTimeout(t)
  }, [])

  const current = ANDROID_INSTALL_STEPS[step]

  const updateHole = useCallback(() => {
    if (!current) return
    const rect = getRect(current.selector)
    if (!rect) {
      setHole(null)
      return
    }
    const pad = 10
    setHole({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    })
  }, [current])

  useLayoutEffect(() => {
    if (!active || !current) return
    if (current.path && window.location.pathname !== current.path) {
      navigate(current.path)
    }
    const t = window.setTimeout(updateHole, 320)
    window.addEventListener('resize', updateHole)
    window.addEventListener('scroll', updateHole, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', updateHole)
      window.removeEventListener('scroll', updateHole, true)
    }
  }, [active, current, navigate, updateHole, step])

  useEffect(() => {
    if (!active) return
    anime({
      targets: '.android-tour-card',
      opacity: [0, 1],
      translateY: [18, 0],
      duration: 420,
      easing: 'easeOutCubic',
    })
    anime({
      targets: '.android-tour-hole',
      scale: [0.92, 1],
      opacity: [0.5, 1],
      duration: 480,
      easing: 'easeOutElastic(1, .7)',
    })
  }, [active, step])

  const finish = () => {
    setActive(false)
    track('android_install_tour_finished')
  }

  const next = () => {
    if (current?.openApk) {
      track('android_apk_download_click', { source: 'tour' })
      window.open(apkUrl, '_blank', 'noopener,noreferrer')
    }
    if (step >= ANDROID_INSTALL_STEPS.length - 1) finish()
    else setStep(s => s + 1)
  }

  const back = () => setStep(s => Math.max(0, s - 1))

  if (!active || !current) return null

  const cardStyle: CSSProperties = hole
    ? {
        position: 'fixed',
        zIndex: 10002,
        left: 16,
        right: 16,
        maxWidth: 360,
        margin: '0 auto',
        ...(hole.top > window.innerHeight * 0.45
          ? { top: Math.max(16, hole.top - 180) }
          : { top: Math.min(window.innerHeight - 210, hole.top + hole.height + 16) }),
      }
    : {
        position: 'fixed',
        zIndex: 10002,
        left: 16,
        right: 16,
        bottom: 110,
        maxWidth: 360,
        margin: '0 auto',
      }

  return (
    <div className="tour-root android-install-tour" role="dialog" aria-modal="true" aria-label="Android install walkthrough">
      <div className="tour-dim" />
      {hole && (
        <div
          className="tour-spotlight-hole android-tour-hole"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
          }}
        />
      )}

      <div className="tour-card glass android-tour-card" style={cardStyle}>
        <div className="tour-progress">
          {ANDROID_INSTALL_STEPS.map((_, i) => (
            <span key={i} className={`tour-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
          ))}
        </div>
        <p className="android-tour-kicker">Android install guide</p>
        <h3>{current.title}</h3>
        <p>{current.body}</p>
        <div className="tour-actions">
          <button type="button" className="btn-glass" onClick={finish}>Skip</button>
          <div style={{ display: 'flex', gap: '0.45rem' }}>
            {step > 0 && (
              <button type="button" className="btn-glass" onClick={back}>Back</button>
            )}
            <button type="button" className="btn-primary" onClick={next}>
              {step >= ANDROID_INSTALL_STEPS.length - 1
                ? 'Done'
                : current.openApk
                  ? 'Open APK link'
                  : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
