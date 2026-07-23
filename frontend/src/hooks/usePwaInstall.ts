import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const LS_INSTALLED = 'cashtrail_pwa_installed'

/** Module-level store — survives Layout remounts so the browser install
 *  event is not lost after the first fire. */
let deferredPrompt: BeforeInstallPromptEvent | null = null
let installedFlag = false
let storeVersion = 0
const listeners = new Set<() => void>()

function emit() {
  storeVersion += 1
  listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getVersion() {
  return storeVersion
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia
  return (
    mq('(display-mode: standalone)').matches
    || mq('(display-mode: fullscreen)').matches
    || mq('(display-mode: minimal-ui)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function readPersistedInstalled(): boolean {
  try {
    return localStorage.getItem(LS_INSTALLED) === '1'
  } catch {
    return false
  }
}

function markInstalled() {
  installedFlag = true
  deferredPrompt = null
  try {
    localStorage.setItem(LS_INSTALLED, '1')
  } catch { /* ignore */ }
  emit()
}

let listening = false
function ensureGlobalListeners() {
  if (listening || typeof window === 'undefined') return
  listening = true

  if (readPersistedInstalled() || isStandalone()) {
    markInstalled()
  }

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    // Already running as installed app — never re-show install UI
    if (installedFlag || isStandalone()) {
      markInstalled()
      return
    }
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })

  window.addEventListener('appinstalled', () => {
    markInstalled()
  })
}

export function usePwaInstall() {
  const [dialogOpen, setDialogOpen] = useState(false)
  useSyncExternalStore(subscribe, getVersion, () => 0)

  useEffect(() => {
    ensureGlobalListeners()
    if (isStandalone() || readPersistedInstalled()) {
      markInstalled()
    }
  }, [])

  const ios = isIos()
  const canPrompt = Boolean(deferredPrompt)
  // Hide when installed / standalone. On refresh, only show if we can actually install
  // (native prompt ready) or iOS (manual Add to Home Screen).
  const showInstallUi = !installedFlag && !isStandalone() && (canPrompt || ios)

  const install = useCallback(async () => {
    const promptEvent = deferredPrompt
    if (promptEvent) {
      try {
        await promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice
        deferredPrompt = null
        if (outcome === 'accepted') {
          markInstalled()
          setDialogOpen(false)
        } else {
          emit()
        }
      } catch {
        setDialogOpen(true)
      }
      return
    }
    setDialogOpen(true)
  }, [])

  return {
    installed: installedFlag,
    showInstallUi,
    canPrompt,
    ios,
    dialogOpen,
    setDialogOpen,
    install,
  }
}
