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
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  accountsApi,
  apiErrorMessage,
  asList,
  expensesApi,
  payablesApi,
  receivablesApi,
  transactionsApi,
} from '@/src/api/client'
import type { Payable, Receivable, RecurringExpense } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { Screen } from '@/src/components/ui'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { isDueSoon, useReminders } from '@/src/notifications'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { colors, radii, spacing, typography } from '@/src/theme/colors'
import { mutationId, todayISO, toMoney } from '@/src/utils/format'

export default function BillsScreen() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ focus?: string; id?: string }>()
  const focusKind = params.focus
  const focusId = params.id ? Number(params.id) : null
  const { refreshKey, bumpRefresh } = useMoneyUi()
  const money = useMaskedMoney()
  const {
    reschedule,
    showPromptBanner,
    enableWithPermission,
    dismissPrompt,
    permission,
    prefs,
  } = useReminders()
  const [expenses, setExpenses] = useState<RecurringExpense[]>([])
  const [payables, setPayables] = useState<Payable[]>([])
  const [receivables, setReceivables] = useState<Receivable[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      const [e, p, r] = await Promise.all([
        expensesApi.list(),
        payablesApi.list(),
        receivablesApi.list(),
      ])
      const exp = asList<RecurringExpense>(e.data)
      const pay = asList<Payable>(p.data)
      const rec = asList<Receivable>(r.data)
      setExpenses(exp)
      setPayables(pay)
      setReceivables(rec)
      void reschedule({ payables: pay, receivables: rec, expenses: exp })
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load bills.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [reschedule])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const markExpensePaid = async (item: RecurringExpense) => {
    const key = `e-${item.id}`
    setBusyId(key)
    try {
      await transactionsApi.create({
        type: 'expense',
        amount: toMoney(item.amount),
        date: todayISO(),
        account: item.account,
        category: item.name,
        notes: `Paid ${item.name}`,
        client_mutation_id: mutationId(),
      })
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not record payment.'))
    } finally {
      setBusyId(null)
    }
  }

  const markPayablePaid = async (item: Payable) => {
    const key = `p-${item.id}`
    setBusyId(key)
    try {
      await transactionsApi.create({
        type: 'expense',
        amount: toMoney(item.monthly_amount),
        date: todayISO(),
        account: item.account,
        category: 'Loan Repayment',
        notes: `Installment: ${item.name}`,
        linked_payable: item.id,
        client_mutation_id: mutationId(),
      })
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not record installment.'))
    } finally {
      setBusyId(null)
    }
  }

  const markReceivableReceived = async (item: Receivable) => {
    const key = `r-${item.id}`
    setBusyId(key)
    try {
      const { data } = await accountsApi.list()
      const accounts = asList<{ id: number }>(data)
      const account = accounts[0]?.id
      if (!account) throw new Error('Create a wallet before recording receipts.')
      await transactionsApi.create({
        type: 'income',
        amount: toMoney(item.monthly_amount),
        date: todayISO(),
        account,
        category: 'Installment Receipt',
        notes: `Receipt: ${item.project_name || 'Receivable'}`,
        linked_receivable: item.id,
        client_mutation_id: mutationId(),
      })
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not record receipt.'))
    } finally {
      setBusyId(null)
    }
  }

  const focused = (kind: string, id: number) => focusKind === kind && focusId === id

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
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Bills</Text>
            <Text style={styles.sub}>Costs, loans, and money owed to you</Text>
          </View>
          <AmountEyeToggle />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {showPromptBanner ? (
          <View style={styles.prompt}>
            <Text style={styles.promptTitle}>Get loan due reminders</Text>
            <Text style={styles.promptBody}>
              CashTrail can notify you 3 days before, 1 day before, and on the due day (Asia/Karachi mornings).
              Amounts stay hidden in notifications when privacy lock is on.
            </Text>
            <View style={styles.promptActions}>
              <Pressable style={styles.promptPrimary} onPress={() => void enableWithPermission()}>
                <Text style={styles.promptPrimaryText}>Enable notifications</Text>
              </Pressable>
              <Pressable onPress={() => void dismissPrompt()}>
                <Text style={styles.promptSkip}>Not now</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {permission === 'denied' && prefs.enabled ? (
          <Text style={styles.denied}>
            Notifications are blocked. Due badges still show below — enable permission in system settings.
          </Text>
        ) : null}

        {loading && expenses.length + payables.length + receivables.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <Text style={styles.section}>Recurring costs</Text>
            {expenses.length === 0 ? (
              <Text style={styles.empty}>No recurring costs.</Text>
            ) : (
              expenses.map((item) => (
                <View
                  key={item.id}
                  style={[styles.card, focused('expense', item.id) && styles.cardFocus]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardMeta}>
                      {money.fmt(item.amount)} · due day {item.due_day}
                      {item.paid_this_month ? ' · paid' : ''}
                      {!item.paid_this_month && isDueSoon(item.due_day) ? ' · due soon' : ''}
                    </Text>
                  </View>
                  {!item.paid_this_month ? (
                    <Pressable
                      style={styles.action}
                      disabled={busyId === `e-${item.id}`}
                      onPress={() => void markExpensePaid(item)}
                    >
                      <Text style={styles.actionText}>
                        {busyId === `e-${item.id}` ? '…' : 'Mark paid'}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.done}>Paid</Text>
                  )}
                </View>
              ))
            )}

            <Text style={styles.section}>Loans (payables)</Text>
            {payables.length === 0 ? (
              <Text style={styles.empty}>No payables.</Text>
            ) : (
              payables.map((item) => (
                <View
                  key={item.id}
                  style={[styles.card, focused('payable', item.id) && styles.cardFocus]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      {!item.paid_this_month && item.status !== 'completed' && isDueSoon(item.due_day) ? (
                        <View style={styles.badge}><Text style={styles.badgeText}>Due soon</Text></View>
                      ) : null}
                    </View>
                    <Text style={styles.cardMeta}>
                      {money.fmt(item.monthly_amount)} / mo · {item.installments_paid}/{item.total_installments}
                      {' · '}day {item.due_day}
                    </Text>
                  </View>
                  {item.status !== 'completed' ? (
                    <Pressable
                      style={styles.action}
                      disabled={busyId === `p-${item.id}`}
                      onPress={() => void markPayablePaid(item)}
                    >
                      <Text style={styles.actionText}>
                        {busyId === `p-${item.id}` ? '…' : 'Pay'}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.done}>Done</Text>
                  )}
                </View>
              ))
            )}

            <Text style={styles.section}>Money owed to you</Text>
            {receivables.length === 0 ? (
              <Text style={styles.empty}>No receivables.</Text>
            ) : (
              receivables.map((item) => {
                const dueDay = Number(String(item.start_date).split('-')[2]) || 1
                return (
                  <View
                    key={item.id}
                    style={[styles.card, focused('receivable', item.id) && styles.cardFocus]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.titleRow}>
                        <Text style={styles.cardTitle}>{item.project_name || `Project #${item.linked_project}`}</Text>
                        {!item.received_this_month && item.status !== 'completed' && isDueSoon(dueDay) ? (
                          <View style={styles.badge}><Text style={styles.badgeText}>Due soon</Text></View>
                        ) : null}
                      </View>
                      <Text style={styles.cardMeta}>
                        {money.fmt(item.monthly_amount)} · {item.installments_received}/{item.total_installments}
                      </Text>
                    </View>
                    {item.status !== 'completed' ? (
                      <Pressable
                        style={styles.action}
                        disabled={busyId === `r-${item.id}`}
                        onPress={() => void markReceivableReceived(item)}
                      >
                        <Text style={styles.actionText}>
                          {busyId === `r-${item.id}` ? '…' : 'Receive'}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.done}>Done</Text>
                    )}
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
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  title: { fontSize: typography.title, fontWeight: '800', color: colors.text },
  sub: { color: colors.textMuted, marginTop: 2 },
  error: { color: colors.danger, marginBottom: spacing.md, fontWeight: '600' },
  denied: {
    color: colors.warning,
    fontSize: typography.caption,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  prompt: {
    backgroundColor: colors.infoBg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  promptTitle: { fontWeight: '800', color: colors.infoText, marginBottom: 4 },
  promptBody: { color: colors.textSecondary, fontSize: typography.caption, lineHeight: 18 },
  promptActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  promptPrimary: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  promptPrimaryText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  promptSkip: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  section: {
    fontSize: typography.subtitle,
    fontWeight: '800',
    color: colors.primaryDark,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  empty: { color: colors.textMuted, marginBottom: spacing.md, fontSize: typography.caption },
  card: {
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
  cardFocus: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontWeight: '800', color: colors.text },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  badge: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: colors.warning, fontSize: 10, fontWeight: '800' },
  action: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  actionText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  done: { color: colors.success, fontWeight: '800', fontSize: 12 },
})
