/** One-time “Budgets” feature announce after PWA refresh / first open of this build. */

export const BUDGETS_FEATURE_ID = 'budgets_v1'
export const BUDGETS_SEEN_KEY = 'cashtrail_seen_feature_budgets_v1'
export const BUDGETS_AFTER_UPDATE_KEY = 'cashtrail_announce_budgets_after_update'

/** Call right before applying a PWA update — What’s New opens on the next page load. */
export function markBudgetsAnnounceAfterUpdate() {
  try {
    sessionStorage.setItem(BUDGETS_AFTER_UPDATE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function consumeBudgetsAnnounceAfterUpdate(): boolean {
  try {
    if (sessionStorage.getItem(BUDGETS_AFTER_UPDATE_KEY) !== '1') return false
    sessionStorage.removeItem(BUDGETS_AFTER_UPDATE_KEY)
    return true
  } catch {
    return false
  }
}

export function hasSeenBudgetsFeature(): boolean {
  try {
    return localStorage.getItem(BUDGETS_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

export function markBudgetsFeatureSeen() {
  try {
    localStorage.setItem(BUDGETS_SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
}

/**
 * Show What’s New when:
 * - user just refreshed from the update dialog, or
 * - first time on a build that includes Budgets (they haven’t dismissed yet).
 */
export function shouldShowBudgetsWhatsNew(): boolean {
  if (hasSeenBudgetsFeature()) return false
  // Prefer post-refresh; also allow first open of the new build so the tip isn’t missed.
  consumeBudgetsAnnounceAfterUpdate()
  return true
}
