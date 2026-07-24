import { useCallback, useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

const CHECK_INTERVAL_MS = 60 * 1000

type UpdateSW = (reloadPage?: boolean) => Promise<void>

/** Module-level singleton — register the SW exactly once for the whole app. */
let updateSW: UpdateSW | null = null
let registration: ServiceWorkerRegistration | null = null
let promptShown = false
let checksStarted = false
let checkCleanup: (() => void) | null = null
const listeners = new Set<(need: boolean) => void>()

function notify(need: boolean) {
  listeners.forEach(fn => fn(need))
}

function ensureRegistered() {
  if (updateSW || typeof window === 'undefined') return

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Only surface the dialog once per waiting update
      if (promptShown) return
      promptShown = true
      notify(true)
    },
    onRegisteredSW(_swUrl, reg) {
      if (reg) registration = reg
    },
  })
}

function ensurePeriodicChecks() {
  if (checksStarted || typeof window === 'undefined') return
  checksStarted = true

  const check = () => {
    void registration?.update().catch(() => { /* ignore offline / abort */ })
  }
  const intervalId = window.setInterval(check, CHECK_INTERVAL_MS)
  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }
  document.addEventListener('visibilitychange', onVisible)
  checkCleanup = () => {
    window.clearInterval(intervalId)
    document.removeEventListener('visibilitychange', onVisible)
    checksStarted = false
    checkCleanup = null
  }
}

/**
 * Apply the waiting service worker and reload once.
 * Do NOT call location.reload() in parallel with updateSW(true) — that race
 * loads stale hashed assets and blanks the page on mobile PWAs.
 */
async function applyUpdate(): Promise<void> {
  ensureRegistered()
  if (!updateSW) {
    window.location.reload()
    return
  }

  let reloaded = false
  const reloadOnce = () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  }

  // Covers the case where vite-plugin-pwa skips its own reload
  // (event.isUpdate === false on first install in the same tab).
  navigator.serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true })

  try {
    await updateSW(true)
  } catch {
    reloadOnce()
    return
  }

  // Fallback if controlling never fires
  window.setTimeout(reloadOnce, 1500)
}

export function useAppUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    ensureRegistered()
    ensurePeriodicChecks()
    const onNeed = (need: boolean) => setNeedRefresh(need)
    listeners.add(onNeed)
    if (promptShown) setNeedRefresh(true)

    return () => {
      listeners.delete(onNeed)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    setNeedRefresh(false)
    try {
      await applyUpdate()
    } catch {
      window.location.reload()
    }
  }, [refreshing])

  return {
    needRefresh,
    refreshing,
    refresh,
  }
}

/** Exposed for tests / HMR cleanup only. */
export function __resetAppUpdateForTests() {
  promptShown = false
  checkCleanup?.()
}
