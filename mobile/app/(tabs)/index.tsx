import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiErrorMessage, asList, dashboardApi, transactionsApi } from '@/src/api/client'
import type { Dashboard, Transaction } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { CategoryDonut, type DonutDatum } from '@/src/components/CategoryDonut'
import { Reveal } from '@/src/components/motion'
import { Screen } from '@/src/components/ui'
import { getCategoryMeta } from '@/src/constants/categories'
import { useAuth } from '@/src/context/AuthContext'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useOffline } from '@/src/offline'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useRemoteConfig } from '@/src/config/RemoteConfigContext'
import { useColors } from '@/src/theme/ThemeContext'
import { iosShadow, radii, spacing, typography } from '@/src/theme/colors'
import { toMoney } from '@/src/utils/format'
import { AdBanner } from '@/src/ads/AdBanner'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function todayMonthPrefix(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function breakdownFromTxs(
  txs: { type: string; category: string; amount: number | string; date: string }[],
): DonutDatum[] {
  const prefix = todayMonthPrefix()
  const map = new Map<string, number>()
  for (const t of txs) {
    if (!t.date.startsWith(prefix)) continue
    if (t.type !== 'expense') continue
    if (t.category === 'Bank Transfer') continue
    const key = t.category || 'Uncategorized'
    map.set(key, (map.get(key) ?? 0) + toMoney(t.amount))
  }
  return Array.from(map.entries()).map(([category, amount]) => ({ category, amount }))
}

export default function HomeScreen() {
  const { user } = useAuth()
  const { premium } = useRemoteConfig()
  const router = useRouter()
  const { refreshKey, bumpRefresh } = useMoneyUi()
  const { online, syncNow, hydrateNow, getCachedAccounts, getCachedTransactions } = useOffline()
  const money = useMaskedMoney()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<Dashboard | null>(null)
  const [breakdown, setBreakdown] = useState<DonutDatum[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'there'
  const monthName = MONTH_NAMES[new Date().getMonth()]
  const walletCount = data?.accounts?.length ?? 0

  const loadFromCache = useCallback(async () => {
    const [accounts, txs] = await Promise.all([getCachedAccounts(), getCachedTransactions()])
    const total = accounts.reduce((s, a) => s + a.currentBalance, 0)
    const monthPrefix = todayMonthPrefix()
    let monthIncome = 0
    let monthExpense = 0
    for (const t of txs) {
      if (!t.date.startsWith(monthPrefix)) continue
      if (t.category === 'Bank Transfer') continue
      if (t.type === 'income') monthIncome += t.amount
      else monthExpense += t.amount
    }
    const recent = txs.slice(0, 8).map((t) => ({
      id: t.serverId ?? (Number.parseInt(t.localId.replace(/\D/g, ''), 10) || Math.floor(Math.random() * 1e9)),
      type: t.type,
      amount: t.amount,
      date: t.date,
      account: t.accountServerId,
      account_name: accounts.find((a) => a.serverId === t.accountServerId)?.name ?? null,
      category: t.category,
      notes: t.notes,
    }))
    setBreakdown(breakdownFromTxs(txs))
    setData({
      total_balance: total,
      accounts: accounts.map((a) => ({
        id: a.serverId,
        name: a.name,
        type: a.type,
        balance: a.currentBalance,
      })),
      month_income: monthIncome,
      month_expense: monthExpense,
      month_net: monthIncome - monthExpense,
      recent_transactions: recent as Transaction[],
    })
  }, [getCachedAccounts, getCachedTransactions])

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      if (online) {
        if (soft) {
          await syncNow()
          await hydrateNow()
        }
        const [{ data: dash }, txRes] = await Promise.all([
          dashboardApi.get(),
          transactionsApi.list().catch(() => ({ data: [] })),
        ])
        setData(dash)
        setBreakdown(breakdownFromTxs(asList<Transaction>(txRes.data)))
      } else {
        await loadFromCache()
      }
    } catch (err) {
      try {
        await loadFromCache()
        setError(apiErrorMessage(err, 'Showing cached data (offline).'))
      } catch {
        setError(apiErrorMessage(err, 'Could not load dashboard.'))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [online, syncNow, hydrateNow, loadFromCache])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const txs: Transaction[] = data?.recent_transactions ?? asList(data?.recent_transactions)
  const balanceNeg = toMoney(data?.total_balance) < 0
  const accounts = data?.accounts ?? []

  const deleteExpense = (tx: Transaction) => {
    if (tx.type !== 'expense' || tx.category === 'Bank Transfer') return
    if (!online) {
      Alert.alert('Offline', 'Connect to the internet to delete an expense.')
      return
    }
    Alert.alert(
      'Delete expense?',
      `Remove “${tx.category || 'Expense'}” of ${money.fmt(tx.amount)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await transactionsApi.remove(tx.id)
                bumpRefresh()
                await load(true)
              } catch (err) {
                Alert.alert('Delete failed', apiErrorMessage(err, 'Could not delete expense.'))
              }
            })()
          },
        },
      ],
    )
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 78,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
        }}
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
        <View style={styles.welcomeRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hi, { color: colors.textMuted }]}>Welcome back,</Text>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.primaryDark }]}>{name}</Text>
              {(premium.is_premium || user?.is_premium) ? (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>Premium</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {loading && !data ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <Reveal index={0}>
            <LinearGradient
              colors={[colors.primaryDark, colors.primary, colors.primarySoft]}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroGlow} pointerEvents="none" />
              <View style={styles.heroGlow2} pointerEvents="none" />
              <View style={styles.heroSheen} pointerEvents="none" />
              <View style={styles.heroTop}>
                <Text style={styles.heroLabel}>Total balance</Text>
                <AmountEyeToggle tone="light" />
              </View>
              <Text
                style={[
                  styles.heroAmount,
                  money.amountStyle,
                  balanceNeg && !money.amountsHidden ? { color: '#fecaca' } : null,
                ]}
              >
                {money.fmtBalance(data?.total_balance ?? 0)}
              </Text>
              <Text style={styles.heroHint}>
                Across {walletCount} wallet{walletCount === 1 ? '' : 's'}
              </Text>

              <View style={styles.balanceChips}>
                <View style={styles.balanceChip}>
                  <View style={styles.chipLabelRow}>
                    <FontAwesome name="arrow-up" size={10} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.chipLabel}>{monthName} in</Text>
                  </View>
                  <Text style={[styles.chipValue, money.amountStyle]}>
                    {money.fmt(data?.month_income ?? 0)}
                  </Text>
                </View>
                <View style={styles.balanceChip}>
                  <View style={styles.chipLabelRow}>
                    <FontAwesome name="arrow-down" size={10} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.chipLabel}>{monthName} out</Text>
                  </View>
                  <Text style={[styles.chipValue, money.amountStyle]}>
                    {money.fmt(data?.month_expense ?? 0)}
                  </Text>
                </View>
              </View>
            </LinearGradient>
            </Reveal>

            {accounts.length > 0 ? (
              <Reveal index={1}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardHead}>
                    <Text style={[styles.cardTitle, { color: colors.primaryDark }]}>What you have</Text>
                    <Pressable onPress={() => router.push('/(tabs)/wallets')} hitSlop={8}>
                      <Text style={[styles.link, { color: colors.primary }]}>All wallets →</Text>
                    </Pressable>
                  </View>
                  <View style={styles.acctGrid}>
                    {accounts.slice(0, 6).map((a) => {
                      const neg = toMoney(a.balance) < 0
                      return (
                        <Pressable
                          key={a.id ?? a.name}
                          style={[styles.acctCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                          onPress={() => router.push('/(tabs)/wallets')}
                        >
                          <View style={styles.acctTop}>
                            <View style={[styles.acctIcon, { backgroundColor: colors.surface }]}>
                              <FontAwesome
                                name={a.type === 'cash' ? 'money' : 'university'}
                                size={13}
                                color={colors.primary}
                              />
                            </View>
                            <Text style={[styles.acctName, { color: colors.text }]} numberOfLines={1}>{a.name}</Text>
                          </View>
                          <Text
                            style={[
                              styles.acctBal,
                              money.amountStyle,
                              { color: neg ? colors.danger : colors.primaryDark },
                            ]}
                            numberOfLines={1}
                          >
                            {money.fmtBalance(a.balance)}
                          </Text>
                        </Pressable>
                      )
                    })}
                    <Pressable
                      style={[styles.acctCard, styles.acctAdd, { borderColor: colors.borderStrong }]}
                      onPress={() => router.push('/(tabs)/wallets')}
                    >
                      <FontAwesome name="plus" size={16} color={colors.primary} />
                      <Text style={[styles.acctAddText, { color: colors.primary }]}>Add wallet</Text>
                    </Pressable>
                  </View>
                </View>
              </Reveal>
            ) : null}

            <Reveal index={2}>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, { color: colors.primaryDark }]}>{monthName} spending</Text>
                  <Pressable onPress={() => router.push('/(tabs)/reports')} hitSlop={8}>
                    <Text style={[styles.link, { color: colors.primary }]}>Reports →</Text>
                  </Pressable>
                </View>
                <CategoryDonut data={breakdown} />
              </View>
            </Reveal>

            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.primaryDark }]}>Recent</Text>
              <Pressable onPress={() => router.push('/add-transaction')} hitSlop={8}>
                <Text style={[styles.link, { color: colors.primary }]}>Add</Text>
              </Pressable>
            </View>

            {txs.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No transactions yet</Text>
                <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Tap + to record income, expense, or a transfer.</Text>
              </View>
            ) : (
              txs.map((tx, i) => {
                const income = tx.type === 'income'
                const canDelete = !income && tx.category !== 'Bank Transfer'
                const meta = getCategoryMeta(tx.category)
                return (
                  <Reveal index={i} key={tx.id}>
                  <View style={[styles.txRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.txIcon, { backgroundColor: income ? '#ecfdf5' : `${meta.color}1f` }]}>
                      <FontAwesome
                        name={income ? 'arrow-up' : meta.icon}
                        size={14}
                        color={income ? colors.success : meta.color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txCat}>{tx.category || (income ? 'Income' : 'Expense')}</Text>
                      {tx.notes ? <Text style={styles.txNotes} numberOfLines={2}>{tx.notes}</Text> : null}
                      <Text style={styles.txMeta}>
                        {tx.account_name || 'Wallet'} · {tx.date}
                      </Text>
                    </View>
                    <View style={styles.txRight}>
                      <Text
                        style={[
                          styles.txAmt,
                          money.amountStyle,
                          { color: income ? colors.success : colors.danger },
                        ]}
                      >
                        {money.fmtSigned(Math.abs(toMoney(tx.amount)), income)}
                      </Text>
                      {canDelete ? (
                        <Pressable
                          onPress={() => deleteExpense(tx)}
                          hitSlop={10}
                          accessibilityLabel="Delete expense"
                          style={styles.txDelete}
                        >
                          <FontAwesome name="trash-o" size={15} color={colors.danger} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  </Reveal>
                )
              })
            )}
          </>
        )}
      </ScrollView>
      <AdBanner />
    </Screen>
  )
}

const styles = StyleSheet.create({
  welcomeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: spacing.lg,
  },
  hi: { fontSize: typography.body, fontWeight: '600', color: '#7fa393' },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2 },
  name: { fontSize: 20, fontWeight: '800', color: '#047857', letterSpacing: -0.3 },
  premiumBadge: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  error: { color: '#dc2626', marginBottom: spacing.md, fontWeight: '600' },
  hero: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...iosShadow,
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  heroGlow: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroGlow2: {
    position: 'absolute',
    top: -16,
    right: 8,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  heroAmount: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    marginTop: spacing.sm,
    letterSpacing: -0.5,
  },
  heroHint: { color: 'rgba(255,255,255,0.58)', fontSize: typography.caption, marginTop: 3 },
  balanceChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  balanceChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  chipLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  chipValue: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: typography.caption,
    marginTop: 3,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...iosShadow,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: typography.subtitle, fontWeight: '800', letterSpacing: -0.2 },
  acctGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  acctCard: {
    width: '48%',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  acctTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  acctIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acctName: { flex: 1, fontWeight: '700', fontSize: typography.caption },
  acctBal: { fontWeight: '800', fontSize: 14 },
  acctAdd: {
    borderStyle: 'dashed',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 74,
  },
  acctAddText: { fontWeight: '800', fontSize: typography.caption },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: typography.subtitle, fontWeight: '800', letterSpacing: -0.2 },
  link: { fontWeight: '800', fontSize: typography.caption },
  empty: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    ...iosShadow,
  },
  emptyTitle: { fontWeight: '800', marginBottom: 3, fontSize: typography.body },
  emptyBody: { fontSize: typography.caption, lineHeight: 16, color: '#6b7280' },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...iosShadow,
  },
  txIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txCat: { fontWeight: '800', fontSize: typography.body },
  txNotes: { fontSize: typography.caption, marginTop: 2, color: '#4b5563' },
  txMeta: { fontSize: 11, marginTop: 3, color: '#6b7280' },
  txRight: { alignItems: 'flex-end', gap: 8 },
  txAmt: { fontWeight: '800', fontSize: typography.caption },
  txDelete: {
    padding: 4,
  },
})
