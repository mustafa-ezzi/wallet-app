import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radii, spacing, typography } from '@/src/theme/colors'

export function GoogleSignInButton({
  onPress,
  loading,
  disabled,
  label = 'Continue with Google',
}: {
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  label?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        pressed ? styles.pressed : null,
        (disabled || loading) ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.inner}>
          <View style={styles.gMark}>
            <Text style={styles.gLetter}>G</Text>
          </View>
          <Text style={styles.label}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: { color: '#4285F4', fontWeight: '800', fontSize: 14 },
  label: { fontSize: typography.body, fontWeight: '700', color: colors.text },
})
