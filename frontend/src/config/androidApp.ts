/**
 * Expo / EAS Android APK distribution (no Play Store yet).
 * Update VITE_ANDROID_APK_URL when you ship a new preview build.
 * Expo project slug stays `cashtrail` (locked to EAS projectId).
 */
export const ANDROID_APK_URL =
  (import.meta.env.VITE_ANDROID_APK_URL as string | undefined)?.trim()
  || 'https://expo.dev/accounts/mustafaezzi/projects/cashtrail/builds/5dd4a503-1b6e-4659-afee-ccf32cd5c7dc'

export const ANDROID_APP_LABEL =
  (import.meta.env.VITE_ANDROID_APP_LABEL as string | undefined)?.trim()
  || 'WalletTrails Android (Expo preview)'

export const hasAndroidApkLink = Boolean(ANDROID_APK_URL)
