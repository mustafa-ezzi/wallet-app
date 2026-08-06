import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const ACCESS = 'cashtrail_access_token'
const REFRESH = 'cashtrail_refresh_token'
const USER = 'cashtrail_user'

export type CachedUser = {
  id: number
  first_name: string
  last_name: string
  username: string
  email: string
  currency: string
  is_premium?: boolean
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

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS)
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH)
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await setItem(ACCESS, access)
  await setItem(REFRESH, refresh)
}

export async function clearTokens(): Promise<void> {
  await deleteItem(ACCESS)
  await deleteItem(REFRESH)
}

export async function getCachedUser(): Promise<CachedUser | null> {
  try {
    const raw = await getItem(USER)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedUser
    if (!parsed || typeof parsed.id !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export async function setCachedUser(user: CachedUser | null): Promise<void> {
  if (!user) {
    await deleteItem(USER)
    return
  }
  await setItem(USER, JSON.stringify(user))
}

export async function clearSession(): Promise<void> {
  await clearTokens()
  await setCachedUser(null)
}
