import type { PostHog } from 'posthog-react-native'
import type { CachedUser } from '@/src/api/authStorage'

export const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() || ''
export const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com'

export const posthogEnabled = Boolean(POSTHOG_KEY)

let client: PostHog | null = null

/** Called from PostHogProvider bridge — do not use elsewhere. */
export function bindPostHog(ph: PostHog | null) {
  client = ph
}

export function identifyUser(user: CachedUser) {
  if (!client) return
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  try {
    client.identify(String(user.id), {
      ...(user.email ? { email: user.email } : {}),
      ...(name ? { name } : {}),
      ...(user.currency ? { currency: user.currency } : {}),
      ...(user.is_premium ? { is_premium: true } : {}),
      platform: 'android',
    })
  } catch {
    /* ignore */
  }
}

export function resetAnalytics() {
  if (!client) return
  try {
    client.reset()
  } catch {
    /* ignore */
  }
}

/** Safe capture — never throws; skips when PostHog is off. Never send amounts. */
export function track(
  event: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
) {
  if (!client) {
    if (__DEV__) {
      console.log('[WalletTrails analytics]', event, properties ?? {})
    }
    return
  }
  try {
    const cleaned: Record<string, string | number | boolean> = {}
    if (properties) {
      for (const [k, v] of Object.entries(properties)) {
        if (v === undefined || v === null) continue
        cleaned[k] = v
      }
    }
    client.capture(event, cleaned)
  } catch {
    /* ignore */
  }
}

export function captureScreen(pathname: string) {
  if (!client || !pathname) return
  try {
    client.screen(pathname, { $screen_name: pathname })
  } catch {
    /* ignore */
  }
}
