import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated'
import {
  accountsApi,
  apiErrorMessage,
  asList,
  householdsApi,
  transactionsApi,
} from '@/src/api/client'
import type { Account } from '@/src/api/types'
import { Field, PrimaryButton, ErrorBanner } from '@/src/components/ui'
import { DateField, SelectField } from '@/src/components/SelectFields'
import { useOffline } from '@/src/offline'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { fmtBalance, todayISO } from '@/src/utils/format'

const EXPENSE_CATS = [
  'Utilities',
  'Server Charges',
  'Rent',
  'Food',
  'Transport',
  'Salary',
  'Miscellaneous',
  'Groceries',
]
const INCOME_CATS = ['Salary', 'Monthly Income', 'Freelance', 'Other']

type Kind = 'expense' | 'income' | 'transfer'

type OpenLedger = {
  id: number
  name: string
  household: number
  household_name: string
}

function kindAccent(kind: Kind, colors: ColorTokens) {
  if (kind === 'income') return { accent: colors.primary, bg: `${colors.primary}20`, icon: 'long-arrow-up' as const }
  if (kind === 'expense') return { accent: colors.danger, bg: 'rgba(220,38,38,0.14)', icon: 'long-arrow-down' as const }
  return { accent: colors.infoText, bg: colors.infoBg, icon: 'exchange' as const }
}

export function AddMoneySheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { online, queueTransaction, getCachedAccounts, hydrateNow } = useOffline()
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
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible) return
    setError('')
    setAmount('')
    setNotes('')
    setKind('expense')
    setCategory('')
    setHouseholdLedgerId('')
    setDate(todayISO())
    setBooting(true)
    ;(async () => {
      try {
        if (online) {
          try {
            const [{ data }, ledgersRes] = await Promise.all([
              accountsApi.list(),
              householdsApi.openLedgers().catch(() => ({ data: [] })),
            ])
            const list = asList<Account>(data)
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
        if (list.length === 0) {
          setError('No wallets cached. Connect once to download your wallets.')
        }
      } catch (err) {
        setError(apiErrorMessage(err, 'Could not load wallets.'))
      } finally {
        setBooting(false)
      }
    })()
  }, [visible, online, getCachedAccounts, hydrateNow])

  useEffect(() => {
    setCategory('')
    setHouseholdLedgerId('')
  }, [kind])

  const walletOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: String(a.id),
        label: a.name,
        hint: fmtBalance(a.current_balance),
      })),
    [accounts],
  )

  const toWalletOptions = useMemo(
    () => walletOptions.filter((o) => o.value !== accountId),
    [walletOptions, accountId],
  )

  const categoryOptions = useMemo(() => {
    const cats = kind === 'income' ? INCOME_CATS : EXPENSE_CATS
    return cats.map((c) => ({ value: c, label: c }))
  }, [kind])

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

  const submit = async () => {
    setError('')
    const value = parseFloat(amount.replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid amount.')
      return
    }
    if (!date) {
      setError('Pick a date.')
      return
    }

    if (kind === 'transfer') {
      if (!accountId || !toAccountId) {
        setError('Select both wallets.')
        return
      }
      if (toAccountId === accountId) {
        setError('Pick a different destination wallet.')
        return
      }
      setLoading(true)
      try {
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
        onSaved()
        onClose()
      } catch (err) {
        setError(apiErrorMessage(err, 'Could not save transfer.'))
      } finally {
        setLoading(false)
      }
      return
    }

    if (!accountId) {
      setError('Create a wallet first.')
      return
    }

    // Household-linked expense must go online (same as web).
    if (kind === 'expense' && householdLedgerId) {
      if (!online) {
        setError('Household linking needs an internet connection.')
        return
      }
      setLoading(true)
      try {
        await transactionsApi.create({
          type: 'expense',
          amount: value,
          date,
          account: Number(accountId),
          category,
          notes: notes.trim(),
          household_ledger: Number(householdLedgerId),
        })
        void hydrateNow()
        onSaved()
        onClose()
      } catch (err) {
        setError(apiErrorMessage(err, 'Could not save expense.'))
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      await queueTransaction({
        type: kind,
        amount: value,
        date,
        accountServerId: Number(accountId),
        category,
        notes: notes.trim(),
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save transaction.'))
    } finally {
      setLoading(false)
    }
  }

  const { accent } = kindAccent(kind, colors)

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.springify().damping(16).stiffness(190).mass(0.8)}
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.primaryDark }]}>Add transaction</Text>

          <View style={[styles.seg, { backgroundColor: colors.surfaceMuted }]}>
            {(['income', 'expense', 'transfer'] as Kind[]).map((k) => {
              const active = kind === k
              const { accent: kAccent, bg: kBg, icon } = kindAccent(k, colors)
              return (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={[styles.segBtn, active && { backgroundColor: kBg }]}
                >
                  <FontAwesome name={icon} size={12} color={active ? kAccent : colors.textMuted} />
                  <Text style={[styles.segText, { color: colors.textMuted }, active && { color: kAccent, fontWeight: '800' }]}>
                    {k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Transfer'}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {booting ? (
            <ActivityIndicator color={accent} style={{ marginVertical: spacing.xl }} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <ErrorBanner message={error} />
              {!online ? (
                <View style={[styles.offlineNote, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
                  <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '600' }}>
                    You’re offline — this will save on this device and sync when you’re back online.
                  </Text>
                </View>
              ) : null}

              {kind === 'transfer' ? (
                <View style={[styles.infoNote, { backgroundColor: colors.infoBg }]}>
                  <Text style={{ color: colors.infoText, fontSize: 12, fontWeight: '600' }}>
                    Moves money between your wallets. Transfers do not count as income or expense.
                  </Text>
                </View>
              ) : null}

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Amount (PKR)"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <DateField label="Date" value={date} onChange={setDate} />
                </View>
              </View>

              <SelectField
                label={kind === 'transfer' ? 'From wallet' : 'Link to bank'}
                value={accountId}
                options={walletOptions}
                onChange={setAccountId}
                placeholder="Select wallet…"
              />

              {kind === 'transfer' ? (
                <>
                  <View style={styles.transferArrowRow}>
                    <FontAwesome name="long-arrow-down" size={14} color={colors.infoText} />
                  </View>
                  <SelectField
                    label="To wallet"
                    value={toAccountId}
                    options={toWalletOptions}
                    onChange={setToAccountId}
                    placeholder="Select destination…"
                  />
                </>
              ) : (
                <>
                  {kind === 'expense' || kind === 'income' ? (
                    <SelectField
                      label="Category"
                      value={category}
                      options={categoryOptions}
                      onChange={setCategory}
                      placeholder="Select category…"
                    />
                  ) : null}

                  {kind === 'expense' && online && openLedgers.length > 0 ? (
                    <>
                      <SelectField
                        label="Link to Household (optional)"
                        value={householdLedgerId}
                        options={householdOptions}
                        onChange={setHouseholdLedgerId}
                        placeholder="Personal only — not shared"
                      />
                      <Text style={[styles.hint, { color: colors.textMuted }]}>
                        Your wallet balance still drops. Household only shares the expense line with members.
                      </Text>
                    </>
                  ) : null}
                </>
              )}

              <Field
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                autoCapitalize="sentences"
              />
              <PrimaryButton
                title={kind === 'income' ? 'Add Income' : kind === 'expense' ? 'Add Expense' : 'Record Transfer'}
                onPress={() => void submit()}
                loading={loading}
                color={accent}
              />
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  seg: {
    flexDirection: 'row',
    borderRadius: radii.sm,
    padding: 4,
    marginBottom: spacing.lg,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  segText: {
    fontWeight: '700',
    fontSize: typography.caption,
  },
  row2: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  transferArrowRow: { alignItems: 'center', marginBottom: spacing.sm, marginTop: -spacing.xs },
  offlineNote: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoNote: {
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  hint: {
    fontSize: 12,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
})
