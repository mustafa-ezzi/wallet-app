import { Redirect } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { useAuth } from '@/src/context/AuthContext'
import { colors, spacing } from '@/src/theme/colors'

/** Gate: login vs onboarding vs tabs. */
export default function Index() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ marginTop: spacing.md, color: colors.textMuted, fontWeight: '600' }}>Starting WalletTrails…</Text>
      </View>
    )
  }

  if (!user) return <Redirect href="/(auth)/login" />
  if (user.onboarding_complete === false) return <Redirect href="/(onboarding)/about-you" />
  return <Redirect href="/(tabs)" />
}
