import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import {
  accountsApi,
  apiErrorMessage,
  asList,
  householdsApi,
  transactionsApi,
} from '@/src/api/client'
import type { Account } from '@/src/api/types'
import { CalculatorSheet } from '@/src/components/CalculatorSheet'
import { DateField, SelectField } from '@/src/components/SelectFields'
import { ErrorBanner } from '@/src/components/ui'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type CategoryMeta,
} from '@/src/constants/categories'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useOffline } from '@/src/offline'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { fmtBalance, todayISO } from '@/src/utils/format'
import { useTravelMode } from '@/src/travel/TravelModeContext'
import { formatRateLine, foreignToPkr } from '@/src/travel/currencies'

type Kind = 'expense' | 'income' | 'transfer'

type OpenLedger = {
  id: number
  name: string
  household: number
  household_name: string
}

const KIND_META: Record<Kind, { label: string; accent: string; icon: React.ComponentProps<typeof FontAwesome>['name'] }> = {
  expense: { label: 'Expense', accent: '#ef4444', icon: 'arrow-down' },
  income: { label: 'Income', accent: '#22c55e', icon: 'arrow-up' },
  transfer: { label: 'Transfer', accent: '#0ea5e9', icon: 'exchange' },
}

export default function AddTransactionScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { bumpRefresh } = useMoneyUi()
  const { online, queueTransaction, getCachedAccounts, hydrateNow } = useOffline()
  const {
    isActive: travelOn,
    currency: travelCurrency,
    rate: travelRate,
    rateLine,
    toPkr,
  } = useTravelMode()

  const [kind, setKind] = useState<Kind>('expense')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [openLedgers, setOpenLedgers] = useState<OpenLedger[]>([])
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [category, setCategory] = useState('')
  const [householdLedgerId, setHouseholdLedgerId] = useState('')
  const [notes, setNotes] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState('')
  const submittingRef = useRef(false)

  useEffect(() => {
    ;(async () => {
      try {
        if (online) {
          try {
            const [{ data }, ledgersRes] = await Promise.all([
              accountsApi.list({ type: 'bank,cash' }),
              householdsApi.openLedgers().catch(() => ({ data: [] })),
            ])
            const list = asList<Account>(data).filter((a) => a.type !== 'person')
            setAccounts(list)
            setAccountId(list[0] ? String(list[0].id) : '')
            setToAccountId(list[1] ? String(list[1].id) : list[0] ? String(list[0].id) : '')
            setOpenLedgers(asList<OpenLedger>(ledgersRes.data))
            void hydrateNow()
            return
          } catch {
            /* fall through to cache */
          }
        }
        setOpenLedgers([])
        const cached = await getCachedAccounts()
        const list: Account[] = cached.map((a) => ({
          id: a.serverId,
          name: a.name,
          type: a.type === 'cash' ? 'cash' : 'bank',
          opening_balance: a.openingBalance,
          current_balance: a.currentBalance,
        }))
        setAccounts(list)
        setAccountId(list[0] ? String(list[0].id) : '')
        setToAccountId(list[1] ? String(list[1].id) : list[0] ? String(list[0].id) : '')
        if (list.length === 0) setError('No wallets cached. Connect once to download your wallets.')
      } catch (err) {
        setError(apiErrorMessage(err, 'Could not load wallets.'))
      } finally {
        setBooting(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setCategory('')
    setHouseholdLedgerId('')
  }, [kind])

  const categories: CategoryMeta[] = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const householdOptions = useMemo(
    () => [
      { value: '', label: 'Personal only — not shared' },
      ...openLedgers.map((l) => ({
        value: String(l.id),
        label: `${l.household_name} — ${l.name}`,
      })),
    ],
    [openLedgers],
  )

  const walletOptions = useMemo(
    () => accounts.map((a) => ({ value: String(a.id), label: a.name, hint: fmtBalance(a.current_balance) })),
    [accounts],
  )
  const toWalletOptions = useMemo(
    () => walletOptions.filter((o) => o.value !== accountId),
    [walletOptions, accountId],
  )

  const accountIcon = (a: Account): React.ComponentProps<typeof FontAwesome>['name'] =>
    a.type === 'cash' ? 'money' : 'university'

  const submit = async () => {
    if (submittingRef.current || loading) return
    setError('')
    const value = parseFloat(amount.replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid amount.')
      return
    }
    if (kind !== 'transfer' && !category) {
      setError('Pick a category.')
      return
    }

    const useTravel = travelOn && kind !== 'transfer'
    const pkrAmount = useTravel ? toPkr(value) : value
    if (useTravel && (!(travelRate > 0) || !(pkrAmount > 0))) {
      setError('Travel rate missing. Open Travel Mode and set a rate.')
      return
    }
    const fxPayload = useTravel
      ? {
          originalAmount: value,
          originalCurrency: travelCurrency,
          fxRate: travelRate,
          fxSource: 'manual' as const,
        }
      : {}

    submittingRef.current = true
    setLoading(true)
    let succeeded = false
    try {
      if (kind === 'transfer') {
        if (!accountId || !toAccountId) {
          setError('Select both wallets.')
          return
        }
        if (toAccountId === accountId) {
          setError('Pick a different destination wallet.')
          return
        }
        const note = notes.trim() || 'Transfer'
        await queueTransaction({
          type: 'expense',
          amount: value,
          date,
          accountServerId: Number(accountId),
          category: 'Bank Transfer',
          notes: `${note} (out)`,
        })
        await queueTransaction({
          type: 'income',
          amount: value,
          date,
          accountServerId: Number(toAccountId),
          category: 'Bank Transfer',
          notes: `${note} (in)`,
        })
        succeeded = true
        finishOk()
        return
      }

      if (!accountId) {
        setError('Create a wallet first.')
        return
      }

      if (kind === 'expense' && householdLedgerId) {
        if (!online) {
          setError('Household linking needs an internet connection.')
          return
        }
        await transactionsApi.create({
          type: 'expense',
          amount: pkrAmount,
          date,
          account: Number(accountId),
          category,
          notes: notes.trim(),
          household_ledger: Number(householdLedgerId),
          ...(useTravel
            ? {
                original_amount: value,
                original_currency: travelCurrency,
                fx_rate: travelRate,
                fx_source: 'manual',
              }
            : {}),
        })
        void hydrateNow()
        succeeded = true
        finishOk()
        return
      }

      await queueTransaction({
        type: kind,
        amount: pkrAmount,
        date,
        accountServerId: Number(accountId),
        category,
        notes: notes.trim(),
        ...fxPayload,
      })
      succeeded = true
      finishOk()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save transaction.'))
    } finally {
      if (!succeeded) {
        submittingRef.current = false
        setLoading(false)
      }
    }
  }

  const finishOk = () => {
    bumpRefresh()
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }

  const accent = KIND_META[kind].accent

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <View style={styles.headerRow}>
          <View style={{ width: 34 }} />
          <Text style={styles.headerTitle}>Add Transaction</Text>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.closeBtn}>
            <FontAwesome name="close" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.seg}>
          {(['expense', 'income', 'transfer'] as Kind[]).map((k) => {
            const active = kind === k
            return (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[styles.segBtn, active && styles.segBtnActive]}
              >
                <Text style={[styles.segText, active && styles.segTextActive]}>{KIND_META[k].label}</Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.amountCard}>
          <Text style={[styles.amountCurrency, { color: colors.textMuted }]}>
            {travelOn && kind !== 'transfer' ? travelCurrency : 'PKR'}
          </Text>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            style={[styles.amountValue, { color: colors.text, flex: 1, padding: 0 }]}
          />
          <Pressable
            onPress={() => setCalcOpen(true)}
            hitSlop={8}
            style={[styles.calcBtn, { backgroundColor: colors.surfaceMuted }]}
            accessibilityLabel="Open calculator"
          >
            <FontAwesome name="calculator" size={18} color={colors.primary} />
          </Pressable>
        </View>
        {travelOn && kind !== 'transfer' && amount && Number(amount) > 0 ? (
          <Text style={styles.pkrHint}>
            ≈ PKR {foreignToPkr(Number(amount), travelRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Text>
        ) : null}
      </LinearGradient>

      {booting ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ErrorBanner message={error} />

          {travelOn && kind !== 'transfer' ? (
            <Pressable
              style={[styles.travelBanner, { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }]}
              onPress={() => router.push('/travel-mode')}
            >
              <FontAwesome name="plane" size={14} color={colors.primaryDark} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.travelBannerTitle, { color: colors.primaryDark }]}>
                  Travel Mode · amounts in {travelCurrency}
                </Text>
                <Text style={[styles.travelBannerSub, { color: colors.textSecondary }]}>
                  {rateLine || formatRateLine(travelCurrency, travelRate)}
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={12} color={colors.primary} />
            </Pressable>
          ) : null}

          {kind === 'transfer' ? (
            <View style={styles.block}>
              <Text style={styles.sectionTitle}>Transfer between wallets</Text>
              <SelectField
                label="From wallet"
                value={accountId}
                options={walletOptions}
                onChange={setAccountId}
                placeholder="Select wallet…"
              />
              <SelectField
                label="To wallet"
                value={toAccountId}
                options={toWalletOptions}
                onChange={setToAccountId}
                placeholder="Select destination…"
              />
              <Text style={styles.hint}>
                Moves money between your wallets. Transfers don’t count as income or expense.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Select Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catRow}
              >
                {categories.map((c, i) => {
                  const active = category === c.key
                  return (
                    <Animated.View key={c.key} entering={FadeInDown.delay(i * 25).springify()}>
                      <Pressable style={styles.catItem} onPress={() => setCategory(c.key)}>
                        <View
                          style={[
                            styles.catIcon,
                            { backgroundColor: active ? c.color : `${c.color}1f`, borderColor: active ? c.color : 'transparent' },
                          ]}
                        >
                          <FontAwesome name={c.icon} size={22} color={active ? '#fff' : c.color} />
                        </View>
                        <Text
                          style={[styles.catLabel, { color: active ? colors.text : colors.textMuted }]}
                          numberOfLines={2}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  )
                })}
              </ScrollView>
            </>
          )}

          {kind !== 'transfer' ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Select Account</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catRow}
              >
                {accounts.map((a) => {
                  const active = accountId === String(a.id)
                  return (
                    <Pressable key={a.id} style={styles.catItem} onPress={() => setAccountId(String(a.id))}>
                      <View
                        style={[
                          styles.acctIcon,
                          {
                            backgroundColor: active ? colors.primary : colors.surfaceMuted,
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <FontAwesome name={accountIcon(a)} size={20} color={active ? '#fff' : colors.primary} />
                      </View>
                      <Text
                        style={[styles.catLabel, { color: active ? colors.text : colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {a.name}
                      </Text>
                    </Pressable>
                  )
                })}
                <Pressable style={styles.catItem} onPress={() => router.push('/(tabs)/wallets')}>
                  <View style={[styles.acctIcon, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                    <FontAwesome name="plus" size={20} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.catLabel, { color: colors.textMuted }]} numberOfLines={1}>
                    Add Account
                  </Text>
                </Pressable>
              </ScrollView>
            </>
          ) : null}

          <Pressable
            style={[styles.detailsToggle, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setDetailsOpen((v) => !v)}
          >
            <Text style={[styles.detailsToggleText, { color: colors.primary }]}>
              {detailsOpen ? 'Hide details' : 'Add details (date, notes)'}
            </Text>
            <FontAwesome name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={12} color={colors.primary} />
          </Pressable>

          {detailsOpen ? (
            <View style={styles.block}>
              <DateField label="Date" value={date} onChange={setDate} />

              {kind === 'expense' && online && openLedgers.length > 0 ? (
                <SelectField
                  label="Link to Household (optional)"
                  value={householdLedgerId}
                  options={householdOptions}
                  onChange={setHouseholdLedgerId}
                  placeholder="Personal only — not shared"
                />
              ) : null}

              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="sentences"
                style={[styles.notesInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              />
            </View>
          ) : null}

          {!online ? (
            <Text style={[styles.hint, { color: colors.warning }]}>
              You’re offline — this saves on device and syncs when you’re back online.
            </Text>
          ) : null}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={() => void submit()}
          disabled={loading}
          style={{ borderRadius: radii.md, overflow: 'hidden', opacity: loading ? 0.6 : 1 }}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.finishBtn}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.finishText}>
                {kind === 'income' ? 'Add Income' : kind === 'expense' ? 'Add Expense' : 'Record Transfer'}
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>

      <CalculatorSheet
        visible={calcOpen}
        initial={amount}
        onApply={(v) => setAmount(v)}
        onClose={() => setCalcOpen(false)}
      />
    </View>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      borderBottomLeftRadius: radii.xl,
      borderBottomRightRadius: radii.xl,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: '#fff', fontSize: typography.title, fontWeight: '800' },
    closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    seg: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: radii.full,
      padding: 4,
      marginTop: spacing.lg,
    },
    segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radii.full },
    segBtnActive: { backgroundColor: '#fff' },
    segText: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: typography.body },
    segTextActive: { color: colors.primaryDark, fontWeight: '800' },
    amountCard: {
      marginTop: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      shadowColor: '#0f172a',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    amountCurrency: { fontSize: typography.subtitle, fontWeight: '800' },
    amountValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    calcBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    pkrHint: {
      marginTop: spacing.sm,
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '700',
      fontSize: 13,
      textAlign: 'center',
    },
    travelBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    travelBannerTitle: { fontWeight: '800', fontSize: 13 },
    travelBannerSub: { fontWeight: '600', fontSize: 12, marginTop: 2 },
    sectionTitle: { fontSize: typography.subtitle, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
    catRow: { gap: spacing.md, paddingRight: spacing.lg, paddingBottom: spacing.xs },
    catItem: { width: 74, alignItems: 'center' },
    catIcon: {
      width: 58,
      height: 58,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      marginBottom: 6,
    },
    acctIcon: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      marginBottom: 6,
    },
    catLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
    block: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    detailsToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: radii.sm,
      paddingVertical: 12,
      marginTop: spacing.lg,
    },
    detailsToggleText: { fontWeight: '800', fontSize: typography.body },
    fieldLabel: {
      fontSize: typography.label,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },
    notesInput: {
      borderWidth: 1,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: typography.body,
      fontWeight: '600',
    },
    hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.md, lineHeight: 16 },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    finishBtn: { paddingVertical: 15, alignItems: 'center', borderRadius: radii.md },
    finishText: { color: '#fff', fontWeight: '800', fontSize: typography.subtitle, letterSpacing: 0.3 },
  })
}
