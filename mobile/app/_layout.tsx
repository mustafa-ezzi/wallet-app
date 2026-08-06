import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { AnimatedSplashScreen } from '@/src/components/AnimatedSplashScreen'
import { AuthProvider } from '@/src/context/AuthContext'
import { OfflineProvider } from '@/src/offline'
import { RemindersProvider } from '@/src/notifications'
import { PrivacyLockProvider } from '@/src/privacy/PrivacyLockContext'
import { RemoteConfigProvider } from '@/src/config/RemoteConfigContext'
import { ThemeProvider, ThemeRevealOverlay, useColors } from '@/src/theme/ThemeContext'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore if already prevented */
})

function ThemedStack() {
  const colors = useColors()
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="support" options={{ headerShown: false, presentation: 'card' }} />
      </Stack>
      <AnimatedSplashScreen />
    </>
  )
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {
      /* ignore */
    })
  }, [])

  return (
    <ThemeProvider>
      <View style={{ flex: 1 }}>
        <AuthProvider>
          <OfflineProvider>
            <RemindersProvider>
              <PrivacyLockProvider>
                <RemoteConfigProvider>
                  <ThemedStack />
                </RemoteConfigProvider>
              </PrivacyLockProvider>
            </RemindersProvider>
          </OfflineProvider>
        </AuthProvider>
        <ThemeRevealOverlay />
      </View>
    </ThemeProvider>
  )
}
