import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { AnimatedSplashScreen } from '@/src/components/AnimatedSplashScreen'
import { AuthProvider } from '@/src/context/AuthContext'
import { PostHogRoot } from '@/src/lib/PostHogRoot'
import { MoneyUiProvider } from '@/src/context/MoneyUiContext'
import { OfflineProvider } from '@/src/offline'
import { RemindersProvider } from '@/src/notifications'
import { BankSmsProvider } from '@/src/bankSms'
import { PrivacyLockProvider } from '@/src/privacy/PrivacyLockContext'
import { RemoteConfigProvider } from '@/src/config/RemoteConfigContext'
import { ForceUpdateGate, MaintenanceBanner } from '@/src/config/ForceUpdateGate'
import { ThemeProvider, ThemeRevealOverlay, useColors } from '@/src/theme/ThemeContext'
import { TravelModeProvider } from '@/src/travel/TravelModeContext'

export { ErrorBoundary } from 'expo-router'

SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore if already prevented */
})

function ThemedStack() {
  const colors = useColors()
  return (
    <>
      <StatusBar style="dark" />
      <MaintenanceBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-transaction" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="travel-mode" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="bank-sms" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="people/[id]" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="support" options={{ headerShown: false, presentation: 'card' }} />
      </Stack>
      <ForceUpdateGate />
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
          <PostHogRoot>
          <OfflineProvider>
            <RemindersProvider>
              <BankSmsProvider>
              <PrivacyLockProvider>
                <RemoteConfigProvider>
                  <MoneyUiProvider>
                    <TravelModeProvider>
                      <ThemedStack />
                    </TravelModeProvider>
                  </MoneyUiProvider>
                </RemoteConfigProvider>
              </PrivacyLockProvider>
              </BankSmsProvider>
            </RemindersProvider>
          </OfflineProvider>
          </PostHogRoot>
        </AuthProvider>
        <ThemeRevealOverlay />
      </View>
    </ThemeProvider>
  )
}
