import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const ACCESS = 'wallettrails_access_token'
const REFRESH = 'wallettrails_refresh_token'
const USER = 'wallettrails_user'
/** Comma-separated user ids that have a saved session. */
const SESSION_IDS = 'wallettrails_session_ids'

export type CachedUser = {
  id: number
  first_name: string
  last_name: string
  username: string
  email: string
  currency: string
  is_premium?: boolean
  date_of_birth?: string | null
  gender?: string
  user_type?: string
  country?: string
  onboarding_complete?: boolean
}

export type SavedSession = {
  access: string
  refresh: string
  user: CachedUser
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

function sessionAccessKey(userId: number) {
  return `wt_sess_${userId}_a`
}
function sessionRefreshKey(userId: number) {
  return `wt_sess_${userId}_r`
}
function sessionUserKey(userId: number) {
  return `wt_sess_${userId}_u`
}

async function readSessionIds(): Promise<number[]> {
  const raw = await getItem(SESSION_IDS)
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

async function writeSessionIds(ids: number[]): Promise<void> {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))]
  if (unique.length === 0) {
    await deleteItem(SESSION_IDS)
    return
  }
  await setItem(SESSION_IDS, unique.join(','))
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS)
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH)
}

/** Write active tokens only. Call `upsertActiveSession` after the user is known. */
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

/** Persist the current active session into the multi-account map. */
export async function upsertActiveSession(): Promise<void> {
  const [access, refresh, user] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getCachedUser(),
  ])
  if (!access || !refresh || !user?.id) return
  await setItem(sessionAccessKey(user.id), access)
  await setItem(sessionRefreshKey(user.id), refresh)
  await setItem(sessionUserKey(user.id), JSON.stringify(user))
  const ids = await readSessionIds()
  if (!ids.includes(user.id)) {
    await writeSessionIds([...ids, user.id])
  }
}

export async function listSavedSessions(): Promise<SavedSession[]> {
  // Migrate: if we have an active session but no map yet, seed it
  await upsertActiveSession()

  const ids = await readSessionIds()
  const sessions: SavedSession[] = []
  for (const id of ids) {
    const [access, refresh, userRaw] = await Promise.all([
      getItem(sessionAccessKey(id)),
      getItem(sessionRefreshKey(id)),
      getItem(sessionUserKey(id)),
    ])
    if (!access || !refresh || !userRaw) continue
    try {
      const user = JSON.parse(userRaw) as CachedUser
      if (!user || user.id !== id) continue
      sessions.push({ access, refresh, user })
    } catch {
      /* skip corrupt */
    }
  }
  return sessions
}

export async function listSavedUsers(): Promise<CachedUser[]> {
  const sessions = await listSavedSessions()
  return sessions.map((s) => s.user)
}

export async function activateSession(userId: number): Promise<SavedSession | null> {
  const access = await getItem(sessionAccessKey(userId))
  const refresh = await getItem(sessionRefreshKey(userId))
  const userRaw = await getItem(sessionUserKey(userId))
  if (!access || !refresh || !userRaw) return null
  let user: CachedUser
  try {
    user = JSON.parse(userRaw) as CachedUser
  } catch {
    return null
  }
  if (!user || user.id !== userId) return null
  await setItem(ACCESS, access)
  await setItem(REFRESH, refresh)
  await setItem(USER, JSON.stringify(user))
  return { access, refresh, user }
}

export async function removeSession(userId: number): Promise<void> {
  await deleteItem(sessionAccessKey(userId))
  await deleteItem(sessionRefreshKey(userId))
  await deleteItem(sessionUserKey(userId))
  const ids = await readSessionIds()
  await writeSessionIds(ids.filter((id) => id !== userId))
}

/** Clear only the active token slot (keeps other saved accounts). */
export async function clearActiveSession(): Promise<void> {
  await clearTokens()
  await setCachedUser(null)
}

/** Clear active + remove that user from the saved map (token invalid / logout this account). */
export async function clearSession(): Promise<void> {
  const user = await getCachedUser()
  await clearTokens()
  await deleteItem(USER)
  if (user?.id) {
    await removeSession(user.id)
  }
}

export async function clearAllSessions(): Promise<void> {
  const ids = await readSessionIds()
  for (const id of ids) {
    await deleteItem(sessionAccessKey(id))
    await deleteItem(sessionRefreshKey(id))
    await deleteItem(sessionUserKey(id))
  }
  await deleteItem(SESSION_IDS)
  await clearTokens()
  await deleteItem(USER)
}
