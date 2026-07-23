export type ThemeId = 'forest' | 'ocean' | 'slate' | 'blush' | 'clay'

export interface ThemeOption {
  id: ThemeId
  name: string
  /** Swatch color for the round picker button */
  swatch: string
  /** Darker ring / selected accent + reveal gradient end */
  swatchEdge: string
  /** Browser chrome / theme-color meta */
  themeColor: string
}

export const THEMES: ThemeOption[] = [
  {
    id: 'forest',
    name: 'Emerald',
    swatch: '#059669',
    swatchEdge: '#047857',
    themeColor: '#047857',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    swatch: '#0284c7',
    swatchEdge: '#0369a1',
    themeColor: '#0369a1',
  },
  {
    id: 'slate',
    name: 'Violet',
    swatch: '#7c3aed',
    swatchEdge: '#6d28d9',
    themeColor: '#6d28d9',
  },
  {
    id: 'blush',
    name: 'Rose',
    swatch: '#e11d48',
    swatchEdge: '#be123c',
    themeColor: '#be123c',
  },
  {
    id: 'clay',
    name: 'Amber',
    swatch: '#ea580c',
    swatchEdge: '#c2410c',
    themeColor: '#c2410c',
  },
]

export const THEME_STORAGE_KEY = 'cashtrail_theme'
export const DEFAULT_THEME: ThemeId = 'forest'

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some(t => t.id === value)
}

export function getStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeId(raw)) return raw
  } catch { /* ignore */ }
  return DEFAULT_THEME
}

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute('data-theme', id)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id)
  } catch { /* ignore */ }
  const meta = document.querySelector('meta[name="theme-color"]')
  const theme = THEMES.find(t => t.id === id)
  if (meta && theme) meta.setAttribute('content', theme.themeColor)
}
