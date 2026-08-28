/**
 * Expo / EAS Android APK distribution (no Play Store yet).
 * Update VITE_ANDROID_APK_URL when you ship a new preview build.
 */
export const ANDROID_APK_URL =
  (import.meta.env.VITE_ANDROID_APK_URL as string | undefined)?.trim()
  || 'https://expo.dev/accounts/mustafaezzi/projects/cashtrail/builds/83db3a4a-3143-4a61-92a7-d6ec82ca8e09'

export const ANDROID_APP_LABEL =
  (import.meta.env.VITE_ANDROID_APP_LABEL as string | undefined)?.trim()
  || 'CashTrail Android (Expo preview)'

export const hasAndroidApkLink = Boolean(ANDROID_APK_URL)
