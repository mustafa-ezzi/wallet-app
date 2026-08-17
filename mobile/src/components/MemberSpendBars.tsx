import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography } from '@/src/theme/colors'
import { toMoney } from '@/src/utils/format'

const BAR_PALETTE = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444']

export type MemberBarDatum = { name: string; amount: number | string }

export function MemberSpendBars({
  data,
  title = 'By member',
}: {
  data: MemberBarDatum[]
  title?: string
}) {
  const colors = useColors()
  const money = useMaskedMoney()

  const rows = useMemo(() => {
    const mapped = data
      .map((d) => ({ name: d.name || 'Member', amount: toMoney(d.amount) }))
      .filter((d) => d.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    const max = mapped.reduce((m, r) => Math.max(m, r.amount), 0) || 1
    return mapped.map((r, i) => ({
      ...r,
      pct: Math.max(6, Math.round((r.amount / max) * 100)),
      color: BAR_PALETTE[i % BAR_PALETTE.length],
    }))
  }, [data])

  if (rows.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No member spending yet.</Text>
      </View>
    )
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.primaryDark }]}>{title}</Text>
      {rows.map((r) => (
        <View key={r.name} style={styles.row}>
          <View style={styles.rowTop}>
            <View style={[styles.avatar, { backgroundColor: `${r.color}22` }]}>
              <Text style={[styles.avatarText, { color: r.color }]}>
                {(r.name.trim()[0] || '?').toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {r.name}
            </Text>
            <Text style={[styles.amt, money.amountStyle, { color: colors.textSecondary }]}>
              {money.fmt(r.amount)}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
            <View style={[styles.fill, { width: `${r.pct}%`, backgroundColor: r.color }]} />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  title: {
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  row: { gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '800', fontSize: 12 },
  name: { flex: 1, fontWeight: '700', fontSize: 14 },
  amt: { fontWeight: '800', fontSize: 13 },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  empty: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  emptyText: { fontSize: typography.caption, fontWeight: '600', textAlign: 'center' },
})
