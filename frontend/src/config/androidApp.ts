/**
 * Expo / EAS Android APK distribution (no Play Store yet).
 * Update VITE_ANDROID_APK_URL when you ship a new preview build.
 */
export const ANDROID_APK_URL =
  (import.meta.env.VITE_ANDROID_APK_URL as string | undefined)?.trim()
  || 'https://expo.dev/accounts/mustafaezzi/projects/cashtrail/builds/55334711-a8fe-4b37-b0f3-58c47b853460'

export const ANDROID_APP_LABEL =
  (import.meta.env.VITE_ANDROID_APP_LABEL as string | undefined)?.trim()
  || 'CashTrail Android (Expo preview)'

export const hasAndroidApkLink = Boolean(ANDROID_APK_URL)
