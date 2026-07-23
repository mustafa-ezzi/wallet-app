import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  THEMES,
  applyTheme,
  getStoredTheme,
  type ThemeId,
  type ThemeOption,
} from './themes'
import ThemeWaveOverlay from './ThemeWaveOverlay'

interface ThemeContextValue {
  themeId: ThemeId
  theme: ThemeOption
  themes: ThemeOption[]
  transitioning: boolean
  setTheme: (id: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => getStoredTheme())
  const [waveColor, setWaveColor] = useState<string | null>(null)
  const [waveKey, setWaveKey] = useState(0)
  const busyRef = useRef(false)
  const pendingRef = useRef<ThemeId | null>(null)

  const runWave = useCallback((id: ThemeId) => {
    const next = THEMES.find(t => t.id === id)
    if (!next) return

    const reduced =
      typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      setThemeId(id)
      applyTheme(id)
      return
    }

    busyRef.current = true
    setWaveColor(next.swatch)
    setWaveKey(k => k + 1)

    window.setTimeout(() => {
      setThemeId(id)
      applyTheme(id)
    }, 420)

    window.setTimeout(() => {
      setWaveColor(null)
      busyRef.current = false
      const pending = pendingRef.current
      pendingRef.current = null
      if (pending && pending !== id) runWave(pending)
    }, 1180)
  }, [])

  const setTheme = useCallback((id: ThemeId) => {
    if (id === themeId && !busyRef.current) return
    if (busyRef.current) {
      pendingRef.current = id
      return
    }
    runWave(id)
  }, [themeId, runWave])

  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0]

  const value = useMemo(
    () => ({
      themeId,
      theme,
      themes: THEMES,
      transitioning: Boolean(waveColor),
      setTheme,
    }),
    [themeId, theme, waveColor, setTheme],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {waveColor && typeof document !== 'undefined'
        ? createPortal(
            <ThemeWaveOverlay key={waveKey} color={waveColor} />,
            document.body,
          )
        : null}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
