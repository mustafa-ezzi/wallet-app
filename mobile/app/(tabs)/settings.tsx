import { StyleSheet, Text, View } from 'react-native'
import { Screen, PrimaryButton } from '@/src/components/ui'
import { useAuth } from '@/src/context/AuthContext'
import { API_ROOT } from '@/src/api/client'
import { colors, spacing, typography } from '@/src/theme/colors'

export default function SettingsScreen() {
  const { user, logout } = useAuth()
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email

  return (
    <Screen>
      <View style={styles.pad}>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>{name}</Text>
          <Text style={styles.meta}>{user?.email}</Text>
          <Text style={styles.meta}>Currency: {user?.currency || 'PKR'}</Text>
          <Text style={styles.meta}>API: {API_ROOT || '(not set)'}</Text>
        </View>
        <PrimaryButton title="Log out" onPress={() => void logout()} />
        <Text style={styles.hint}>
          Biometrics and offline sync land in later phases.
        </Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg },
  title: { fontSize: typography.title, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  value: { fontSize: typography.subtitle, fontWeight: '800', color: colors.text, marginTop: 4 },
  meta: { color: colors.textSecondary, marginTop: 4, fontSize: typography.caption },
  hint: { marginTop: spacing.lg, color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 },
})
