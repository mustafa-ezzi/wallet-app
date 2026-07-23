export type ThemeId = 'forest' | 'ocean' | 'slate' | 'blush' | 'clay'

export interface ThemeOption {
  id: ThemeId
  name: string
  /** Soft preview color for the round swatch */
  swatch: string
  /** Darker ring / selected accent */
  swatchEdge: string
  /** Browser chrome / theme-color meta */
  themeColor: string
}

export const THEMES: ThemeOption[] = [
  {
    id: 'forest',
    name: 'Forest',
    swatch: '#1f6432',
    swatchEdge: '#14401e',
    themeColor: '#1a5228',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    swatch: '#3a7d7a',
    swatchEdge: '#2a5c5a',
    themeColor: '#2f6865',
  },
  {
    id: 'slate',
    name: 'Slate',
    swatch: '#4a6b82',
    swatchEdge: '#334d5e',
    themeColor: '#3d5a6e',
  },
  {
    id: 'blush',
    name: 'Blush',
    swatch: '#b0707a',
    swatchEdge: '#8a555e',
    themeColor: '#9a606a',
  },
  {
    id: 'clay',
    name: 'Clay',
    swatch: '#9a7b5a',
    swatchEdge: '#735a40',
    themeColor: '#866b4c',
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
