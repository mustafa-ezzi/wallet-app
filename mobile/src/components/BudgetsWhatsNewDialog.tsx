import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { router } from 'expo-router'
import { AppSheet } from '@/src/components/AppSheet'
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

  return (
    <AppSheet
      visible={visible}
      onClose={() => void dismiss(false)}
      title="Budgets"
      subtitle="New feature"
      placement="center"
    >
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft + '33' }]}>
          <FontAwesome name="pie-chart" size={28} color={colors.primary} />
        </View>
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
    </AppSheet>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    body: { alignItems: 'stretch' },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    sub: {
      fontSize: typography.body,
      fontWeight: '600',
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    whereBox: {
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    whereTitle: { fontWeight: '800', fontSize: typography.caption, marginBottom: 4 },
    whereBody: { fontSize: typography.caption, lineHeight: 18, fontWeight: '600' },
    laterBtn: { alignItems: 'center', paddingVertical: spacing.md },
    laterText: { fontWeight: '700', fontSize: typography.caption },
  })
}
