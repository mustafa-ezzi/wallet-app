import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  accountsApi,
  apiErrorMessage,
  asList,
} from '@/src/api/client'
import type { Account } from '@/src/api/types'
import { Field, PrimaryButton, ErrorBanner } from '@/src/components/ui'
import { useOffline } from '@/src/offline'
import { colors, radii, spacing, typography } from '@/src/theme/colors'
import { todayISO } from '@/src/utils/format'

const EXPENSE_CATS = ['Food', 'Groceries', 'Transport', 'Utilities', 'Rent', 'Miscellaneous']
const INCOME_CATS = ['Salary', 'Monthly Income', 'Freelance', 'Other']

type Kind = 'expense' | 'income' | 'transfer'

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
  const { online, queueTransaction, getCachedAccounts, hydrateNow } = useOffline()
  const [kind, setKind] = useState<Kind>('expense')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [toAccountId, setToAccountId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(EXPENSE_CATS[0])
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
    setCategory(EXPENSE_CATS[0])
    setBooting(true)
    ;(async () => {
      try {
        if (online) {
          try {
            const { data } = await accountsApi.list()
            const list = asList<Account>(data)
            setAccounts(list)
            setAccountId(list[0]?.id ?? null)
            setToAccountId(list[1]?.id ?? list[0]?.id ?? null)
            void hydrateNow()
            return
          } catch {
            /* fall through to cache */
          }
        }
        const cached = await getCachedAccounts()
        const list: Account[] = cached.map((a) => ({
          id: a.serverId,
          name: a.name,
          type: a.type === 'cash' ? 'cash' : 'bank',
          opening_balance: a.openingBalance,
          current_balance: a.currentBalance,
        }))
        setAccounts(list)
        setAccountId(list[0]?.id ?? null)
        setToAccountId(list[1]?.id ?? list[0]?.id ?? null)
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
    if (kind === 'income') setCategory(INCOME_CATS[0])
    if (kind === 'expense') setCategory(EXPENSE_CATS[0])
    if (kind === 'transfer') setCategory('Bank Transfer')
  }, [kind])

  const submit = async () => {
    setError('')
    const value = parseFloat(amount.replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid amount.')
      return
    }
    if (!accountId) {
      setError('Create a wallet first.')
      return
    }
    setLoading(true)
    try {
      const date = todayISO()
      if (kind === 'transfer') {
        if (!toAccountId || toAccountId === accountId) {
          setError('Pick a different destination wallet.')
          setLoading(false)
          return
        }
        const note = notes.trim() || 'Transfer'
        await queueTransaction({
          type: 'expense',
          amount: value,
          date,
          accountServerId: accountId,
          category: 'Bank Transfer',
          notes: `${note} (out)`,
        })
        await queueTransaction({
          type: 'income',
          amount: value,
          date,
          accountServerId: toAccountId,
          category: 'Bank Transfer',
          notes: `${note} (in)`,
        })
      } else {
        await queueTransaction({
          type: kind,
          amount: value,
          date,
          accountServerId: accountId,
          category,
          notes: notes.trim(),
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save transaction.'))
    } finally {
      setLoading(false)
    }
  }

  const cats = kind === 'income' ? INCOME_CATS : EXPENSE_CATS

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add money</Text>

          <View style={styles.seg}>
            {(['expense', 'income', 'transfer'] as Kind[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[styles.segBtn, kind === k && styles.segBtnOn]}
              >
                <Text style={[styles.segText, kind === k && styles.segTextOn]}>
                  {k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Transfer'}
                </Text>
              </Pressable>
            ))}
          </View>

          {booting ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <ErrorBanner message={error} />
              <Field
                label="Amount (PKR)"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0"
              />

              <Text style={styles.label}>{kind === 'transfer' ? 'From wallet' : 'Wallet'}</Text>
              <View style={styles.chips}>
                {accounts.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => setAccountId(a.id)}
                    style={[styles.chip, accountId === a.id && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, accountId === a.id && styles.chipTextOn]}>{a.name}</Text>
                  </Pressable>
                ))}
              </View>

              {kind === 'transfer' ? (
                <>
                  <Text style={styles.label}>To wallet</Text>
                  <View style={styles.chips}>
                    {accounts.map((a) => (
                      <Pressable
                        key={a.id}
                        onPress={() => setToAccountId(a.id)}
                        style={[styles.chip, toAccountId === a.id && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, toAccountId === a.id && styles.chipTextOn]}>{a.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Category</Text>
                  <View style={styles.chips}>
                    {cats.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => setCategory(c)}
                        style={[styles.chip, category === c && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, category === c && styles.chipTextOn]}>{c}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <Field
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                autoCapitalize="sentences"
              />
              <PrimaryButton title="Save" onPress={() => void submit()} loading={loading} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15, 31, 26, 0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    color: colors.primaryDark,
    marginBottom: spacing.md,
  },
  seg: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    padding: 4,
    marginBottom: spacing.lg,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segBtnOn: {
    backgroundColor: colors.surface,
  },
  segText: {
    fontWeight: '700',
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  segTextOn: {
    color: colors.primary,
  },
  label: {
    fontSize: typography.label,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  chipText: {
    fontWeight: '700',
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  chipTextOn: {
    color: colors.white,
  },
})
