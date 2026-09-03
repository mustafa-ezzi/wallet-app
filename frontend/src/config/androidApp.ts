/**
 * Expo / EAS Android APK distribution (no Play Store yet).
 * Update VITE_ANDROID_APK_URL when you ship a new preview build.
 */
export const ANDROID_APK_URL =
  (import.meta.env.VITE_ANDROID_APK_URL as string | undefined)?.trim()
  || 'https://expo.dev/accounts/mustafaezzi/projects/WalletTrails/builds/c21671a8-d1cb-48c6-b161-a59f9af5892b'

export const ANDROID_APP_LABEL =
  (import.meta.env.VITE_ANDROID_APP_LABEL as string | undefined)?.trim()
  || 'WalletTrails Android (Expo preview)'

export const hasAndroidApkLink = Boolean(ANDROID_APK_URL)
