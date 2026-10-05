/** Multi-account session registry for the web app (localStorage). */

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

export const ACCESS_KEY = 'access_token'
export const REFRESH_KEY = 'refresh_token'
export const USER_CACHE_KEY = 'WalletTrails_user'
const SESSIONS_KEY = 'wallettrails_sessions_v1'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private mode */
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setActiveTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearActiveTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export function readCachedUser(): CachedUser | null {
  const parsed = readJson<CachedUser>(USER_CACHE_KEY)
  if (!parsed || typeof parsed.id !== 'number') return null
  return parsed
}

export function writeCachedUser(user: CachedUser | null): void {
  try {
    if (!user) localStorage.removeItem(USER_CACHE_KEY)
    else localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
  } catch {
    /* ignore */
  }
}

function readSessionsMap(): Record<string, SavedSession> {
  const map = readJson<Record<string, SavedSession>>(SESSIONS_KEY)
  if (!map || typeof map !== 'object') return {}
  return map
}

function writeSessionsMap(map: Record<string, SavedSession>): void {
  const keys = Object.keys(map)
  if (keys.length === 0) {
    try {
      localStorage.removeItem(SESSIONS_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  writeJson(SESSIONS_KEY, map)
}

/** Persist active tokens + user into the multi-account map. */
export function upsertActiveSession(): void {
  const access = getAccessToken()
  const refresh = getRefreshToken()
  const user = readCachedUser()
  if (!access || !refresh || !user?.id) return
  const map = readSessionsMap()
  map[String(user.id)] = { access, refresh, user }
  writeSessionsMap(map)
}

/** After token refresh: update active access and the matching saved session. */
export function patchActiveAccessToken(access: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  const user = readCachedUser()
  if (!user?.id) return
  const map = readSessionsMap()
  const existing = map[String(user.id)]
  if (!existing) return
  map[String(user.id)] = { ...existing, access }
  writeSessionsMap(map)
}

export function listSavedSessions(): SavedSession[] {
  upsertActiveSession()
  return Object.values(readSessionsMap()).filter(
    (s) => s?.user?.id && s.access && s.refresh,
  )
}

export function listSavedUsers(): CachedUser[] {
  return listSavedSessions().map((s) => s.user)
}

export function activateSession(userId: number): SavedSession | null {
  const map = readSessionsMap()
  const session = map[String(userId)]
  if (!session?.access || !session.refresh || !session.user) return null
  setActiveTokens(session.access, session.refresh)
  writeCachedUser(session.user)
  return session
}

export function removeSession(userId: number): void {
  const map = readSessionsMap()
  delete map[String(userId)]
  writeSessionsMap(map)
}

/** Clear only the active slot; keep other saved accounts. */
export function clearActiveSession(): void {
  clearActiveTokens()
  writeCachedUser(null)
}

/** Clear active and remove that user from the saved map. */
export function clearSession(): void {
  const user = readCachedUser()
  clearActiveTokens()
  writeCachedUser(null)
  if (user?.id) removeSession(user.id)
}

export function clearAllSessions(): void {
  try {
    localStorage.removeItem(SESSIONS_KEY)
  } catch {
    /* ignore */
  }
  clearActiveTokens()
  writeCachedUser(null)
}
