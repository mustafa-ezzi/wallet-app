import { Platform } from 'react-native'
import Constants from 'expo-constants'

type GoogleModule = {
  GoogleSignin: {
    configure: (opts: { webClientId: string; offlineAccess?: boolean }) => void
    hasPlayServices: (opts?: { showPlayServicesUpdateDialog?: boolean }) => Promise<boolean>
    signIn: () => Promise<{ type?: string; data?: { idToken?: string | null } } | { idToken?: string | null }>
    signOut: () => Promise<void>
  }
  isSuccessResponse?: (response: unknown) => boolean
  statusCodes?: { SIGN_IN_CANCELLED?: string; IN_PROGRESS?: string; PLAY_SERVICES_NOT_AVAILABLE?: string }
}

const DEFAULT_WEB_CLIENT_ID =
  '85845263961-bqvqpr0jeo5id40v17aj3dm5u5bt4a1c.apps.googleusercontent.com'

function extraWebClientId(): string {
  const extra = (Constants.expoConfig?.extra || Constants.manifest?.extra || {}) as {
    googleWebClientId?: string
  }
  return (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim()
    || extra.googleWebClientId?.trim()
    || DEFAULT_WEB_CLIENT_ID
  )
}

function loadModule(): GoogleModule | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'web') return null
  try {
    return require('@react-native-google-signin/google-signin') as GoogleModule
  } catch {
    return null
  }
}

let configured = false

function ensureConfigured(mod: GoogleModule): string {
  const webClientId = extraWebClientId()
  if (!webClientId) {
    throw new Error(
      'Google Sign-In is not configured. Add a Web client ID (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) and rebuild.',
    )
  }
  if (!configured) {
    mod.GoogleSignin.configure({ webClientId, offlineAccess: false })
    configured = true
  }
  return webClientId
}

function extractIdToken(response: unknown): string {
  const rec = response as {
    type?: string
    data?: { idToken?: string | null }
    idToken?: string | null
  }
  const token = rec?.data?.idToken || rec?.idToken || ''
  return String(token).trim()
}

export async function getGoogleIdToken(): Promise<string> {
  const mod = loadModule()
  if (!mod) {
    throw new Error('Google Sign-In is only available on the Android app.')
  }
  ensureConfigured(mod)
  if (Platform.OS === 'android') {
    await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  }
  const response = await mod.GoogleSignin.signIn()
  if (mod.isSuccessResponse && !mod.isSuccessResponse(response)) {
    throw new Error('cancelled')
  }
  const idToken = extractIdToken(response)
  if (!idToken) {
    throw new Error(
      'Google did not return a sign-in token. Add the Web client ID and the app SHA-1 in Google Cloud, then rebuild.',
    )
  }
  return idToken
}

export function googleSignInErrorMessage(err: unknown, fallback = 'Google sign-in failed.'): string {
  const rec = err as { code?: string; message?: string }
  const msg = (rec?.message || '').toLowerCase()
  const code = String(rec?.code || '')
  if (msg.includes('cancelled') || code.includes('SIGN_IN_CANCELLED') || code === '12501') {
    return ''
  }
  if (code.includes('PLAY_SERVICES') || msg.includes('play services')) {
    return 'Update Google Play services, then try again.'
  }
  if (code === '10' || msg.includes('developer_error') || msg.includes('developer error')) {
    return 'Google Sign-In is not set up for this app build. Add the Android SHA-1 in Firebase / Google Cloud and rebuild.'
  }
  return rec?.message || fallback
}
