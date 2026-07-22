import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

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
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

let listening = false
function ensureGlobalListeners() {
  if (listening || typeof window === 'undefined') return
  listening = true
  installedFlag = isStandalone()

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })

  window.addEventListener('appinstalled', () => {
    installedFlag = true
    deferredPrompt = null
    emit()
  })
}

export function usePwaInstall() {
  const [dialogOpen, setDialogOpen] = useState(false)
  useSyncExternalStore(subscribe, getVersion, () => 0)

  useEffect(() => {
    ensureGlobalListeners()
    const next = isStandalone()
    if (next !== installedFlag) {
      installedFlag = next
      emit()
    }
  }, [])

  const ios = isIos()
  const canPrompt = Boolean(deferredPrompt)
  const showInstallUi = !installedFlag

  /** Prefer native Chrome/Edge install UI; fall back to instructions dialog. */
  const install = useCallback(async () => {
    const promptEvent = deferredPrompt
    if (promptEvent) {
      try {
        await promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice
        deferredPrompt = null
        if (outcome === 'accepted') {
          installedFlag = true
          setDialogOpen(false)
        }
        emit()
      } catch {
        setDialogOpen(true)
      }
      return
    }
    // No native prompt yet (iOS, Firefox, or criteria not met)
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
