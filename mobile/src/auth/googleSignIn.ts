import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'

type GoogleModule = {
  GoogleSignin: {
    configure: (opts: { webClientId: string; offlineAccess?: boolean }) => void
    hasPlayServices: (opts?: { showPlayServicesUpdateDialog?: boolean }) => Promise<boolean>
    signIn: () => Promise<{ type?: string; data?: { idToken?: string | null } } | { idToken?: string | null }>
    signOut: () => Promise<void>
  }
  isSuccessResponse?: (response: unknown) => boolean
}

type GsiPromptNotification = {
  isNotDisplayed: () => boolean
  isSkippedMoment: () => boolean
  isDismissedMoment: () => boolean
  getNotDisplayedReason?: () => string
}

type GsiApi = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string
        callback: (res: { credential?: string }) => void
        auto_select?: boolean
        cancel_on_tap_outside?: boolean
        ux_mode?: 'popup' | 'redirect'
        use_fedcm_for_prompt?: boolean
      }) => void
      prompt: (cb?: (notification: GsiPromptNotification) => void) => void
    }
  }
}

const DEFAULT_WEB_CLIENT_ID =
  '85845263961-bqvqpr0jeo5id40v17aj3dm5u5bt4a1c.apps.googleusercontent.com'
const DEFAULT_ANDROID_CLIENT_ID =
  '85845263961-ehanc5qjtka9sc0ec3i7h5uiemup6mpe.apps.googleusercontent.com'
const ANDROID_PACKAGE = 'com.wallettrails.app'

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
}

WebBrowser.maybeCompleteAuthSession()

function extra(): { googleWebClientId?: string; googleAndroidClientId?: string } {
  return (Constants.expoConfig?.extra || Constants.manifest?.extra || {}) as {
    googleWebClientId?: string
    googleAndroidClientId?: string
  }
}

function extraWebClientId(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim()
    || extra().googleWebClientId?.trim()
    || DEFAULT_WEB_CLIENT_ID
  )
}

function extraAndroidClientId(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim()
    || extra().googleAndroidClientId?.trim()
    || DEFAULT_ANDROID_CLIENT_ID
  )
}

function webOrigin(): string {
  if (typeof window === 'undefined' || !window.location?.origin) return 'http://localhost:8081'
  return window.location.origin.replace(/\/$/, '')
}

function originSetupMessage(origin = webOrigin()): string {
  return (
    `Add ${origin} to the Web OAuth client in Google Cloud Console `
    + '(APIs & Services → Credentials → Authorized JavaScript origins). '
    + 'If you still use browser redirect, add the same URL under Authorized redirect URIs.'
  )
}

function loadModule(): GoogleModule | null {
  // The published web build of this package is a stub that throws PLAY_SERVICES_NOT_AVAILABLE.
  if (Platform.OS !== 'android') return null
  try {
    return require('@react-native-google-signin/google-signin') as GoogleModule
  } catch {
    return null
  }
}

let configured = false

function ensureConfigured(mod: GoogleModule): void {
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
}

function extractIdToken(response: unknown): string {
  const rec = response as {
    type?: string
    data?: { idToken?: string | null }
    idToken?: string | null
    params?: { id_token?: string }
  }
  const token = rec?.data?.idToken || rec?.idToken || rec?.params?.id_token || ''
  return String(token).trim()
}

function isCancelled(err: unknown): boolean {
  const rec = err as { code?: string; message?: string }
  const msg = (rec?.message || '').toLowerCase()
  const code = String(rec?.code || '')
  return msg.includes('cancelled') || msg.includes('cancel') || code.includes('SIGN_IN_CANCELLED') || code === '12501'
}

function isPlayServicesError(err: unknown): boolean {
  const rec = err as { code?: string; message?: string }
  const msg = (rec?.message || '').toLowerCase()
  const code = String(rec?.code || '')
  return code.includes('PLAY_SERVICES') || msg.includes('play services') || msg.includes('play store')
}

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo'
}

async function nativeGoogleIdToken(mod: GoogleModule): Promise<string> {
  ensureConfigured(mod)
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

function gsi(): GsiApi | undefined {
  return (typeof window !== 'undefined' ? (window as Window & { google?: GsiApi }).google : undefined)
}

function loadGsiScript(): Promise<GsiApi> {
  const existing = gsi()
  if (existing?.accounts?.id) return Promise.resolve(existing)
  if (typeof document === 'undefined') {
    throw new Error('Google Sign-In is not available in this environment.')
  }
  return new Promise((resolve, reject) => {
    const done = () => {
      const api = gsi()
      if (api?.accounts?.id) resolve(api)
      else reject(new Error('Google Sign-In failed to load.'))
    }
    const found = document.querySelector('script[data-wallettrails-gsi="1"]') as HTMLScriptElement | null
    if (found) {
      found.addEventListener('load', done)
      found.addEventListener('error', () => reject(new Error('Could not load Google Sign-In.')))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.wallettrailsGsi = '1'
    script.onload = done
    script.onerror = () => reject(new Error('Could not load Google Sign-In.'))
    document.head.appendChild(script)
  })
}

/** Popup / One Tap — no redirect_uri. Needs Authorized JavaScript origins only. */
async function webGoogleIdTokenGis(): Promise<string> {
  const api = await loadGsiScript()
  const clientId = extraWebClientId()
  return new Promise((resolve, reject) => {
    let settled = false
    let timer = 0
    const finish = (err?: Error, token?: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      if (token) resolve(token)
      else reject(err || new Error('one-tap-unavailable'))
    }
    timer = window.setTimeout(() => finish(new Error('one-tap-timeout')), 8000)
    api.accounts.id.initialize({
      client_id: clientId,
      callback: (res) => {
        const token = String(res.credential || '').trim()
        if (token) finish(undefined, token)
        else finish(new Error('Google did not return a sign-in token.'))
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true,
    })
    api.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment()) {
        finish(new Error('one-tap-unavailable'))
      }
    })
  })
}

async function browserGoogleIdToken(): Promise<string> {
  const isWeb = Platform.OS === 'web'
  const clientId = isWeb ? extraWebClientId() : extraAndroidClientId()
  const androidPackage = Application.applicationId || ANDROID_PACKAGE
  const redirectUri = isWeb
    ? webOrigin()
    : `${androidPackage}:/oauthredirect`

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    responseType: isWeb ? AuthSession.ResponseType.IdToken : AuthSession.ResponseType.Code,
    usePKCE: !isWeb,
    extraParams: isWeb ? { nonce: `${Date.now()}${Math.random().toString(36).slice(2)}` } : {},
  })

  const result = await request.promptAsync(GOOGLE_DISCOVERY)
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('cancelled')
  }
  if (result.type !== 'success') {
    throw new Error(isWeb ? originSetupMessage() : 'Google sign-in failed.')
  }

  const implicitToken = String(result.params?.id_token || '').trim()
  if (implicitToken) return implicitToken

  const code = String(result.params?.code || '').trim()
  if (!code) {
    throw new Error(isWeb ? originSetupMessage() : 'Google did not return a sign-in token.')
  }

  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier || '' },
    },
    { tokenEndpoint: GOOGLE_DISCOVERY.tokenEndpoint },
  )
  const idToken = String(tokens.idToken || '').trim()
  if (!idToken) {
    throw new Error('Google did not return a sign-in token.')
  }
  return idToken
}

export async function getGoogleIdToken(): Promise<string> {
  if (Platform.OS === 'web') {
    try {
      return await webGoogleIdTokenGis()
    } catch (err) {
      if (isCancelled(err)) throw err
    }
    return browserGoogleIdToken()
  }

  if (Platform.OS !== 'android') {
    throw new Error('Google Sign-In is only available on the Android app.')
  }

  if (isExpoGo()) {
    throw new Error(
      'Google sign-in needs the WalletTrails Android app, not Expo Go. Install the APK and try again.',
    )
  }

  const mod = loadModule()
  if (mod) {
    try {
      const hasPlay = await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false })
      if (hasPlay) return await nativeGoogleIdToken(mod)
    } catch (err) {
      if (isCancelled(err)) throw err
      if (!isPlayServicesError(err)) {
        try {
          return await browserGoogleIdToken()
        } catch (browserErr) {
          if (isCancelled(browserErr)) throw browserErr
          throw err
        }
      }
    }
  }

  return browserGoogleIdToken()
}

export function googleSignInErrorMessage(err: unknown, fallback = 'Google sign-in failed.'): string {
  const rec = err as { code?: string; message?: string }
  const msg = (rec?.message || '').toLowerCase()
  const code = String(rec?.code || '')
  if (isCancelled(err)) return ''
  if (msg.includes('oauth 2.0 policy') || msg.includes('redirect_uri') || msg.includes('redirect uri')) {
    return originSetupMessage()
  }
  if (msg.includes('authorized javascript') || msg.includes('javascript origins')) {
    return rec.message || originSetupMessage()
  }
  if (msg.includes('expo go')) {
    return rec.message || 'Google sign-in needs the WalletTrails Android app, not Expo Go.'
  }
  if (code.includes('PLAY_SERVICES') || msg.includes('play services')) {
    return 'Google Play is not available on this device. Try again, or create an account with email.'
  }
  if (code === '10' || msg.includes('developer_error') || msg.includes('developer error')) {
    return 'Google Sign-In is not set up for this app build. Add the Android SHA-1 in Firebase / Google Cloud and rebuild.'
  }
  return rec?.message || fallback
}
