import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiErrorMessage, asList, dashboardApi } from '@/src/api/client'
import type { Dashboard, Transaction } from '@/src/api/types'
import { Screen } from '@/src/components/ui'
import { useAuth } from '@/src/context/AuthContext'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { colors, radii, spacing, typography } from '@/src/theme/colors'
import { fmt, fmtBalance, toMoney } from '@/src/utils/format'

export default function HomeScreen() {
  const { user } = useAuth()
  const { openAdd, refreshKey } = useMoneyUi()
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'there'

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      const { data: dash } = await dashboardApi.get()
      setData(dash)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load dashboard.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const txs: Transaction[] = data?.recent_transactions ?? asList(data?.recent_transactions)

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 88, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void load(true)
            }}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.hi}>Welcome back,</Text>
        <Text style={styles.name}>{name}</Text>

        {loading && !data ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Total balance</Text>
              <Text style={styles.heroAmount}>{fmtBalance(data?.total_balance ?? 0)}</Text>
              <Text style={styles.heroHint}>Across all wallets</Text>
            </View>

            <View style={styles.chipsRow}>
              <View style={[styles.statChip, styles.statIn]}>
                <Text style={styles.statLabel}>This month in</Text>
                <Text style={[styles.statValue, { color: colors.success }]}>+{fmt(data?.month_income ?? 0)}</Text>
              </View>
              <View style={[styles.statChip, styles.statOut]}>
                <Text style={styles.statLabel}>This month out</Text>
                <Text style={[styles.statValue, { color: colors.danger }]}>−{fmt(data?.month_expense ?? 0)}</Text>
              </View>
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Recent</Text>
              <Pressable onPress={openAdd} hitSlop={8}>
                <Text style={styles.link}>Add</Text>
              </Pressable>
            </View>

            {txs.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No transactions yet</Text>
                <Text style={styles.emptyBody}>Tap + to record income, expense, or a transfer.</Text>
              </View>
            ) : (
              txs.map((tx) => {
                const income = tx.type === 'income'
                return (
                  <View key={tx.id} style={styles.txRow}>
                    <View style={[styles.txDot, { backgroundColor: income ? colors.success : colors.danger }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txCat}>{tx.category || (income ? 'Income' : 'Expense')}</Text>
                      {tx.notes ? <Text style={styles.txNotes} numberOfLines={2}>{tx.notes}</Text> : null}
                      <Text style={styles.txMeta}>
                        {tx.account_name || 'Wallet'} · {tx.date}
                      </Text>
                    </View>
                    <Text style={[styles.txAmt, { color: income ? colors.success : colors.danger }]}>
                      {income ? '+' : '−'}{fmt(Math.abs(toMoney(tx.amount)))}
                    </Text>
                  </View>
                )
              })
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hi: { fontSize: typography.caption, color: colors.textMuted, fontWeight: '600' },
  name: { fontSize: typography.title, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  error: { color: colors.danger, marginBottom: spacing.md, fontWeight: '600' },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  heroAmount: { color: colors.white, fontSize: typography.hero, fontWeight: '800', marginVertical: spacing.sm },
  heroHint: { color: 'rgba(255,255,255,0.55)', fontSize: typography.caption },
  chipsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  statChip: {
    flex: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  statIn: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  statOut: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  statValue: { marginTop: 4, fontWeight: '800', fontSize: typography.caption },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: typography.subtitle, fontWeight: '800', color: colors.primaryDark },
  link: { color: colors.primary, fontWeight: '800' },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyTitle: { fontWeight: '800', color: colors.text, marginBottom: 4 },
  emptyBody: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  txDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  txCat: { fontWeight: '800', color: colors.text, fontSize: typography.body },
  txNotes: { color: colors.textSecondary, fontSize: typography.caption, marginTop: 2 },
  txMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  txAmt: { fontWeight: '800', fontSize: typography.caption },
})
