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

const shared = {
  danger: '#dc2626',
  warning: '#c2410c',
  warningBg: '#fff7ed',
  warningBorder: '#fed7aa',
  infoBg: '#eff6ff',
  infoText: '#1d4ed8',
  white: '#ffffff',
  black: '#000000',
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
      background: '#eef7f2',
      surface: '#ffffff',
      surfaceMuted: '#f4faf7',
      border: '#cfe6da',
      borderStrong: '#a7d4bf',
      text: '#122a20',
      textSecondary: '#3f6153',
      textMuted: '#7fa393',
      success: '#059669',
      tabInactive: '#7fa393',
      glass: 'rgba(255,255,255,0.72)',
      glassBorder: 'rgba(255,255,255,0.55)',
      glassHighlight: 'rgba(255,255,255,0.9)',
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
      background: '#eef6fb',
      surface: '#ffffff',
      surfaceMuted: '#f4fafd',
      border: '#cde4f2',
      borderStrong: '#9ecae8',
      text: '#10222e',
      textSecondary: '#3d5b6e',
      textMuted: '#7fa0b3',
      success: '#16a34a',
      tabInactive: '#7fa0b3',
      glass: 'rgba(255,255,255,0.72)',
      glassBorder: 'rgba(255,255,255,0.55)',
      glassHighlight: 'rgba(255,255,255,0.9)',
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
      background: '#f3f1fa',
      surface: '#ffffff',
      surfaceMuted: '#f8f6fd',
      border: '#ddd5f2',
      borderStrong: '#c4b5e8',
      text: '#1e1730',
      textSecondary: '#52476b',
      textMuted: '#9488ad',
      success: '#16a34a',
      tabInactive: '#9488ad',
      glass: 'rgba(255,255,255,0.72)',
      glassBorder: 'rgba(255,255,255,0.55)',
      glassHighlight: 'rgba(255,255,255,0.9)',
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
      background: '#faf0f2',
      surface: '#ffffff',
      surfaceMuted: '#fdf6f7',
      border: '#f2d5db',
      borderStrong: '#e8b4be',
      text: '#2e1219',
      textSecondary: '#6d4550',
      textMuted: '#ad8792',
      success: '#16a34a',
      tabInactive: '#ad8792',
      glass: 'rgba(255,255,255,0.72)',
      glassBorder: 'rgba(255,255,255,0.55)',
      glassHighlight: 'rgba(255,255,255,0.9)',
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
      background: '#faf6f1',
      surface: '#ffffff',
      surfaceMuted: '#fdf9f4',
      border: '#ead9c8',
      borderStrong: '#d9bfa6',
      text: '#2a1c12',
      textSecondary: '#6b5240',
      textMuted: '#a88d78',
      success: '#16a34a',
      tabInactive: '#a88d78',
      glass: 'rgba(255,255,255,0.72)',
      glassBorder: 'rgba(255,255,255,0.55)',
      glassHighlight: 'rgba(255,255,255,0.9)',
    },
  },
]

export const THEME_STORAGE_KEY = 'cashtrail_theme'
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
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const

export const typography = {
  hero: 34,
  title: 22,
  subtitle: 16,
  body: 15,
  caption: 13,
  label: 12,
} as const
