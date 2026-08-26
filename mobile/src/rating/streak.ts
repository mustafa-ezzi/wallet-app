import {
  getRatingPromptState,
  localDateKey,
  setRatingPromptState,
  yesterdayKey,
  RATING_STREAK_DAYS,
  type RatingPromptState,
} from './storage'

export type AppOpenResult = {
  state: RatingPromptState
  /** True once when streak hits threshold and prompt has never finished. */
  shouldShowPrompt: boolean
}

/** Avoid showing twice in the same JS runtime (e.g. tab remount). */
let offeredThisProcess = false

/**
 * Record a calendar-day app open. Call once when the main tabs shell mounts
 * for a logged-in, onboarded user.
 */
export async function recordAppOpen(): Promise<AppOpenResult> {
  const prev = await getRatingPromptState()
  const today = localDateKey()

  // Finished — keep streak stats but never re-prompt (v1).
  if (prev.status === 'dismissed' || prev.status === 'submitted') {
    if (prev.lastOpenDate !== today) {
      const streak =
        prev.lastOpenDate === yesterdayKey()
          ? prev.streakCount + 1
          : 1
      const next = { ...prev, lastOpenDate: today, streakCount: streak }
      await setRatingPromptState(next)
      return { state: next, shouldShowPrompt: false }
    }
    return { state: prev, shouldShowPrompt: false }
  }

  let next: RatingPromptState = prev

  if (prev.lastOpenDate !== today) {
    const streak =
      prev.lastOpenDate === yesterdayKey()
        ? prev.streakCount + 1
        : 1
    next = {
      ...prev,
      lastOpenDate: today,
      streakCount: streak,
    }
    await setRatingPromptState(next)
  }

  const eligible =
    next.streakCount >= RATING_STREAK_DAYS
    && (next.status === 'none' || next.status === 'shown')

  const shouldShowPrompt = eligible && !offeredThisProcess
  if (shouldShowPrompt) offeredThisProcess = true

  return { state: next, shouldShowPrompt }
}

export async function markRatingShown(): Promise<void> {
  const prev = await getRatingPromptState()
  if (prev.status === 'dismissed' || prev.status === 'submitted') return
  await setRatingPromptState({ ...prev, status: 'shown' })
}

export async function markRatingDismissed(): Promise<void> {
  const prev = await getRatingPromptState()
  await setRatingPromptState({ ...prev, status: 'dismissed' })
  offeredThisProcess = true
}

export async function markRatingSubmitted(stars: number): Promise<void> {
  const prev = await getRatingPromptState()
  await setRatingPromptState({
    ...prev,
    status: 'submitted',
    lastRating: stars,
  })
  offeredThisProcess = true
}

/** Test helper: reset gate + pretend 4-day streak so the prompt can show immediately. */
export async function prepareRatingPromptForTest(): Promise<void> {
  offeredThisProcess = false
  await setRatingPromptState({
    lastOpenDate: localDateKey(),
    streakCount: RATING_STREAK_DAYS,
    status: 'none',
  })
}
