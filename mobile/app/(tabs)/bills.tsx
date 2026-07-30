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
import { Screen } from '@/src/components/ui'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { colors, radii, spacing, typography } from '@/src/theme/colors'
import { fmt, mutationId, todayISO, toMoney } from '@/src/utils/format'

export default function BillsScreen() {
  const insets = useSafeAreaInsets()
  const { refreshKey, bumpRefresh } = useMoneyUi()
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
      setExpenses(asList<RecurringExpense>(e.data))
      setPayables(asList<Payable>(p.data))
      setReceivables(asList<Receivable>(r.data))
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load bills.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

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
        <Text style={styles.title}>Bills</Text>
        <Text style={styles.sub}>Costs, loans, and money owed to you</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && expenses.length + payables.length + receivables.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <Text style={styles.section}>Recurring costs</Text>
            {expenses.length === 0 ? (
              <Text style={styles.empty}>No recurring costs.</Text>
            ) : (
              expenses.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardMeta}>
                      {fmt(item.amount)} · due day {item.due_day}
                      {item.paid_this_month ? ' · paid' : ''}
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
                <View key={item.id} style={styles.card}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardMeta}>
                      {fmt(item.monthly_amount)} / mo · {item.installments_paid}/{item.total_installments}
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
              receivables.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.project_name || `Project #${item.linked_project}`}</Text>
                    <Text style={styles.cardMeta}>
                      {fmt(item.monthly_amount)} · {item.installments_received}/{item.total_installments}
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
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: typography.title, fontWeight: '800', color: colors.text },
  sub: { color: colors.textMuted, marginBottom: spacing.lg, marginTop: 2 },
  error: { color: colors.danger, marginBottom: spacing.md, fontWeight: '600' },
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
  cardTitle: { fontWeight: '800', color: colors.text },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  action: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  actionText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  done: { color: colors.success, fontWeight: '800', fontSize: 12 },
})
