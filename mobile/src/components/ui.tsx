import React from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { BouncyPressable } from './motion'
import { iosShadow, radii, spacing, typography } from '../theme/colors'
import { useColors } from '../theme/ThemeContext'

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const colors = useColors()
  return <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>{children}</View>
}

export function BrandMark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const colors = useColors()
  const big = size === 'lg'
  return (
    <View style={styles.brandWrap}>
      <View style={[styles.logoBadge, { backgroundColor: colors.primary }, big && styles.logoBadgeLg]}>
        <Text style={[styles.logoLetter, big && styles.logoLetterLg]}>W</Text>
      </View>
      <Text style={[styles.brandName, { color: colors.primaryDark }, big && styles.brandNameLg]}>WalletTrails</Text>
      {big ? <Text style={[styles.brandTag, { color: colors.textMuted }]}>Follow every rupee</Text> : null}
    </View>
  )
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  const colors = useColors()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
        autoCapitalize="none"
        {...props}
      />
    </View>
  )
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  color,
}: {
  title: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  /** Optional background override — defaults to the active theme's primary color. */
  color?: string
}) {
  const colors = useColors()
  return (
    <BouncyPressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.primaryBtn,
        { backgroundColor: color ?? colors.primary },
        (disabled || loading) ? styles.btnDisabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.primaryBtnText}>{title}</Text>
      )}
    </BouncyPressable>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  )
}

export function Card({ children }: { children: React.ReactNode }) {
  const colors = useColors()
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  brandWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoBadgeLg: { width: 56, height: 56, borderRadius: 16 },
  logoLetter: { color: '#fff', fontWeight: '900', fontSize: 20 },
  logoLetterLg: { fontSize: 24 },
  brandName: { fontSize: typography.subtitle, fontWeight: '800' },
  brandNameLg: { fontSize: typography.title },
  brandTag: { fontSize: typography.caption, marginTop: 3 },
  field: { marginBottom: spacing.md },
  label: {
    fontSize: typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: typography.body,
    fontWeight: '600',
  },
  primaryBtn: {
    borderRadius: radii.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.body },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.9 },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { color: '#dc2626', fontWeight: '600', fontSize: typography.caption },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...iosShadow,
  },
})
