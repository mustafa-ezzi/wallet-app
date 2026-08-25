import { Stack } from 'expo-router'
import { useColors } from '@/src/theme/ThemeContext'

export default function OnboardingLayout() {
  const colors = useColors()
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="about-you" />
      <Stack.Screen name="user-type" />
      <Stack.Screen name="bank-sms-permission" />
    </Stack>
  )
}
