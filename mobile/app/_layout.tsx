import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '@/src/context/AuthContext'
import { OfflineProvider } from '@/src/offline'
import { RemindersProvider } from '@/src/notifications'
import { PrivacyLockProvider } from '@/src/privacy/PrivacyLockContext'
import { colors } from '@/src/theme/colors'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore if already prevented */
})

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {
      /* ignore */
    })
  }, [])

  return (
    <AuthProvider>
      <OfflineProvider>
        <RemindersProvider>
          <PrivacyLockProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </PrivacyLockProvider>
        </RemindersProvider>
      </OfflineProvider>
    </AuthProvider>
  )
}
