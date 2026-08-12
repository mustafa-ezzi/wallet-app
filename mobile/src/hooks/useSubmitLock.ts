import { useCallback, useRef } from 'react'

/**
 * Prevents double-taps from firing the same async save twice (common on Android
 * when the button stays pressable until the next React render).
 */
export function useSubmitLock() {
  const locked = useRef(false)

  const runLocked = useCallback(async (fn: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true
    try {
      await fn()
    } finally {
      locked.current = false
    }
  }, [])

  /** Call at the top of a handler; returns false if already in flight. */
  const tryLock = useCallback(() => {
    if (locked.current) return false
    locked.current = true
    return true
  }, [])

  const unlock = useCallback(() => {
    locked.current = false
  }, [])

  return { runLocked, tryLock, unlock, isLocked: () => locked.current }
}
