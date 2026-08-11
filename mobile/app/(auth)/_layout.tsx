import { Redirect, Stack } from 'expo-router'
import { useAuth } from '@/src/context/AuthContext'
import { colors } from '@/src/theme/colors'

export default function AuthLayout() {
  const { user, loading } = useAuth()

  // While boot finishes, still show auth stack so login is never blocked by a blank spinner gate
  if (!loading && user) {
    if (user.onboarding_complete === false) {
      return <Redirect href="/(onboarding)/about-you" />
    }
    return <Redirect href="/(tabs)" />
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  )
}
