export type ThemeId = 'forest' | 'ocean' | 'slate' | 'blush' | 'clay'

export type ColorTokens = {
  primary: string
  primaryDark: string
  primarySoft: string
  background: string
  surface: string
  surfaceMuted: string
  border: string
  borderStrong: string
  text: string
  textSecondary: string
  textMuted: string
  success: string
  danger: string
  warning: string
  warningBg: string
  warningBorder: string
  infoBg: string
  infoText: string
  white: string
  black: string
  tabInactive: string
  /** Liquid glass island fill */
  glass: string
  glassBorder: string
  glassHighlight: string
}

export type ThemeOption = {
  id: ThemeId
  name: string
  swatch: string
  swatchEdge: string
  colors: ColorTokens
}

/** Shared iOS-glass tokens — frosted, slightly cooler white. */
const iosGlass = {
  glass: 'rgba(255,255,255,0.62)',
  glassBorder: 'rgba(255,255,255,0.68)',
  glassHighlight: 'rgba(255,255,255,0.95)',
} as const

const shared = {
  danger: '#dc2626',
  warning: '#c2410c',
  warningBg: '#fff7ed',
  warningBorder: '#fed7aa',
  infoBg: '#eff6ff',
  infoText: '#1d4ed8',
  white: '#ffffff',
  black: '#000000',
  ...iosGlass,
} as const

export const THEMES: ThemeOption[] = [
  {
    id: 'forest',
    name: 'Emerald',
    swatch: '#059669',
    swatchEdge: '#047857',
    colors: {
      ...shared,
      primary: '#059669',
      primaryDark: '#047857',
      primarySoft: '#10b981',
      // Soft system-gray-green, iOS grouped background feel
      background: '#f2f7f4',
      surface: 'rgba(255,255,255,0.92)',
      surfaceMuted: '#eef6f1',
      border: 'rgba(15, 55, 40, 0.08)',
      borderStrong: '#a7d4bf',
      text: '#0f1f18',
      textSecondary: '#3f6153',
      textMuted: '#7fa393',
      success: '#059669',
      tabInactive: '#8aa89a',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    swatch: '#0284c7',
    swatchEdge: '#0369a1',
    colors: {
      ...shared,
      primary: '#0284c7',
      primaryDark: '#0369a1',
      primarySoft: '#0ea5e9',
      background: '#f1f6fa',
      surface: 'rgba(255,255,255,0.92)',
      surfaceMuted: '#eef5fa',
      border: 'rgba(16, 45, 64, 0.08)',
      borderStrong: '#9ecae8',
      text: '#0c1c26',
      textSecondary: '#3d5b6e',
      textMuted: '#7fa0b3',
      success: '#16a34a',
      tabInactive: '#8aabbd',
    },
  },
  {
    id: 'slate',
    name: 'Violet',
    swatch: '#7c3aed',
    swatchEdge: '#6d28d9',
    colors: {
      ...shared,
      primary: '#7c3aed',
      primaryDark: '#6d28d9',
      primarySoft: '#8b5cf6',
      background: '#f4f2f8',
      surface: 'rgba(255,255,255,0.92)',
      surfaceMuted: '#f1eef8',
      border: 'rgba(40, 28, 70, 0.08)',
      borderStrong: '#c4b5e8',
      text: '#171225',
      textSecondary: '#52476b',
      textMuted: '#9488ad',
      success: '#16a34a',
      tabInactive: '#9d91b5',
    },
  },
  {
    id: 'blush',
    name: 'Rose',
    swatch: '#e11d48',
    swatchEdge: '#be123c',
    colors: {
      ...shared,
      primary: '#e11d48',
      primaryDark: '#be123c',
      primarySoft: '#f43f5e',
      background: '#faf3f5',
      surface: 'rgba(255,255,255,0.92)',
      surfaceMuted: '#f8eef1',
      border: 'rgba(60, 20, 32, 0.08)',
      borderStrong: '#e8b4be',
      text: '#261017',
      textSecondary: '#6d4550',
      textMuted: '#ad8792',
      success: '#16a34a',
      tabInactive: '#b5949e',
    },
  },
  {
    id: 'clay',
    name: 'Amber',
    swatch: '#ea580c',
    swatchEdge: '#c2410c',
    colors: {
      ...shared,
      primary: '#ea580c',
      primaryDark: '#c2410c',
      primarySoft: '#f97316',
      background: '#f8f4ef',
      surface: 'rgba(255,255,255,0.92)',
      surfaceMuted: '#f5efe8',
      border: 'rgba(55, 35, 18, 0.08)',
      borderStrong: '#d9bfa6',
      text: '#24180f',
      textSecondary: '#6b5240',
      textMuted: '#a88d78',
      success: '#16a34a',
      tabInactive: '#b09a86',
    },
  },
]

export const THEME_STORAGE_KEY = 'wallettrails_theme'
export const DEFAULT_THEME: ThemeId = 'forest'

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

export function getTheme(id: ThemeId): ThemeOption {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Default forest tokens — prefer useTheme().colors in UI */
export const colors: ColorTokens = THEMES[0].colors

export const spacing = {
  xs: 3,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 28,
} as const

/** Softer continuous-corner radii (iOS-like), slightly tighter for denser UI. */
export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 999,
} as const

/** iOS-style elevated card shadow (spread via shadowRadius). */
export const iosShadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.07,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const

export const typography = {
  hero: 28,
  title: 18,
  subtitle: 14,
  body: 13,
  caption: 11,
  label: 10,
} as const
