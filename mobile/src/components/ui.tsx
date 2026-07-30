import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { colors, radii, spacing, typography } from '../theme/colors'

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>
}

export function BrandMark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const big = size === 'lg'
  return (
    <View style={styles.brandWrap}>
      <View style={[styles.logoBadge, big && styles.logoBadgeLg]}>
        <Text style={[styles.logoLetter, big && styles.logoLetterLg]}>C</Text>
      </View>
      <Text style={[styles.brandName, big && styles.brandNameLg]}>CashTrail</Text>
      {big ? <Text style={styles.brandTag}>Follow every rupee</Text> : null}
    </View>
  )
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
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
}: {
  title: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryBtn,
        (disabled || loading) && styles.btnDisabled,
        pressed && !disabled && !loading && styles.btnPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.primaryBtnText}>{title}</Text>
      )}
    </Pressable>
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
  return <View style={styles.card}>{children}</View>
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoBadgeLg: {
    width: 64,
    height: 64,
    borderRadius: 18,
  },
  logoLetter: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
  },
  logoLetterLg: {
    fontSize: 28,
  },
  brandName: {
    fontSize: typography.subtitle,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  brandNameLg: {
    fontSize: typography.title,
  },
  brandTag: {
    marginTop: 4,
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.label,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: typography.body,
    color: colors.text,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: typography.body,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.caption,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
})
