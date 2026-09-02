import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PrimaryButton } from '@/src/components/ui'
import { markBudgetsFeatureSeen, shouldShowBudgetsWhatsNew } from '@/src/features/budgetsAnnounce'
import { track } from '@/src/lib/analytics'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'

/**
 * One-time What’s New after the Budgets build is installed.
 * (Native has no PWA refresh dialog — this is the discovery path.)
 */
export function BudgetsWhatsNewDialog() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        if (!(await shouldShowBudgetsWhatsNew()) || cancelled) return
        track('feature_whats_new_shown', { feature: 'budgets_v1' })
        setVisible(true)
      })()
    }, 1100)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

  const dismiss = useCallback(async (goToBudgets: boolean) => {
    await markBudgetsFeatureSeen()
    track('feature_whats_new_dismissed', { feature: 'budgets_v1', go_to: goToBudgets })
    setVisible(false)
    if (goToBudgets) {
      router.push('/(tabs)/budgets' as '/(tabs)/reports')
    }
  }, [])

  if (!visible) return null

  const bottomPad = Math.max(insets.bottom, 16)

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void dismiss(false)}>
      <View style={[styles.backdrop, { paddingBottom: bottomPad }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => void dismiss(false)} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.kicker, { color: colors.primary }]}>New feature</Text>
          <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft + '33' }]}>
            <FontAwesome name="pie-chart" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Budgets</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Set monthly spending limits by category and see how much you’ve used.
          </Text>
          <View style={[styles.whereBox, { backgroundColor: colors.surfaceMuted }]}>
            <Text style={[styles.whereTitle, { color: colors.text }]}>Where to find it</Text>
            <Text style={[styles.whereBody, { color: colors.textSecondary }]}>
              Open the <Text style={{ fontWeight: '700' }}>Budgets</Text> tab in the bottom bar, or tap{' '}
              <Text style={{ fontWeight: '700' }}>Budgets →</Text> on the Home spending card.
            </Text>
          </View>
          <PrimaryButton title="Open Budgets" onPress={() => void dismiss(true)} />
          <Pressable onPress={() => void dismiss(false)} style={styles.laterBtn} hitSlop={8}>
            <Text style={[styles.laterText, { color: colors.textMuted }]}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      justifyContent: 'flex-end',
      paddingHorizontal: spacing.lg,
    },
    card: {
      borderRadius: radii.xl,
      borderWidth: StyleSheet.hairlineWidth,
      padding: spacing.xl,
      gap: spacing.md,
    },
    kicker: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    iconWrap: {
      alignSelf: 'center',
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: typography.title,
      fontWeight: '800',
      textAlign: 'center',
    },
    sub: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    whereBox: {
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: 4,
    },
    whereTitle: {
      fontSize: 13,
      fontWeight: '700',
    },
    whereBody: {
      fontSize: 13,
      lineHeight: 18,
    },
    laterBtn: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    laterText: {
      fontSize: 14,
      fontWeight: '600',
    },
  })
}
