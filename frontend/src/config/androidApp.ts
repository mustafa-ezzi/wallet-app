/**
 * Expo / EAS Android APK distribution (no Play Store yet).
 * Update VITE_ANDROID_APK_URL when you ship a new preview build.
 */
export const ANDROID_APK_URL =
  (import.meta.env.VITE_ANDROID_APK_URL as string | undefined)?.trim()
  || 'https://expo.dev/accounts/mustafaezzi/projects/cashtrail/builds/0cb63ef5-e9d0-4a35-8a69-178f02225a6a'

export const ANDROID_APP_LABEL =
  (import.meta.env.VITE_ANDROID_APP_LABEL as string | undefined)?.trim()
  || 'CashTrail Android (Expo preview)'

export const hasAndroidApkLink = Boolean(ANDROID_APK_URL)
