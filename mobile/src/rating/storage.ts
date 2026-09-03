import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const KEY = 'wallettrails_rating_prompt_v1'

export type RatingPromptStatus = 'none' | 'shown' | 'dismissed' | 'submitted'

export type RatingPromptState = {
  lastOpenDate: string
  streakCount: number
  status: RatingPromptStatus
  lastRating?: number
}

const DEFAULT: RatingPromptState = {
  lastOpenDate: '',
  streakCount: 0,
  status: 'none',
}

async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return null
      return localStorage.getItem(key)
    }
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function getRatingPromptState(): Promise<RatingPromptState> {
  const raw = await getItem(KEY)
  if (!raw) return { ...DEFAULT }
  try {
    const parsed = JSON.parse(raw) as Partial<RatingPromptState>
    return {
      lastOpenDate: typeof parsed.lastOpenDate === 'string' ? parsed.lastOpenDate : '',
      streakCount: typeof parsed.streakCount === 'number' ? parsed.streakCount : 0,
      status: parsed.status === 'shown' || parsed.status === 'dismissed' || parsed.status === 'submitted'
        ? parsed.status
        : 'none',
      lastRating: typeof parsed.lastRating === 'number' ? parsed.lastRating : undefined,
    }
  } catch {
    return { ...DEFAULT }
  }
}

export async function setRatingPromptState(next: RatingPromptState): Promise<void> {
  await setItem(KEY, JSON.stringify(next))
}

/** Local calendar YYYY-MM-DD */
export function localDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function yesterdayKey(from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() - 1)
  return localDateKey(d)
}

export const RATING_STREAK_DAYS = 4
export const WALLETTRAILS_SHARE_URL = 'https://wallettrails.up.railway.app/'
