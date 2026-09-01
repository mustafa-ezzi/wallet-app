import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useColors } from '@/src/theme/ThemeContext'
import { iosShadow, radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { toMoney } from '@/src/utils/format'

export type SettlementCredit = {
  user_id: number
  name: string
  expenses_paid: number
  contributions: number
  credit: number
  fair_share: number
  net: number
  meaning: string
}

export type SettlementTransfer = {
  from_user_id: number
  from_name: string
  to_user_id: number
  to_name: string
  amount: number
  settled: boolean
  mark_note?: string
}

export type SettlementData = {
  member_count: number
  total_expenses: number
  total_contributions: number
  fair_share: number
  external_paid?: number
  is_even?: boolean
  credits: SettlementCredit[]
  transfers: SettlementTransfer[]
  disclaimer: string
}

type Props = {
  data: SettlementData | null
  loading: boolean
  error: string
  fmt: (n: number | string) => string
  onRefresh: () => void
  onMarkPaid?: (t: SettlementTransfer) => void
}

function balanceLabel(net: number, fmt: (n: number | string) => string): string {
  if (Math.abs(net) < 0.01) return 'All square'
  if (net > 0) return `Gets back ${fmt(net)}`
  return `Owes ${fmt(Math.abs(net))}`
}

function putInDetail(c: SettlementCredit, fmt: (n: number | string) => string): string {
  const parts: string[] = []
  if (c.expenses_paid > 0) parts.push(`${fmt(c.expenses_paid)} wallet`)
  if (c.contributions > 0) parts.push(`${fmt(c.contributions)} pot`)
  const putIn = parts.length ? parts.join(' + ') : fmt(0)
  return `Put in ${putIn} · share ${fmt(c.fair_share)}`
}

export function HouseholdSettleUp({ data, loading, error, fmt, onRefresh, onMarkPaid }: Props) {
  const colors = useColors()
  const styles = makeStyles(colors)

  if (loading && !data) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Calculating equal split…</Text>
      </View>
    )
  }

  if (error && !data) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Could not load settle-up</Text>
        <Text style={styles.emptyBody}>{error}</Text>
        <Pressable style={styles.refreshBtn} onPress={onRefresh}>
          <Text style={styles.refreshBtnText}>Try again</Text>
        </Pressable>
      </View>
    )
  }

  if (!data) return null

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Settle up</Text>
          <Text style={styles.subtitle}>Split everything equally — who paid more gets paid back.</Text>
        </View>
        <Pressable style={styles.refreshChip} onPress={onRefresh} disabled={loading}>
          <FontAwesome name="refresh" size={12} color={colors.primary} />
          <Text style={styles.refreshChipText}>{loading ? '…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.inlineError}>{error}</Text> : null}

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTotal}>{fmt(data.total_expenses)} total</Text>
        <Text style={styles.summaryMeta}>
          {data.member_count} {data.member_count === 1 ? 'person' : 'people'} · everyone pays {fmt(data.fair_share)}
          {data.total_contributions > 0 ? ` · pot ${fmt(data.total_contributions)}` : ''}
        </Text>
        {(data.external_paid ?? 0) > 0 ? (
          <Text style={styles.summaryNote}>
            {fmt(data.external_paid!)} paid by someone outside this household (still in the total).
          </Text>
        ) : null}
      </View>

      {data.credits.map((c) => {
        const net = toMoney(c.net)
        const tone = net > 0.01 ? colors.success : net < -0.01 ? colors.danger : colors.textMuted
        return (
          <View key={c.user_id} style={styles.memberCard}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.memberName}>{c.name}</Text>
              <Text style={styles.memberDetail}>{putInDetail(c, fmt)}</Text>
            </View>
            <Text style={[styles.memberBalance, { color: tone }]}>{balanceLabel(net, fmt)}</Text>
          </View>
        )
      })}

      {data.transfers.length === 0 ? (
        <View style={styles.evenRow}>
          <FontAwesome name="check-circle" size={18} color={colors.success} />
          <Text style={styles.evenText}>Everyone is even — no payments needed.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>Pay these people</Text>
          {data.transfers.map((t, i) => (
            <View key={`${t.from_user_id}-${t.to_user_id}-${i}`} style={styles.transferCard}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.transferTitle}>
                  {t.from_name} pays {t.to_name}
                </Text>
                {t.settled ? (
                  <Text style={styles.transferPaid}>Marked paid{t.mark_note ? ` · ${t.mark_note}` : ''}</Text>
                ) : (
                  <Text style={styles.transferHint}>Settle in cash or bank transfer</Text>
                )}
              </View>
              <Text style={styles.transferAmt}>{fmt(t.amount)}</Text>
              {!t.settled && onMarkPaid ? (
                <Pressable style={styles.markBtn} onPress={() => onMarkPaid(t)}>
                  <Text style={styles.markBtnText}>Mark paid</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </>
      )}

      <Text style={styles.disclaimer}>{data.disclaimer}</Text>
    </View>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    root: { gap: spacing.sm },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    title: { ...typography.sectionTitle, color: colors.text },
    subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
    refreshChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.primarySoft + '33',
    },
    refreshChipText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
    inlineError: { color: colors.danger, fontSize: 13, fontWeight: '600' },
    loadingBox: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
    loadingText: { color: colors.textMuted, fontSize: 13 },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...iosShadow,
    },
    summaryTotal: { fontSize: 20, fontWeight: '800', color: colors.text },
    summaryMeta: { color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
    summaryNote: { color: colors.textMuted, fontSize: 11, marginTop: 6, lineHeight: 16 },
    memberCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    memberName: { fontWeight: '700', fontSize: 15, color: colors.text },
    memberDetail: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
    memberBalance: { fontWeight: '800', fontSize: 13, textAlign: 'right', flexShrink: 0, maxWidth: '42%' },
    evenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm },
    evenText: { fontWeight: '700', fontSize: 14, color: colors.text, flex: 1 },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: spacing.xs,
    },
    transferCard: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...iosShadow,
    },
    transferTitle: { fontWeight: '700', fontSize: 14, color: colors.text },
    transferHint: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    transferPaid: { color: colors.success, fontSize: 11, marginTop: 2, fontWeight: '600' },
    transferAmt: { fontWeight: '800', fontSize: 16, color: colors.text },
    markBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
    },
    markBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    disclaimer: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.xs },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    emptyTitle: { fontWeight: '800', fontSize: 16, color: colors.text },
    emptyBody: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
    refreshBtn: { marginTop: spacing.md, paddingVertical: 8, paddingHorizontal: 16 },
    refreshBtnText: { color: colors.primary, fontWeight: '700' },
  })
}
