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
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiErrorMessage, asList, dashboardApi } from '@/src/api/client'
import type { Dashboard, Transaction } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { Screen } from '@/src/components/ui'
import { useAuth } from '@/src/context/AuthContext'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useOffline } from '@/src/offline'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { colors, radii, spacing, typography } from '@/src/theme/colors'
import { toMoney } from '@/src/utils/format'

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
  const { openAdd, refreshKey } = useMoneyUi()
  const { online, syncNow, hydrateNow, getCachedAccounts, getCachedTransactions } = useOffline()
  const money = useMaskedMoney()
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<Dashboard | null>(null)
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
        const { data: dash } = await dashboardApi.get()
        setData(dash)
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 88,
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
          <Text style={styles.hi}>Welcome back,</Text>
          <Text style={styles.name}>{name}</Text>
        </View>

        {loading && !data ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.hero}>
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
                    <FontAwesome name="arrow-up" size={10} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.chipLabel}>{monthName} in</Text>
                  </View>
                  <Text style={[styles.chipValue, money.amountStyle]}>
                    {money.fmt(data?.month_income ?? 0)}
                  </Text>
                </View>
                <View style={styles.balanceChip}>
                  <View style={styles.chipLabelRow}>
                    <FontAwesome name="arrow-down" size={10} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.chipLabel}>{monthName} out</Text>
                  </View>
                  <Text style={[styles.chipValue, money.amountStyle]}>
                    {money.fmt(data?.month_expense ?? 0)}
                  </Text>
                </View>
              </View>
            </View>

            {(data?.accounts?.length ?? 0) > 0 ? (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Wallets</Text>
                  <Pressable onPress={() => router.push('/(tabs)/wallets')} hitSlop={8}>
                    <Text style={styles.link}>See all →</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.walletStrip}
                >
                  {data!.accounts!.slice(0, 6).map((a) => (
                    <Pressable
                      key={a.id ?? a.name}
                      style={styles.walletCard}
                      onPress={() => router.push('/(tabs)/wallets')}
                    >
                      <View style={styles.walletIcon}>
                        <FontAwesome
                          name={a.type === 'cash' ? 'money' : 'university'}
                          size={14}
                          color={colors.primary}
                        />
                      </View>
                      <Text style={styles.walletName} numberOfLines={1}>{a.name}</Text>
                      <Text style={[styles.walletBal, money.amountStyle]}>
                        {money.fmtBalance(a.balance)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

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
                    <Text
                      style={[
                        styles.txAmt,
                        money.amountStyle,
                        { color: income ? colors.success : colors.danger },
                      ]}
                    >
                      {money.fmtSigned(Math.abs(toMoney(tx.amount)), income)}
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
  welcomeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: spacing.lg,
  },
  hi: { fontSize: typography.body, color: colors.textMuted, fontWeight: '600' },
  name: { fontSize: typography.title, fontWeight: '800', color: colors.primaryDark },
  error: { color: colors.danger, marginBottom: spacing.md, fontWeight: '600' },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  heroAmount: {
    color: colors.white,
    fontSize: typography.hero,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  heroHint: { color: 'rgba(255,255,255,0.55)', fontSize: typography.caption, marginTop: 4 },
  balanceChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  balanceChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  chipValue: {
    color: colors.white,
    fontWeight: '800',
    fontSize: typography.caption,
    marginTop: 4,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: typography.subtitle, fontWeight: '800', color: colors.primaryDark },
  link: { color: colors.primary, fontWeight: '800' },
  walletStrip: { gap: spacing.sm, paddingBottom: spacing.lg },
  walletCard: {
    width: 140,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  walletIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  walletName: { fontWeight: '700', color: colors.text, fontSize: typography.caption },
  walletBal: { fontWeight: '800', color: colors.primaryDark, marginTop: 4, fontSize: 13 },
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
  txIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txCat: { fontWeight: '800', color: colors.text, fontSize: typography.body },
  txNotes: { color: colors.textSecondary, fontSize: typography.caption, marginTop: 2 },
  txMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  txAmt: { fontWeight: '800', fontSize: typography.caption },
})
