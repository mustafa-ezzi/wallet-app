import { useCallback, useEffect, useState } from 'react'
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
import { apiErrorMessage, asList, dashboardApi, forecastApi, transactionsApi } from '@/src/api/client'
import type { Dashboard, Forecast, Transaction } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { Reveal } from '@/src/components/motion'
import { Screen } from '@/src/components/ui'
import { useAuth } from '@/src/context/AuthContext'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useOffline } from '@/src/offline'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
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

export default function HomeScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const { openAdd, refreshKey, bumpRefresh } = useMoneyUi()
  const { online, syncNow, hydrateNow, getCachedAccounts, getCachedTransactions } = useOffline()
  const money = useMaskedMoney()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<Dashboard | null>(null)
  const [forecast, setForecast] = useState<Forecast | null>(null)
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
        const now = new Date()
        const [{ data: dash }, forecastRes] = await Promise.all([
          dashboardApi.get(),
          forecastApi.get(now.getFullYear(), now.getMonth() + 1).catch(() => null),
        ])
        setData(dash)
        if (forecastRes) setForecast(forecastRes.data ?? null)
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
          <Text style={[styles.hi, { color: colors.textMuted }]}>Welcome back,</Text>
          <Text style={[styles.name, { color: colors.primaryDark }]}>{name}</Text>
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

            {forecast ? (
              <Reveal index={1}>
                <Pressable
                  style={[styles.forecastCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => router.push('/(tabs)/reports')}
                >
                  <View style={styles.forecastHead}>
                    <Text style={[styles.forecastTitle, { color: colors.text }]}>Expected Net This Month</Text>
                    <Text style={[styles.link, { color: colors.primary }]}>Full report →</Text>
                  </View>
                  <Text
                    style={[
                      styles.forecastNet,
                      money.amountStyle,
                      { color: toMoney(forecast.net_forecast) >= 0 ? colors.success : colors.danger },
                    ]}
                  >
                    {money.fmtSigned(Math.abs(toMoney(forecast.net_forecast)), toMoney(forecast.net_forecast) >= 0)}
                  </Text>
                  <Text style={[styles.forecastHint, { color: colors.textMuted }]}>
                    Based on scheduled income &amp; expenses
                  </Text>

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  <View style={styles.actualRow}>
                    <Text style={[styles.actualLabel, { color: colors.textMuted }]}>Actual net this month</Text>
                    <Text
                      style={[
                        styles.actualValue,
                        money.amountStyle,
                        { color: toMoney(forecast.actual_net) >= 0 ? colors.success : colors.danger },
                      ]}
                    >
                      {toMoney(forecast.actual_net) >= 0 ? 'Surplus ' : 'Deficit '}
                      {money.fmt(Math.abs(toMoney(forecast.actual_net)))}
                    </Text>
                  </View>

                  <Text style={[styles.barLabel, { color: colors.textMuted }]}>
                    Income received
                    <Text style={{ color: colors.text }}>
                      {'  '}
                      {money.fmt(forecast.actual_income)} / {money.fmt(forecast.total_expected_income)}
                    </Text>
                  </Text>
                  <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.min(100, Math.round((toMoney(forecast.actual_income) / Math.max(1, toMoney(forecast.total_expected_income))) * 100))}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>

                  <Text style={[styles.barLabel, { color: colors.textMuted, marginTop: spacing.sm }]}>
                    Expenses paid
                    <Text style={{ color: colors.text }}>
                      {'  '}
                      {money.fmt(forecast.actual_expense)} / {money.fmt(forecast.total_expected_outgoing)}
                    </Text>
                  </Text>
                  <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.min(100, Math.round((toMoney(forecast.actual_expense) / Math.max(1, toMoney(forecast.total_expected_outgoing))) * 100))}%`,
                          backgroundColor: colors.danger,
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              </Reveal>
            ) : null}

            {(data?.accounts?.length ?? 0) > 0 ? (
              <>
                <View style={styles.sectionHead}>
                  <Text style={[styles.sectionTitle, { color: colors.primaryDark }]}>Wallets</Text>
                  <Pressable onPress={() => router.push('/(tabs)/wallets')} hitSlop={8}>
                    <Text style={[styles.link, { color: colors.primary }]}>See all →</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.walletStrip}
                >
                  {data!.accounts!.slice(0, 6).map((a, i) => (
                    <Reveal index={i} key={a.id ?? a.name}>
                    <Pressable
                      style={[styles.walletCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => router.push('/(tabs)/wallets')}
                    >
                      <View style={[styles.walletIcon, { backgroundColor: colors.surfaceMuted }]}>
                        <FontAwesome
                          name={a.type === 'cash' ? 'money' : 'university'}
                          size={14}
                          color={colors.primary}
                        />
                      </View>
                      <Text style={[styles.walletName, { color: colors.text }]} numberOfLines={1}>{a.name}</Text>
                      <Text style={[styles.walletBal, money.amountStyle, { color: colors.primaryDark }]}>
                        {money.fmtBalance(a.balance)}
                      </Text>
                    </Pressable>
                    </Reveal>
                  ))}
                </ScrollView>
              </>
            ) : null}

            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.primaryDark }]}>Recent</Text>
              <Pressable onPress={openAdd} hitSlop={8}>
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
                return (
                  <Reveal index={i} key={tx.id}>
                  <View style={[styles.txRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.txIcon, { backgroundColor: income ? '#ecfdf5' : '#fef2f2' }]}>
                      <FontAwesome
                        name={income ? 'arrow-up' : 'arrow-down'}
                        size={12}
                        color={income ? colors.success : colors.danger}
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
  name: { fontSize: 20, fontWeight: '800', color: '#047857', letterSpacing: -0.3 },
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
  forecastCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...iosShadow,
  },
  forecastHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  forecastTitle: { fontWeight: '800', fontSize: typography.body },
  forecastNet: { fontWeight: '800', fontSize: typography.title, marginTop: spacing.sm },
  forecastHint: { fontSize: 11, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  actualRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  actualLabel: { fontSize: typography.caption, fontWeight: '600' },
  actualValue: { fontWeight: '800', fontSize: typography.caption },
  barLabel: { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: typography.subtitle, fontWeight: '800', letterSpacing: -0.2 },
  link: { fontWeight: '800', fontSize: typography.caption },
  walletStrip: { gap: spacing.sm, paddingBottom: spacing.md },
  walletCard: {
    width: 128,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    ...iosShadow,
  },
  walletIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  walletName: { fontWeight: '700', fontSize: typography.caption },
  walletBal: { fontWeight: '800', marginTop: 3, fontSize: 12 },
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
    width: 28,
    height: 28,
    borderRadius: 9,
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
