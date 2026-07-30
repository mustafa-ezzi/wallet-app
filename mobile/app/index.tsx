import { Redirect } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { useAuth } from '@/src/context/AuthContext'
import { colors, spacing } from '@/src/theme/colors'

/** Gate: login vs tabs. Never waits on navigation state (that caused infinite spinner). */
export default function Index() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ marginTop: spacing.md, color: colors.textMuted, fontWeight: '600' }}>Starting CashTrail…</Text>
      </View>
    )
  }

  if (user) return <Redirect href="/(tabs)" />
  return <Redirect href="/(auth)/login" />
}
