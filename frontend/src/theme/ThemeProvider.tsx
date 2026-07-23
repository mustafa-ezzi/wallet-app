import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  THEMES,
  applyTheme,
  getStoredTheme,
  type ThemeId,
  type ThemeOption,
} from './themes'
import ThemeRevealOverlay from './ThemeRevealOverlay'

export interface ThemeOrigin { x: number; y: number }

interface ThemeContextValue {
  themeId: ThemeId
  theme: ThemeOption
  themes: ThemeOption[]
  transitioning: boolean
  setTheme: (id: ThemeId, origin?: ThemeOrigin) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface RevealState {
  colorFrom: string
  colorTo: string
  x: number
  y: number
  key: number
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => getStoredTheme())
  const [reveal, setReveal] = useState<RevealState | null>(null)
  const busyRef = useRef(false)

  const runReveal = useCallback((id: ThemeId, origin?: ThemeOrigin) => {
    const next = THEMES.find(t => t.id === id)
    if (!next) return

    const reduced =
      typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced || typeof window === 'undefined') {
      setThemeId(id)
      applyTheme(id)
      return
    }

    busyRef.current = true
    const x = origin?.x ?? window.innerWidth / 2
    const y = origin?.y ?? window.innerHeight / 2

    setReveal(prev => ({
      colorFrom: next.swatch,
      colorTo: next.swatchEdge,
      x,
      y,
      key: (prev?.key ?? 0) + 1,
    }))

    // Swap the theme once the circle has fully covered the screen
    window.setTimeout(() => {
      setThemeId(id)
      applyTheme(id)
    }, 500)

    // Remove overlay after the fade completes
    window.setTimeout(() => {
      setReveal(null)
      busyRef.current = false
    }, 950)
  }, [])

  const setTheme = useCallback((id: ThemeId, origin?: ThemeOrigin) => {
    if (busyRef.current || id === themeId) return
    runReveal(id, origin)
  }, [themeId, runReveal])

  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0]

  const value = useMemo(
    () => ({
      themeId,
      theme,
      themes: THEMES,
      transitioning: Boolean(reveal),
      setTheme,
    }),
    [themeId, theme, reveal, setTheme],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {reveal && typeof document !== 'undefined'
        ? createPortal(
            <ThemeRevealOverlay
              key={reveal.key}
              colorFrom={reveal.colorFrom}
              colorTo={reveal.colorTo}
              x={reveal.x}
              y={reveal.y}
            />,
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
