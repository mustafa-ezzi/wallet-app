import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Dimensions, Platform, StyleSheet } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEMES,
  getTheme,
  isThemeId,
  type ColorTokens,
  type ThemeId,
  type ThemeOption,
} from './colors'

type ThemeContextValue = {
  themeId: ThemeId
  theme: ThemeOption
  colors: ColorTokens
  setThemeId: (id: ThemeId) => Promise<void>
  /** Telegram-style circular wipe: reveals the new theme expanding out from (originX, originY). */
  setThemeAnimated: (id: ThemeId, originX: number, originY: number) => void
  themes: ThemeOption[]
  /** @internal used by ThemeRevealOverlay */
  _reveal: {
    x: SharedValue<number>
    y: SharedValue<number>
    radius: SharedValue<number>
    opacity: SharedValue<number>
    color: string
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

async function readStored(): Promise<ThemeId> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(THEME_STORAGE_KEY)
      if (isThemeId(raw)) return raw
    } else {
      const raw = await SecureStore.getItemAsync(THEME_STORAGE_KEY)
      if (isThemeId(raw)) return raw
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME
}

async function writeStored(id: ThemeId) {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, id)
    } else {
      await SecureStore.setItemAsync(THEME_STORAGE_KEY, id)
    }
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME)
  const [ready, setReady] = useState(false)
  const [revealColor, setRevealColor] = useState('#047857')

  const revealX = useSharedValue(0)
  const revealY = useSharedValue(0)
  const revealRadius = useSharedValue(0)
  const revealOpacity = useSharedValue(0)

  useEffect(() => {
    void (async () => {
      const id = await readStored()
      setThemeIdState(id)
      setReady(true)
    })()
  }, [])

  const setThemeId = useCallback(async (id: ThemeId) => {
    setThemeIdState(id)
    await writeStored(id)
  }, [])

  const setThemeAnimated = useCallback(
    (id: ThemeId, originX: number, originY: number) => {
      const target = getTheme(id)
      const { width, height } = Dimensions.get('window')
      const dx = Math.max(originX, width - originX)
      const dy = Math.max(originY, height - originY)
      const maxRadius = Math.sqrt(dx * dx + dy * dy) + 8

      setRevealColor(target.colors.primaryDark)
      revealX.value = originX
      revealY.value = originY
      revealRadius.value = 0
      revealOpacity.value = 1

      const commit = () => {
        void setThemeId(id)
      }
      const fadeOut = () => {
        revealOpacity.value = withTiming(
          0,
          { duration: 360, easing: Easing.in(Easing.cubic) },
          (fin) => {
            'worklet'
            if (fin) revealRadius.value = 0
          },
        )
      }

      revealRadius.value = withTiming(
        maxRadius,
        { duration: 460, easing: Easing.out(Easing.cubic) },
        (finished) => {
          'worklet'
          if (finished) {
            runOnJS(commit)()
            runOnJS(fadeOut)()
          }
        },
      )
    },
    [revealX, revealY, revealRadius, revealOpacity, setThemeId],
  )

  const theme = getTheme(themeId)
  const value = useMemo(
    () => ({
      themeId,
      theme,
      colors: theme.colors,
      setThemeId,
      setThemeAnimated,
      themes: THEMES,
      _reveal: {
        x: revealX,
        y: revealY,
        radius: revealRadius,
        opacity: revealOpacity,
        color: revealColor,
      },
    }),
    [themeId, theme, setThemeId, setThemeAnimated, revealX, revealY, revealRadius, revealOpacity, revealColor],
  )

  // Avoid flash: still render with default until hydrated
  if (!ready) {
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

/** Safe colors hook — falls back to forest if outside provider */
export function useColors(): ColorTokens {
  const ctx = useContext(ThemeContext)
  return ctx?.colors ?? THEMES[0].colors
}

/**
 * Full-screen overlay that paints the Telegram-style circular "wipe" when the
 * theme changes. Mount once near the root, above everything else.
 */
export function ThemeRevealOverlay() {
  const ctx = useContext(ThemeContext)
  const x = ctx?._reveal.x
  const y = ctx?._reveal.y
  const radius = ctx?._reveal.radius
  const opacity = ctx?._reveal.opacity
  const color = ctx?._reveal.color ?? 'transparent'

  const style = useAnimatedStyle(() => {
    if (!x || !y || !radius || !opacity) return { opacity: 0 }
    const r = radius.value
    return {
      position: 'absolute',
      left: x.value - r,
      top: y.value - r,
      width: r * 2,
      height: r * 2,
      borderRadius: r,
      opacity: opacity.value,
      backgroundColor: color,
    }
  }, [x, y, radius, opacity, color])

  if (!ctx) return null

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap]}>
      <Animated.View style={style} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { zIndex: 9999, elevation: 9999 },
})
