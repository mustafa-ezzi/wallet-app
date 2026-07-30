/** Thin analytics stub — wire PostHog later; never send amounts. */
export function track(event: string, properties?: Record<string, string | number | boolean | null>) {
  if (__DEV__) {
    console.log('[CashTrail analytics]', event, properties ?? {})
  }
}
