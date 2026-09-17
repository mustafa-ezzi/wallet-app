/**
 * Expo / EAS Android APK distribution (no Play Store yet).
 * Update VITE_ANDROID_APK_URL when you ship a new preview build.
 * Expo project slug stays `cashtrail` (locked to EAS projectId).
 */
export const ANDROID_APK_URL =
  (import.meta.env.VITE_ANDROID_APK_URL as string | undefined)?.trim()
  || 'https://expo.dev/accounts/mustafaezzi/projects/cashtrail/builds/0e04d2e8-dd6a-4d9e-b7f9-e7ed8bc8e830'

export const ANDROID_APP_LABEL =
  (import.meta.env.VITE_ANDROID_APP_LABEL as string | undefined)?.trim()
  || 'WalletTrails Android (Expo preview)'

export const hasAndroidApkLink = Boolean(ANDROID_APK_URL)
