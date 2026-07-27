import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY?.trim()
const HOST = (import.meta.env.VITE_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com')

let started = false

/** Init once at app boot. No-ops when VITE_POSTHOG_KEY is missing (local/dev safe). */
export function initAnalytics() {
  if (started || typeof window === 'undefined' || !KEY) return
  started = true

  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '.amt-negative, .amt-positive, .stat-value, .balance-value',
    },
  })
}

export function identifyUser(user: {
  id: number
  email?: string
  first_name?: string
  last_name?: string
  currency?: string
}) {
  if (!started) return
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  posthog.identify(String(user.id), {
    ...(user.email ? { email: user.email } : {}),
    ...(name ? { name } : {}),
    ...(user.currency ? { currency: user.currency } : {}),
  })
}

export function resetAnalytics() {
  if (!started) return
  posthog.reset()
}

/** Safe capture — never throws; skips when PostHog is not configured. */
export function track(event: string, properties?: Record<string, string | number | boolean | null | undefined>) {
  if (!started) return
  try {
    const cleaned: Record<string, string | number | boolean> = {}
    if (properties) {
      for (const [k, v] of Object.entries(properties)) {
        if (v === undefined || v === null) continue
        cleaned[k] = v
      }
    }
    posthog.capture(event, cleaned)
  } catch {
    /* ignore analytics errors */
  }
}

export { posthog }
