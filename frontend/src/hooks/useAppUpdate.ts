import { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

const CHECK_INTERVAL_MS = 60 * 1000 // check for new builds every minute while app is open

export function useAppUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onRegisteredSW(_swUrl, registration) {
        if (registration) registrationRef.current = registration
      },
    })
    updateSWRef.current = updateSW

    const check = () => {
      void registrationRef.current?.update()
    }
    const intervalId = window.setInterval(check, CHECK_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await updateSWRef.current?.(true)
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }, [])

  return {
    needRefresh,
    refreshing,
    refresh,
  }
}
