import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  accountsApi,
  apiErrorMessage,
  asList,
  forecastApi,
  transactionsApi,
} from '@/src/api/client'
import type { Account, Forecast, Transaction } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { Reveal } from '@/src/components/motion'
import { SelectField } from '@/src/components/SelectFields'
import { Screen } from '@/src/components/ui'
import { useAuth } from '@/src/context/AuthContext'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { sumMoney, toMoney } from '@/src/utils/format'
import { shareReportPdf, type ReportLedgerRow } from '@/src/utils/reportPdf'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

function isTransfer(tx: Transaction) {
  return tx.category === 'Bank Transfer'
}

export default function ReportsScreen() {
  const now = new Date()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const money = useMaskedMoney()
  const { user } = useAuth()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [allTxs, setAllTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [walletFilter, setWalletFilter] = useState<number | 'all'>('all')
  const [pdfBusy, setPdfBusy] = useState(false)

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      const [fRes, aRes, tRes] = await Promise.all([
        forecastApi.get(year, month),
        accountsApi.list(),
        transactionsApi.list(),
      ])
      const d = fRes.data ?? {}
      setForecast({
        ...d,
        forecast_income: Array.isArray(d.forecast_income) ? d.forecast_income : [],
        forecast_outgoing: Array.isArray(d.forecast_outgoing) ? d.forecast_outgoing : [],
      })
      setAccounts(asList<Account>(aRes.data))
      setAllTxs(asList<Transaction>(tRes.data))
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load reports.'))
      setForecast(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [year, month])

  useEffect(() => {
    void load()
  }, [load])

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else setMonth((m) => m + 1)
  }

  const monthTxs = useMemo(
    () => allTxs.filter((t) => t.date >= monthStart && t.date <= monthEnd),
    [allTxs, monthStart, monthEnd],
  )

  const ledgerTxs = useMemo(() => {
    const rows = walletFilter === 'all' ? monthTxs : monthTxs.filter((t) => t.account === walletFilter)
    return rows.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  }, [monthTxs, walletFilter])

  const monthIncome = sumMoney(monthTxs.filter((t) => t.type === 'income' && !isTransfer(t)), (t) => t.amount)
  const monthExpense = sumMoney(monthTxs.filter((t) => t.type === 'expense' && !isTransfer(t)), (t) => t.amount)
  const net = toMoney(forecast?.net_forecast)
  const maxBar = Math.max(
    toMoney(forecast?.total_expected_income),
    toMoney(forecast?.total_expected_outgoing),
    1,
  )

  const categoryBreakdown = useMemo(() => {
    const m = new Map<string, number>()
    monthTxs
      .filter((t) => t.type === 'expense' && !isTransfer(t))
      .forEach((t) => {
        const key = t.category || 'Uncategorized'
        m.set(key, (m.get(key) ?? 0) + toMoney(t.amount))
      })
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [monthTxs])

  const shareCsv = async () => {
    const header = 'Date,Type,Category,Wallet,Amount,Notes'
    const lines = ledgerTxs.map((t) => {
      const notes = String(t.notes || '').replace(/"/g, '""')
      return [
        t.date,
        t.type,
        t.category || '',
        t.account_name || '',
        toMoney(t.amount),
        `"${notes}"`,
      ].join(',')
    })
    const csv = [header, ...lines].join('\n')
    await Share.share({
      title: `CashTrail ${monthLabel}`,
      message: `CashTrail ledger — ${monthLabel}\n\n${csv}`,
    })
  }

  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      const chron = ledgerTxs.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      let running = 0
      const rows: ReportLedgerRow[] = chron.map((t) => {
        const amt = toMoney(t.amount)
        const isIncome = t.type === 'income'
        if (isIncome) running += amt
        else running -= amt
        return {
          date: t.date,
          description: t.notes || t.category || (isIncome ? 'Income' : 'Expense'),
          account: t.account_name || 'Wallet',
          type: isIncome ? 'Income' : 'Expense',
          category: t.category || '',
          debit: isIncome ? 0 : amt,
          credit: isIncome ? amt : 0,
          balance: running,
        }
      })
      const username =
        [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
        || user?.email
        || 'CashTrail user'
      await shareReportPdf(rows, {
        username,
        monthLabel,
        income: monthIncome,
        expense: monthExpense,
        net: monthIncome - monthExpense,
        expectedIncome: toMoney(forecast?.total_expected_income),
        expectedExpense: toMoney(forecast?.total_expected_outgoing),
        netForecast: toMoney(forecast?.net_forecast),
      })
    } catch (err) {
      Alert.alert('PDF export', apiErrorMessage(err, 'Could not create the PDF report.'))
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 88 }}
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
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Reports</Text>
            <Text style={styles.sub}>Forecast vs actual for the month</Text>
          </View>
          <AmountEyeToggle />
        </View>

        <View style={styles.monthNav}>
          <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
            <FontAwesome name="chevron-left" size={14} color={colors.primaryDark} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={8}>
            <FontAwesome name="chevron-right" size={14} color={colors.primaryDark} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && !forecast ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <Reveal index={0}>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Expected net</Text>
              <Text
                style={[
                  styles.heroAmount,
                  money.amountStyle,
                  { color: net >= 0 ? '#bbf7d0' : '#fecaca' },
                ]}
              >
                {money.fmtBalance(net)}
              </Text>
              <View style={styles.heroChips}>
                <View style={styles.heroChip}>
                  <Text style={styles.chipLab}>Expected in</Text>
                  <Text style={[styles.chipVal, money.amountStyle]}>
                    {money.fmt(forecast?.total_expected_income)}
                  </Text>
                </View>
                <View style={styles.heroChip}>
                  <Text style={styles.chipLab}>Expected out</Text>
                  <Text style={[styles.chipVal, money.amountStyle]}>
                    {money.fmt(forecast?.total_expected_outgoing)}
                  </Text>
                </View>
              </View>
            </View>
            </Reveal>

            <Reveal index={1}>
            <View style={styles.actualRow}>
              <View style={[styles.actualCard, styles.inCard]}>
                <Text style={styles.actualLab}>Month in</Text>
                <Text style={[styles.actualVal, money.amountStyle, { color: colors.success }]}>
                  {money.fmt(monthIncome)}
                </Text>
              </View>
              <View style={[styles.actualCard, styles.outCard]}>
                <Text style={styles.actualLab}>Month out</Text>
                <Text style={[styles.actualVal, money.amountStyle, { color: colors.danger }]}>
                  {money.fmt(monthExpense)}
                </Text>
              </View>
            </View>
            </Reveal>

            <Text style={styles.section}>Forecast vs actual</Text>
            <View style={styles.card}>
              <Text style={styles.barLab}>Expected income</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct(toMoney(forecast?.total_expected_income), maxBar)}%`, backgroundColor: colors.primary },
                  ]}
                />
              </View>
              <Text style={styles.barLab}>Actual income</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct(toMoney(forecast?.actual_income), maxBar)}%`, backgroundColor: '#34d399' },
                  ]}
                />
              </View>
              <Text style={styles.barLab}>Expected outgoing</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct(toMoney(forecast?.total_expected_outgoing), maxBar)}%`, backgroundColor: '#f97316' },
                  ]}
                />
              </View>
              <Text style={styles.barLab}>Actual expense</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct(toMoney(forecast?.actual_expense), maxBar)}%`, backgroundColor: colors.danger },
                  ]}
                />
              </View>
            </View>

            <Text style={styles.section}>Income sources</Text>
            {(forecast?.forecast_income ?? []).length === 0 ? (
              <Text style={styles.empty}>No expected income this month.</Text>
            ) : (
              (forecast?.forecast_income ?? []).map((row, i) => (
                <Reveal index={i} key={`in-${i}`}>
                <View style={styles.lineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineTitle}>{row.label}</Text>
                    <Text style={styles.lineMeta}>{row.type}</Text>
                  </View>
                  <Text style={[styles.lineAmt, money.amountStyle, { color: colors.success }]}>
                    {money.fmt(row.amount)}
                  </Text>
                </View>
                </Reveal>
              ))
            )}

            <Text style={styles.section}>Outgoing</Text>
            {(forecast?.forecast_outgoing ?? []).length === 0 ? (
              <Text style={styles.empty}>No expected outgoings.</Text>
            ) : (
              (forecast?.forecast_outgoing ?? []).map((row, i) => (
                <Reveal index={i} key={`out-${i}`}>
                <View style={styles.lineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineTitle}>{row.label}</Text>
                    <Text style={styles.lineMeta}>
                      {row.type}
                      {row.due_day ? ` · day ${row.due_day}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.lineAmt, money.amountStyle, { color: colors.danger }]}>
                    {money.fmt(row.amount)}
                  </Text>
                </View>
                </Reveal>
              ))
            )}

            <Text style={styles.section}>Spending by category</Text>
            {categoryBreakdown.length === 0 ? (
              <Text style={styles.empty}>No expenses this month.</Text>
            ) : (
              categoryBreakdown.slice(0, 12).map(([cat, amt], i) => (
                <Reveal index={i} key={cat}>
                <View style={styles.lineRow}>
                  <Text style={[styles.lineTitle, { flex: 1 }]}>{cat}</Text>
                  <Text style={[styles.lineAmt, money.amountStyle]}>{money.fmt(amt)}</Text>
                </View>
                </Reveal>
              ))
            )}

            <View style={[styles.sectionHead, { marginTop: spacing.lg }]}>
              <Text style={styles.section}>Wallet ledger</Text>
              <View style={styles.exportRow}>
                <Pressable onPress={() => void downloadPdf()} hitSlop={8} disabled={pdfBusy}>
                  <Text style={[styles.link, pdfBusy && { opacity: 0.5 }]}>
                    {pdfBusy ? 'Building PDF…' : 'Download PDF'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => void shareCsv()} hitSlop={8}>
                  <Text style={styles.linkMuted}>CSV</Text>
                </Pressable>
              </View>
            </View>

            <SelectField
              label="Wallet"
              value={walletFilter === 'all' ? 'all' : String(walletFilter)}
              options={[
                { value: 'all', label: 'All wallets' },
                ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
              ]}
              onChange={(v) => setWalletFilter(v === 'all' ? 'all' : Number(v))}
            />

            {ledgerTxs.length === 0 ? (
              <Text style={styles.empty}>No transactions in this month.</Text>
            ) : (
              ledgerTxs.slice(0, 40).map((tx, i) => {
                const income = tx.type === 'income'
                return (
                  <Reveal index={i} key={tx.id}>
                  <View style={styles.txRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineTitle}>{tx.category || (income ? 'Income' : 'Expense')}</Text>
                      <Text style={styles.lineMeta}>
                        {tx.account_name || 'Wallet'} · {tx.date}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.lineAmt,
                        money.amountStyle,
                        { color: income ? colors.success : colors.danger },
                      ]}
                    >
                      {money.fmtSigned(Math.abs(toMoney(tx.amount)), income)}
                    </Text>
                  </View>
                  </Reveal>
                )
              })
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  title: { fontSize: typography.title, fontWeight: '800', color: colors.text },
  sub: { color: colors.textMuted, marginTop: 2, fontSize: typography.caption },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  navBtn: { padding: 8 },
  monthLabel: { fontWeight: '800', color: colors.primaryDark, fontSize: typography.subtitle },
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
  },
  heroAmount: { color: colors.white, fontSize: typography.hero, fontWeight: '800', marginTop: spacing.sm },
  heroChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  heroChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.sm,
    padding: 10,
  },
  chipLab: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700' },
  chipVal: { color: colors.white, fontWeight: '800', marginTop: 4, fontSize: 13 },
  actualRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  actualCard: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  inCard: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  outCard: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  actualLab: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  actualVal: { marginTop: 4, fontWeight: '800', fontSize: typography.caption },
  section: {
    fontSize: typography.subtitle,
    fontWeight: '800',
    color: colors.primaryDark,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exportRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  link: { color: colors.primary, fontWeight: '800' },
  linkMuted: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  barLab: { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 4, marginTop: 6 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  empty: { color: colors.textMuted, fontSize: typography.caption, marginBottom: spacing.md },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  lineTitle: { fontWeight: '800', color: colors.text },
  lineMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  lineAmt: { fontWeight: '800', fontSize: typography.caption },
  filters: { gap: 8, marginBottom: spacing.md },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '700', color: colors.textSecondary, fontSize: 12 },
  chipTextOn: { color: colors.white },
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
  })
}
