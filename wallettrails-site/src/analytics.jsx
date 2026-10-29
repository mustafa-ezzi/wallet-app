import { useState } from 'react'

const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim()
const CONSENT_KEY = 'wallettrails_analytics_consent'

export const analyticsEnabled = /^G-[A-Z0-9]+$/i.test(MEASUREMENT_ID)

export function readConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY)
  } catch {
    return null
  }
}

function remember(choice) {
  try {
    localStorage.setItem(CONSENT_KEY, choice)
  } catch {
    /* private mode can block storage; the choice still applies for this page */
  }
}

export function bootAnalytics() {
  if (!analyticsEnabled || window.__wtAnalytics) return
  window.__wtAnalytics = true
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    security_storage: 'granted',
  })
  if (readConsent() === 'granted') {
    window.gtag('consent', 'update', { analytics_storage: 'granted' })
  }
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`
  document.head.appendChild(script)
  window.gtag('js', new Date())
  window.gtag('config', MEASUREMENT_ID, { send_page_view: readConsent() === 'granted' })
}

export function grantAnalytics() {
  remember('granted')
  window.gtag?.('consent', 'update', { analytics_storage: 'granted' })
  window.gtag?.('event', 'page_view')
}

export function denyAnalytics() {
  remember('denied')
  window.gtag?.('consent', 'update', { analytics_storage: 'denied' })
}

export function track(name, params) {
  if (!analyticsEnabled || readConsent() !== 'granted') return
  window.gtag?.('event', name, params)
}

export function ConsentBanner() {
  const [choice, setChoice] = useState(readConsent)
  if (!analyticsEnabled || choice) return null
  return (
    <div className="consent" role="dialog" aria-label="Analytics consent">
      <p>We count visits so we can see which pages help. No ads. You can say no.</p>
      <div>
        <button type="button" className="no" onClick={() => { denyAnalytics(); setChoice('denied') }}>No thanks</button>
        <button type="button" className="yes" onClick={() => { grantAnalytics(); setChoice('granted') }}>Allow</button>
      </div>
    </div>
  )
}
