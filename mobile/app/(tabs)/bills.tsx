import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  projectsApi,
  receivablesApi,
  transactionsApi,
} from '@/src/api/client'
import type { Account, Payable, Project, Receivable, RecurringExpense } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { BouncyPressable, Reveal } from '@/src/components/motion'
import { SelectField } from '@/src/components/SelectFields'
import { ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useReminders } from '@/src/notifications'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography } from '@/src/theme/colors'
import { mutationId, sumMoney, todayISO, toMoney } from '@/src/utils/format'

type TabId = 'expenses' | 'payables' | 'receivables'
type RecordKind = 'expense' | 'payable' | 'receivable' | 'project'

function nextDueLabel(dueDay: number): string {
  if (!dueDay || dueDay < 1) return '—'
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay)
  const target = thisMonth > today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  return target.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })
}

function daysUntilDue(dueDay: number): number {
  if (!dueDay || dueDay < 1) return 999
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay)
  const target = thisMonth > today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/** Small colored status/type pill used across payable & receivable cards. */
function StatusPill({ label, tone }: { label: string; tone: 'info' | 'danger' | 'success' | 'neutral' }) {
  const colors = useColors()
  const bg =
    tone === 'danger' ? 'rgba(220,38,38,0.12)' : tone === 'success' ? 'rgba(22,163,74,0.14)' : tone === 'info' ? colors.infoBg : colors.surfaceMuted
  const fg = tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : tone === 'info' ? colors.infoText : colors.textSecondary
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export default function BillsScreen() {
  const insets = useSafeAreaInsets()
  const colors = useColors()
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

  const [tab, setTab] = useState<TabId>('expenses')
  const [expenses, setExpenses] = useState<RecurringExpense[]>([])
  const [payables, setPayables] = useState<Payable[]>([])
  const [receivables, setReceivables] = useState<Receivable[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [expenseOpen, setExpenseOpen] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null)
  const [payableOpen, setPayableOpen] = useState(false)
  const [editingPayableId, setEditingPayableId] = useState<number | null>(null)
  const [receivableOpen, setReceivableOpen] = useState(false)
  const [editingReceivableId, setEditingReceivableId] = useState<number | null>(null)
  const [expForm, setExpForm] = useState({
    name: '',
    amount: '',
    frequency: 'monthly' as 'monthly' | 'one_time',
    due_day: '1',
    account: '',
  })
  const [payForm, setPayForm] = useState({
    name: '',
    total_amount: '',
    monthly_amount: '',
    total_installments: '10',
    due_day: '1',
    account: '',
  })
  const [recForm, setRecForm] = useState({
    linked_project: '',
    total_amount: '',
    monthly_amount: '',
    total_installments: '6',
    start_date: todayISO(),
  })
  const [saving, setSaving] = useState(false)

  const [recordModal, setRecordModal] = useState<{ kind: RecordKind; id: number; name: string } | null>(null)
  const [recordAmount, setRecordAmount] = useState('')
  const [recordAccount, setRecordAccount] = useState('')

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      const [e, p, r, pr, a] = await Promise.all([
        expensesApi.list(),
        payablesApi.list(),
        receivablesApi.list(),
        projectsApi.list(),
        accountsApi.list(),
      ])
      const exp = asList<RecurringExpense>(e.data)
      const pay = asList<Payable>(p.data)
      const rec = asList<Receivable>(r.data)
      setExpenses(exp)
      setPayables(pay)
      setReceivables(rec)
      setProjects(asList<Project>(pr.data))
      setAccounts(asList<Account>(a.data))
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

  useEffect(() => {
    if (focusKind === 'payable') setTab('payables')
    if (focusKind === 'receivable') setTab('receivables')
    if (focusKind === 'expense') setTab('expenses')
  }, [focusKind])

  const oneTimeProjects = useMemo(() => projects.filter((p) => p.income_type === 'one_time'), [projects])

  const monthExpenses = sumMoney(
    expenses.filter((e) => e.active && e.frequency === 'monthly'),
    (e) => e.amount,
  )
  const monthPayables = sumMoney(
    payables.filter((p) => p.status === 'ongoing'),
    (p) => p.monthly_amount,
  )
  // Still owed to me = remaining balance on every non-completed one-time
  // payment PLUS remaining balance on every non-completed installment plan —
  // a running total, not a monthly figure (mirrors the web app's Bills page).
  const owedToMe =
    sumMoney(receivables.filter((r) => r.status !== 'completed'), (r) => r.remaining_amount) +
    sumMoney(oneTimeProjects.filter((p) => p.status !== 'completed'), (p) => p.remaining_amount ?? p.amount)

  const openRecord = (kind: RecordKind, id: number, name: string, amount: number | string, account?: number | null) => {
    setRecordModal({ kind, id, name })
    setRecordAmount(String(toMoney(amount) || ''))
    setRecordAccount(account ? String(account) : accounts[0] ? String(accounts[0].id) : '')
    setError('')
  }

  const submitRecord = async () => {
    if (!recordModal) return
    const amt = toMoney(recordAmount)
    const acct = Number(recordAccount)
    if (amt <= 0 || !acct) {
      setError('Pick a wallet and amount.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const base = { amount: amt, date: todayISO(), account: acct, client_mutation_id: mutationId() }
      const payload =
        recordModal.kind === 'expense'
          ? {
              ...base,
              type: 'expense' as const,
              category: recordModal.name,
              notes: `Recurring expense payment: ${recordModal.name}`,
            }
          : recordModal.kind === 'payable'
            ? {
                ...base,
                type: 'expense' as const,
                linked_payable: recordModal.id,
                category: 'Loan Repayment',
                notes: `Installment: ${recordModal.name}`,
              }
            : recordModal.kind === 'receivable'
              ? {
                  ...base,
                  type: 'income' as const,
                  linked_receivable: recordModal.id,
                  category: 'Installment Receipt',
                  notes: `Receipt: ${recordModal.name}`,
                }
              : {
                  ...base,
                  type: 'income' as const,
                  linked_project: recordModal.id,
                  category: 'One-time Income',
                  notes: `One-time payment: ${recordModal.name}`,
                }
      await transactionsApi.create(payload)
      setRecordModal(null)
      setRecordAmount('')
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not record payment.'))
    } finally {
      setSaving(false)
    }
  }

  const openAddExpense = () => {
    setEditingExpenseId(null)
    setExpForm({ name: '', amount: '', frequency: 'monthly', due_day: '1', account: '' })
    setError('')
    setExpenseOpen(true)
  }

  const openEditExpense = (item: RecurringExpense) => {
    setEditingExpenseId(item.id)
    setExpForm({
      name: item.name,
      amount: String(item.amount),
      frequency: item.frequency === 'one_time' ? 'one_time' : 'monthly',
      due_day: String(item.due_day ?? 1),
      account: String(item.account),
    })
    setError('')
    setExpenseOpen(true)
  }

  const saveExpense = async () => {
    if (!expForm.name.trim() || toMoney(expForm.amount) <= 0) {
      setError('Name and amount required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: expForm.name.trim(),
        amount: toMoney(expForm.amount),
        frequency: expForm.frequency,
        due_day: Number(expForm.due_day) || 1,
        account: expForm.account ? Number(expForm.account) : accounts[0]?.id,
      }
      if (editingExpenseId) {
        await expensesApi.update(editingExpenseId, payload)
      } else {
        await expensesApi.create({ ...payload, active: true })
      }
      setExpenseOpen(false)
      setEditingExpenseId(null)
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, editingExpenseId ? 'Could not update cost.' : 'Could not add expense.'))
    } finally {
      setSaving(false)
    }
  }

  const toggleExpenseActive = (item: RecurringExpense) => {
    const turningOff = item.active
    Alert.alert(
      turningOff ? 'Deactivate cost?' : 'Activate cost?',
      turningOff
        ? `Stop including "${item.name}" in monthly forecasts?`
        : `Include "${item.name}" in monthly forecasts again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: turningOff ? 'Deactivate' : 'Activate',
          onPress: () => {
            void (async () => {
              setBusyId(`e-${item.id}`)
              try {
                await expensesApi.update(item.id, { active: !item.active })
                bumpRefresh()
                await load(true)
              } catch (err) {
                setError(apiErrorMessage(err, 'Could not update cost.'))
              } finally {
                setBusyId(null)
              }
            })()
          },
        },
      ],
    )
  }

  const deleteExpense = (item: RecurringExpense) => {
    Alert.alert('Delete cost?', `Delete "${item.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(`e-${item.id}`)
            try {
              await expensesApi.remove(item.id)
              bumpRefresh()
              await load(true)
            } catch (err) {
              setError(apiErrorMessage(err, 'Could not delete cost.'))
            } finally {
              setBusyId(null)
            }
          })()
        },
      },
    ])
  }

  const openAddPayable = () => {
    setEditingPayableId(null)
    setPayForm({ name: '', total_amount: '', monthly_amount: '', total_installments: '10', due_day: '1', account: '' })
    setError('')
    setPayableOpen(true)
  }

  const openEditPayable = (item: Payable) => {
    setEditingPayableId(item.id)
    setPayForm({
      name: item.name,
      total_amount: String(item.total_amount),
      monthly_amount: String(item.monthly_amount),
      total_installments: String(item.total_installments),
      due_day: String(item.due_day),
      account: String(item.account),
    })
    setError('')
    setPayableOpen(true)
  }

  const savePayable = async () => {
    if (!payForm.name.trim() || toMoney(payForm.monthly_amount) <= 0) {
      setError('Name and monthly amount required.')
      return
    }
    setSaving(true)
    try {
      const monthly = toMoney(payForm.monthly_amount)
      const totalInst = Number(payForm.total_installments) || 1
      const total = toMoney(payForm.total_amount) || monthly * totalInst
      const payload = {
        name: payForm.name.trim(),
        total_amount: total,
        monthly_amount: monthly,
        total_installments: totalInst,
        due_day: Number(payForm.due_day) || 1,
        account: payForm.account ? Number(payForm.account) : accounts[0]?.id,
      }
      if (editingPayableId) {
        await payablesApi.update(editingPayableId, payload)
      } else {
        await payablesApi.create({ ...payload, status: 'ongoing' })
      }
      setPayableOpen(false)
      setEditingPayableId(null)
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, editingPayableId ? 'Could not update loan.' : 'Could not add loan.'))
    } finally {
      setSaving(false)
    }
  }

  const setPayableStatus = async (item: Payable, status: string) => {
    setBusyId(`p-${item.id}`)
    try {
      await payablesApi.update(item.id, { status })
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update status.'))
    } finally {
      setBusyId(null)
    }
  }

  const markPayableStuck = (item: Payable) => {
    const next = item.status === 'stuck' ? 'ongoing' : 'stuck'
    Alert.alert(
      next === 'stuck' ? 'Mark as stuck?' : 'Resume loan?',
      next === 'stuck'
        ? `"${item.name}" will stop counting in your monthly forecasts until resumed.`
        : `"${item.name}" will count in your monthly forecasts again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => void setPayableStatus(item, next) },
      ],
    )
  }

  const markPayableComplete = (item: Payable) => {
    Alert.alert('Mark as completed?', `Mark "${item.name}" as fully paid?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark completed', onPress: () => void setPayableStatus(item, 'completed') },
    ])
  }

  const deletePayable = (item: Payable) => {
    Alert.alert('Delete loan?', `Delete "${item.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(`p-${item.id}`)
            try {
              await payablesApi.remove(item.id)
              bumpRefresh()
              await load(true)
            } catch (err) {
              setError(apiErrorMessage(err, 'Could not delete loan.'))
            } finally {
              setBusyId(null)
            }
          })()
        },
      },
    ])
  }

  const openAddReceivable = () => {
    setEditingReceivableId(null)
    setRecForm({ linked_project: '', total_amount: '', monthly_amount: '', total_installments: '6', start_date: todayISO() })
    setError('')
    setReceivableOpen(true)
  }

  const openEditReceivable = (item: Receivable) => {
    setEditingReceivableId(item.id)
    setRecForm({
      linked_project: String(item.linked_project),
      total_amount: String(item.total_amount),
      monthly_amount: String(item.monthly_amount),
      total_installments: String(item.total_installments),
      start_date: item.start_date,
    })
    setError('')
    setReceivableOpen(true)
  }

  const saveReceivable = async () => {
    if (!recForm.linked_project || toMoney(recForm.monthly_amount) <= 0) {
      setError('Pick a project and monthly amount.')
      return
    }
    setSaving(true)
    try {
      const monthly = toMoney(recForm.monthly_amount)
      const totalInst = Number(recForm.total_installments) || 1
      const total = toMoney(recForm.total_amount) || monthly * totalInst
      const payload = {
        linked_project: Number(recForm.linked_project),
        total_amount: total,
        monthly_amount: monthly,
        total_installments: totalInst,
        start_date: recForm.start_date || todayISO(),
      }
      if (editingReceivableId) {
        await receivablesApi.update(editingReceivableId, payload)
      } else {
        await receivablesApi.create({ ...payload, status: 'ongoing' })
      }
      setReceivableOpen(false)
      setEditingReceivableId(null)
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save installment plan.'))
    } finally {
      setSaving(false)
    }
  }

  const setReceivableStatus = async (item: Receivable, status: string) => {
    setBusyId(`r-${item.id}`)
    try {
      await receivablesApi.update(item.id, { status })
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update status.'))
    } finally {
      setBusyId(null)
    }
  }

  const markReceivableStuck = (item: Receivable) => {
    const next = item.status === 'stuck' ? 'ongoing' : 'stuck'
    const label = item.project_name || 'this plan'
    Alert.alert(
      next === 'stuck' ? 'Mark as stuck?' : 'Resume?',
      next === 'stuck' ? `Mark "${label}" as stuck (payment delayed)?` : `Mark "${label}" as ongoing again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => void setReceivableStatus(item, next) },
      ],
    )
  }

  const deleteReceivable = (item: Receivable) => {
    const label = item.project_name || 'this plan'
    Alert.alert('Delete receivable?', `Delete "${label}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(`r-${item.id}`)
            try {
              await receivablesApi.remove(item.id)
              bumpRefresh()
              await load(true)
            } catch (err) {
              setError(apiErrorMessage(err, 'Could not delete receivable.'))
            } finally {
              setBusyId(null)
            }
          })()
        },
      },
    ])
  }

  const markProjectStuck = (item: Project) => {
    const next = item.status === 'stuck' ? 'active' : 'stuck'
    Alert.alert(
      next === 'stuck' ? 'Mark as stuck?' : 'Resume?',
      next === 'stuck'
        ? `"${item.name}" will stop counting in income forecasts until resumed.`
        : `"${item.name}" will count in income forecasts again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            void (async () => {
              setBusyId(`op-${item.id}`)
              try {
                await projectsApi.update(item.id, { status: next })
                bumpRefresh()
                await load(true)
              } catch (err) {
                setError(apiErrorMessage(err, 'Could not update status.'))
              } finally {
                setBusyId(null)
              }
            })()
          },
        },
      ],
    )
  }

  const deleteProject = (item: Project) => {
    Alert.alert('Delete one-time payment?', `Delete "${item.name}"? Past transactions stay in your wallets.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(`op-${item.id}`)
            try {
              await projectsApi.remove(item.id)
              bumpRefresh()
              await load(true)
            } catch (err) {
              setError(apiErrorMessage(err, 'Could not delete income source.'))
            } finally {
              setBusyId(null)
            }
          })()
        },
      },
    ])
  }

  const focused = (kind: string, id: number) => focusKind === kind && focusId === id
  const tabs = useMemo(
    () =>
      [
        { id: 'expenses' as const, label: 'Monthly costs' },
        { id: 'payables' as const, label: 'Money you owe' },
        { id: 'receivables' as const, label: 'Owed to you' },
      ],
    [],
  )

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 130 }}
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
            <Text style={[styles.title, { color: colors.text }]}>Bills</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Costs, loans, and money owed to you</Text>
          </View>
          <AmountEyeToggle />
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {showPromptBanner ? (
          <View style={[styles.prompt, { backgroundColor: colors.infoBg, borderColor: '#bfdbfe' }]}>
            <Text style={[styles.promptTitle, { color: colors.infoText }]}>Get loan due reminders</Text>
            <Text style={[styles.promptBody, { color: colors.textSecondary }]}>
              Notify 3 days before, 1 day before, and on the due day (Asia/Karachi mornings).
            </Text>
            <View style={styles.promptActions}>
              <Pressable
                style={[styles.promptPrimary, { backgroundColor: colors.primary }]}
                onPress={() => void enableWithPermission()}
              >
                <Text style={styles.promptPrimaryText}>Enable</Text>
              </Pressable>
              <Pressable onPress={() => void dismissPrompt()}>
                <Text style={[styles.promptSkip, { color: colors.textMuted }]}>Not now</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {permission === 'denied' && prefs.enabled ? (
          <Text style={{ color: colors.warning, marginBottom: spacing.md, fontSize: 12 }}>
            Notifications blocked — due badges still show below.
          </Text>
        ) : null}

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.summaryLab, { color: colors.textMuted }]}>Monthly costs</Text>
            <Text style={[styles.summaryVal, money.amountStyle, { color: colors.danger }]}>
              {money.fmt(monthExpenses)}
            </Text>
            <Text style={[styles.summarySub, { color: colors.textMuted }]}>fixed / month</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.summaryLab, { color: colors.textMuted }]}>You owe</Text>
            <Text style={[styles.summaryVal, money.amountStyle, { color: colors.warning }]}>
              {money.fmt(monthPayables)}
            </Text>
            <Text style={[styles.summarySub, { color: colors.textMuted }]}>due / month</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.summaryLab, { color: colors.textMuted }]}>Owed to you</Text>
            <Text style={[styles.summaryVal, money.amountStyle, { color: colors.success }]}>
              {money.fmt(owedToMe)}
            </Text>
            <Text style={[styles.summarySub, { color: colors.textMuted }]}>one-time + installments</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {tabs.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[
                styles.tabChip,
                { borderColor: colors.border, backgroundColor: colors.surface },
                tab === t.id && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.tabChipText,
                  { color: colors.textSecondary },
                  tab === t.id && { color: '#fff' },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading && expenses.length + payables.length + receivables.length + oneTimeProjects.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {tab === 'expenses' ? (
              <>
                <BouncyPressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAddExpense}>
                  <Text style={styles.addBtnText}>+ Add monthly cost</Text>
                </BouncyPressable>
                {expenses.length === 0 ? (
                  <Text style={{ color: colors.textMuted }}>No recurring costs.</Text>
                ) : (
                  expenses.map((item, i) => {
                    const days = item.due_day ? daysUntilDue(item.due_day) : 999
                    const isBusy = busyId === `e-${item.id}`
                    return (
                      <Reveal index={i} key={item.id}>
                        <View
                          style={[
                            styles.richCard,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                            focused('expense', item.id) && { borderColor: colors.primary, borderWidth: 2 },
                            !item.active && { opacity: 0.6 },
                          ]}
                        >
                          <View style={styles.richTopRow}>
                            <View style={{ flex: 1 }}>
                              <View style={styles.badgeRow}>
                                <Text style={[styles.richTitle, { color: colors.text }]}>{item.name}</Text>
                                <StatusPill label={item.active ? 'active' : 'inactive'} tone={item.active ? 'success' : 'neutral'} />
                                <StatusPill label={item.frequency} tone="info" />
                              </View>
                              <Text style={[styles.richMeta, { color: colors.textMuted }]}>
                                {item.due_day ? `Due day ${item.due_day}` : ''}
                                {item.account_name ? `${item.due_day ? '  ·  ' : ''}via ${item.account_name}` : ''}
                              </Text>
                              {item.active && item.due_day ? (
                                <View style={styles.dueBadgeWrap}>
                                  <StatusPill
                                    label={`Next due: ${nextDueLabel(item.due_day)}${days <= 7 ? ` (${days}d)` : ''}`}
                                    tone={days <= 3 ? 'danger' : days <= 7 ? 'info' : 'neutral'}
                                  />
                                </View>
                              ) : null}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[styles.richAmt, money.amountStyle, { color: colors.danger }]}>
                                {money.fmt(item.amount)}
                              </Text>
                              <Text style={[styles.remainingLabel, { color: colors.textMuted }]}>
                                {item.frequency === 'monthly' ? '/ month' : 'one-time'}
                              </Text>
                            </View>
                          </View>

                          <View style={[styles.divider, { backgroundColor: colors.border }]} />
                          <View style={styles.actionsRow}>
                            {item.active ? (
                              item.paid_this_month ? (
                                <View style={[styles.actionBtnMuted, { borderColor: colors.border }]}>
                                  <Text style={[styles.actionBtnMutedText, { color: colors.success }]}>
                                    ✓ Paid this month
                                  </Text>
                                </View>
                              ) : (
                                <BouncyPressable
                                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                                  onPress={() => openRecord('expense', item.id, item.name, item.amount, item.account)}
                                >
                                  <Text style={styles.actionBtnText}>Record Payment</Text>
                                </BouncyPressable>
                              )
                            ) : null}
                            <BouncyPressable
                              style={[styles.actionBtnOutline, { borderColor: colors.border }]}
                              onPress={() => openEditExpense(item)}
                            >
                              <Text style={[styles.actionOutlineText, { color: colors.textSecondary }]}>Edit</Text>
                            </BouncyPressable>
                            <BouncyPressable
                              disabled={isBusy}
                              style={[
                                styles.actionBtnOutline,
                                { borderColor: item.active ? 'rgba(217,119,6,0.3)' : 'rgba(22,163,74,0.3)' },
                              ]}
                              onPress={() => toggleExpenseActive(item)}
                            >
                              <Text style={[styles.actionOutlineText, { color: item.active ? colors.warning : colors.success }]}>
                                {item.active ? 'Deactivate' : 'Activate'}
                              </Text>
                            </BouncyPressable>
                            <BouncyPressable
                              disabled={isBusy}
                              style={[styles.actionBtnOutline, { borderColor: 'rgba(220,38,38,0.25)' }]}
                              onPress={() => deleteExpense(item)}
                            >
                              <Text style={[styles.actionOutlineText, { color: colors.danger }]}>Delete</Text>
                            </BouncyPressable>
                          </View>
                        </View>
                      </Reveal>
                    )
                  })
                )}
              </>
            ) : null}

            {tab === 'payables' ? (
              <>
                <BouncyPressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAddPayable}>
                  <Text style={styles.addBtnText}>+ Add loan / payable</Text>
                </BouncyPressable>
                {payables.length === 0 ? (
                  <Text style={{ color: colors.textMuted }}>No payables.</Text>
                ) : (
                  payables.map((item, i) => {
                    const prog = item.total_installments > 0 ? (item.installments_paid / item.total_installments) * 100 : 0
                    const days = daysUntilDue(item.due_day)
                    const isStuck = item.status === 'stuck'
                    const isDone = item.status === 'completed'
                    const isBusy = busyId === `p-${item.id}`
                    return (
                      <Reveal index={i} key={item.id}>
                        <View
                          style={[
                            styles.richCard,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                            focused('payable', item.id) && { borderColor: colors.primary, borderWidth: 2 },
                            isDone && { opacity: 0.6 },
                          ]}
                        >
                          <View style={styles.richTopRow}>
                            <View style={{ flex: 1 }}>
                              <View style={styles.badgeRow}>
                                <Text style={[styles.richTitle, { color: colors.text }]}>{item.name}</Text>
                                <StatusPill label={item.status} tone={isDone ? 'success' : isStuck ? 'danger' : 'info'} />
                              </View>
                              <Text style={[styles.richMeta, money.amountStyle, { color: colors.textMuted }]}>
                                {item.installments_paid} of {item.total_installments} paid ·{' '}
                                {money.fmt(item.installments_paid * toMoney(item.monthly_amount))} paid so far
                              </Text>
                              {isStuck ? (
                                <Text style={[styles.stuckWarning, { color: colors.danger }]}>
                                  ⚠ Stuck — not counted in forecasts
                                </Text>
                              ) : null}
                              {item.status === 'ongoing' ? (
                                <View style={styles.dueBadgeWrap}>
                                  <StatusPill
                                    label={`Next due: ${nextDueLabel(item.due_day)}${days <= 7 ? ` (${days}d)` : ''}`}
                                    tone={days <= 3 ? 'danger' : days <= 7 ? 'info' : 'neutral'}
                                  />
                                </View>
                              ) : null}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[styles.richAmt, money.amountStyle, { color: colors.danger }]}>
                                {money.fmt(item.monthly_amount)}
                                <Text style={styles.perMo}>/mo</Text>
                              </Text>
                              <Text style={[styles.remainingLabel, { color: colors.textMuted }]}>
                                Remaining: {money.fmt(item.remaining_amount)}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.progressBlock}>
                            <View style={styles.progressRow}>
                              <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
                                {Math.round(prog)}% complete · Total: {money.fmt(item.total_amount)}
                              </Text>
                              <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
                                {item.total_installments - item.installments_paid} left
                              </Text>
                            </View>
                            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
                              <View
                                style={[
                                  styles.progressFill,
                                  { width: `${Math.min(100, prog)}%`, backgroundColor: isStuck ? colors.danger : colors.success },
                                ]}
                              />
                            </View>
                          </View>

                          <View style={[styles.divider, { backgroundColor: colors.border }]} />
                          <View style={styles.actionsRow}>
                            {item.status === 'ongoing' ? (
                              item.paid_this_month ? (
                                <View style={[styles.actionBtnMuted, { borderColor: colors.border }]}>
                                  <Text style={[styles.actionBtnMutedText, { color: colors.success }]}>
                                    ✓ Paid this month
                                  </Text>
                                </View>
                              ) : (
                                <BouncyPressable
                                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                                  onPress={() => openRecord('payable', item.id, item.name, item.monthly_amount, item.account)}
                                >
                                  <Text style={styles.actionBtnText}>Record Payment</Text>
                                </BouncyPressable>
                              )
                            ) : null}
                            <BouncyPressable
                              style={[styles.actionBtnOutline, { borderColor: colors.border }]}
                              onPress={() => openEditPayable(item)}
                            >
                              <Text style={[styles.actionOutlineText, { color: colors.textSecondary }]}>Edit</Text>
                            </BouncyPressable>
                            {!isDone ? (
                              <BouncyPressable
                                disabled={isBusy}
                                style={[
                                  styles.actionBtnOutline,
                                  { borderColor: isStuck ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.25)' },
                                ]}
                                onPress={() => markPayableStuck(item)}
                              >
                                <Text style={[styles.actionOutlineText, { color: isStuck ? colors.success : colors.danger }]}>
                                  {isStuck ? 'Resume' : 'Mark Stuck'}
                                </Text>
                              </BouncyPressable>
                            ) : null}
                            <BouncyPressable
                              disabled={isBusy}
                              style={[styles.actionBtnOutline, { borderColor: 'rgba(220,38,38,0.25)' }]}
                              onPress={() => deletePayable(item)}
                            >
                              <Text style={[styles.actionOutlineText, { color: colors.danger }]}>Delete</Text>
                            </BouncyPressable>
                            {item.status === 'ongoing' ? (
                              <BouncyPressable
                                disabled={isBusy}
                                style={[styles.actionBtnOutline, { borderColor: 'rgba(22,163,74,0.3)' }]}
                                onPress={() => markPayableComplete(item)}
                              >
                                <Text style={[styles.actionOutlineText, { color: colors.success }]}>Mark Complete</Text>
                              </BouncyPressable>
                            ) : null}
                          </View>
                        </View>
                      </Reveal>
                    )
                  })
                )}
              </>
            ) : null}

            {tab === 'receivables' ? (
              <>
                <BouncyPressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAddReceivable}>
                  <Text style={styles.addBtnText}>+ Add installment</Text>
                </BouncyPressable>
                {oneTimeProjects.length === 0 && receivables.length === 0 ? (
                  <Text style={{ color: colors.textMuted }}>Nothing owed to you yet.</Text>
                ) : (
                  <>
                    {oneTimeProjects.map((p, i) => {
                      const rem = toMoney(p.remaining_amount ?? p.amount)
                      const advance = toMoney(p.advance_amount ?? 0)
                      const done = p.status === 'completed' || rem <= 0.01
                      const stuck = p.status === 'stuck'
                      const isBusy = busyId === `op-${p.id}`
                      return (
                        <Reveal index={i} key={`ot-${p.id}`}>
                          <View
                            style={[
                              styles.richCard,
                              { backgroundColor: colors.surface, borderColor: colors.border },
                              done && { opacity: 0.6 },
                            ]}
                          >
                            <View style={styles.richTopRow}>
                              <View style={{ flex: 1 }}>
                                <View style={styles.badgeRow}>
                                  <Text style={[styles.richTitle, { color: colors.text }]}>{p.name}</Text>
                                  <StatusPill label={done ? 'completed' : p.status} tone={done ? 'success' : stuck ? 'danger' : 'info'} />
                                  <StatusPill label="One-time payment" tone="neutral" />
                                </View>
                                <Text style={[styles.richMeta, money.amountStyle, { color: colors.textMuted }]}>
                                  Total {money.fmt(p.amount)}
                                  {advance > 0 ? ` · advance ${money.fmt(advance)}` : ''}
                                </Text>
                                {stuck && !done ? (
                                  <Text style={[styles.stuckWarning, { color: colors.danger }]}>
                                    Stuck — not counted in income forecasts
                                  </Text>
                                ) : null}
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.richAmt, money.amountStyle, { color: colors.success }]}>
                                  {money.fmt(rem)}
                                </Text>
                                <Text style={[styles.remainingLabel, { color: colors.textMuted }]}>remaining</Text>
                              </View>
                            </View>

                            <View style={[styles.divider, { backgroundColor: colors.border }]} />
                            <View style={styles.actionsRow}>
                              {!done ? (
                                <BouncyPressable
                                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                                  onPress={() => openRecord('project', p.id, p.name, rem, p.default_account)}
                                >
                                  <Text style={styles.actionBtnText}>Record Receipt</Text>
                                </BouncyPressable>
                              ) : (
                                <View style={[styles.actionBtnMuted, { borderColor: colors.border }]}>
                                  <Text style={[styles.actionBtnMutedText, { color: colors.success }]}>✓ Fully received</Text>
                                </View>
                              )}
                              {!done ? (
                                <BouncyPressable
                                  disabled={isBusy}
                                  style={[
                                    styles.actionBtnOutline,
                                    { borderColor: stuck ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.25)' },
                                  ]}
                                  onPress={() => markProjectStuck(p)}
                                >
                                  <Text style={[styles.actionOutlineText, { color: stuck ? colors.success : colors.danger }]}>
                                    {stuck ? 'Resume' : 'Mark Stuck'}
                                  </Text>
                                </BouncyPressable>
                              ) : null}
                              <BouncyPressable
                                disabled={isBusy}
                                style={[styles.actionBtnOutline, { borderColor: 'rgba(220,38,38,0.25)' }]}
                                onPress={() => deleteProject(p)}
                              >
                                <Text style={[styles.actionOutlineText, { color: colors.danger }]}>Delete</Text>
                              </BouncyPressable>
                            </View>
                          </View>
                        </Reveal>
                      )
                    })}

                    {receivables.map((item, i) => {
                      const prog = item.total_installments > 0 ? (item.installments_received / item.total_installments) * 100 : 0
                      const stuck = item.status === 'stuck'
                      const done = item.status === 'completed'
                      const isBusy = busyId === `r-${item.id}`
                      return (
                        <Reveal index={oneTimeProjects.length + i} key={item.id}>
                          <View
                            style={[
                              styles.richCard,
                              { backgroundColor: colors.surface, borderColor: colors.border },
                              focused('receivable', item.id) && { borderColor: colors.primary, borderWidth: 2 },
                              done && { opacity: 0.6 },
                            ]}
                          >
                            <View style={styles.richTopRow}>
                              <View style={{ flex: 1 }}>
                                <View style={styles.badgeRow}>
                                  <Text style={[styles.richTitle, { color: colors.text }]}>
                                    {item.project_name || `Project #${item.linked_project}`}
                                  </Text>
                                  <StatusPill label={item.status} tone={done ? 'success' : stuck ? 'danger' : 'info'} />
                                  <StatusPill label="Installments" tone="neutral" />
                                </View>
                                <Text style={[styles.richMeta, money.amountStyle, { color: colors.textMuted }]}>
                                  {item.installments_received} of {item.total_installments} received ·{' '}
                                  {money.fmt(item.installments_received * toMoney(item.monthly_amount))} received so far
                                </Text>
                                {stuck ? (
                                  <Text style={[styles.stuckWarning, { color: colors.danger }]}>
                                    ⚠ Stuck — not counted in income forecasts
                                  </Text>
                                ) : null}
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.richAmt, money.amountStyle, { color: colors.success }]}>
                                  {money.fmt(item.monthly_amount)}
                                  <Text style={styles.perMo}>/installment</Text>
                                </Text>
                                <Text style={[styles.remainingLabel, { color: colors.textMuted }]}>
                                  Remaining: {money.fmt(item.remaining_amount)}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.progressBlock}>
                              <View style={styles.progressRow}>
                                <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
                                  {Math.round(prog)}% received · Total: {money.fmt(item.total_amount)}
                                </Text>
                                <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
                                  {item.total_installments - item.installments_received} remaining
                                </Text>
                              </View>
                              <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
                                <View
                                  style={[
                                    styles.progressFill,
                                    { width: `${Math.min(100, prog)}%`, backgroundColor: stuck ? colors.danger : colors.success },
                                  ]}
                                />
                              </View>
                            </View>

                            <View style={[styles.divider, { backgroundColor: colors.border }]} />
                            <View style={styles.actionsRow}>
                              {!done ? (
                                <BouncyPressable
                                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                                  onPress={() => openRecord('receivable', item.id, item.project_name || 'Receivable', item.monthly_amount, null)}
                                >
                                  <Text style={styles.actionBtnText}>Record Receipt</Text>
                                </BouncyPressable>
                              ) : null}
                              <BouncyPressable
                                style={[styles.actionBtnOutline, { borderColor: colors.border }]}
                                onPress={() => openEditReceivable(item)}
                              >
                                <Text style={[styles.actionOutlineText, { color: colors.textSecondary }]}>Edit</Text>
                              </BouncyPressable>
                              {!done ? (
                                <BouncyPressable
                                  disabled={isBusy}
                                  style={[
                                    styles.actionBtnOutline,
                                    { borderColor: stuck ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.25)' },
                                  ]}
                                  onPress={() => markReceivableStuck(item)}
                                >
                                  <Text style={[styles.actionOutlineText, { color: stuck ? colors.success : colors.danger }]}>
                                    {stuck ? 'Resume' : 'Mark Stuck'}
                                  </Text>
                                </BouncyPressable>
                              ) : null}
                              <BouncyPressable
                                disabled={isBusy}
                                style={[styles.actionBtnOutline, { borderColor: 'rgba(220,38,38,0.25)' }]}
                                onPress={() => deleteReceivable(item)}
                              >
                                <Text style={[styles.actionOutlineText, { color: colors.danger }]}>Delete</Text>
                              </BouncyPressable>
                            </View>
                          </View>
                        </Reveal>
                      )
                    })}
                  </>
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal visible={expenseOpen} transparent animationType="fade" onRequestClose={() => setExpenseOpen(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
          <Pressable style={styles.backdrop} onPress={() => setExpenseOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sheetTitle, { color: colors.primaryDark }]}>
              {editingExpenseId ? 'Edit monthly cost' : 'Add monthly cost'}
            </Text>
            <ErrorBanner message={error} />
            <Field label="Name" value={expForm.name} onChangeText={(t) => setExpForm((f) => ({ ...f, name: t }))} autoCapitalize="words" />
            <SelectField
              label="Frequency"
              value={expForm.frequency}
              options={[
                { value: 'monthly', label: 'Every month' },
                { value: 'one_time', label: 'One-time' },
              ]}
              onChange={(f) => setExpForm((form) => ({ ...form, frequency: f }))}
            />
            <Field label="Amount" value={expForm.amount} onChangeText={(t) => setExpForm((f) => ({ ...f, amount: t }))} keyboardType="decimal-pad" />
            <Field label="Due day (1–28)" value={expForm.due_day} onChangeText={(t) => setExpForm((f) => ({ ...f, due_day: t }))} keyboardType="number-pad" />
            <PrimaryButton title="Save" onPress={() => void saveExpense()} loading={saving} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={payableOpen} transparent animationType="fade" onRequestClose={() => setPayableOpen(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
          <Pressable style={styles.backdrop} onPress={() => setPayableOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sheetTitle, { color: colors.primaryDark }]}>
              {editingPayableId ? 'Edit loan / payable' : 'Add loan / payable'}
            </Text>
            <ErrorBanner message={error} />
            <Field label="Name" value={payForm.name} onChangeText={(t) => setPayForm((f) => ({ ...f, name: t }))} autoCapitalize="words" />
            <Field label="Monthly amount" value={payForm.monthly_amount} onChangeText={(t) => setPayForm((f) => ({ ...f, monthly_amount: t }))} keyboardType="decimal-pad" />
            <Field label="Total installments" value={payForm.total_installments} onChangeText={(t) => setPayForm((f) => ({ ...f, total_installments: t }))} keyboardType="number-pad" />
            <Field label="Due day" value={payForm.due_day} onChangeText={(t) => setPayForm((f) => ({ ...f, due_day: t }))} keyboardType="number-pad" />
            <PrimaryButton title="Save" onPress={() => void savePayable()} loading={saving} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={receivableOpen} transparent animationType="fade" onRequestClose={() => setReceivableOpen(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
          <Pressable style={styles.backdrop} onPress={() => setReceivableOpen(false)} />
          <ScrollView style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sheetTitle, { color: colors.primaryDark }]}>
              {editingReceivableId ? 'Edit installment plan' : 'Add installment plan'}
            </Text>
            <ErrorBanner message={error} />
            {!editingReceivableId ? (
              <>
                {projects.length === 0 ? (
                  <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
                    Add an income source under Income first.
                  </Text>
                ) : (
                  <SelectField
                    label="Project"
                    value={recForm.linked_project}
                    options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                    onChange={(v) => setRecForm((f) => ({ ...f, linked_project: v }))}
                    placeholder="Select project…"
                  />
                )}
              </>
            ) : null}
            <Field
              label="Monthly / installment amount"
              value={recForm.monthly_amount}
              onChangeText={(t) => setRecForm((f) => ({ ...f, monthly_amount: t }))}
              keyboardType="decimal-pad"
            />
            <Field
              label="Total installments"
              value={recForm.total_installments}
              onChangeText={(t) => setRecForm((f) => ({ ...f, total_installments: t }))}
              keyboardType="number-pad"
            />
            <PrimaryButton title="Save" onPress={() => void saveReceivable()} loading={saving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!recordModal} transparent animationType="fade" onRequestClose={() => setRecordModal(null)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
          <Pressable style={styles.backdrop} onPress={() => setRecordModal(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sheetTitle, { color: colors.primaryDark }]}>
              {recordModal?.kind === 'payable' ? 'Record Payment' : 'Record Receipt'} — {recordModal?.name}
            </Text>
            <ErrorBanner message={error} />
            <Field label="Amount" value={recordAmount} onChangeText={setRecordAmount} keyboardType="decimal-pad" />
            {accounts.length === 0 ? (
              <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>Create a wallet first.</Text>
            ) : (
              <SelectField
                label="Wallet"
                value={recordAccount}
                options={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
                onChange={setRecordAccount}
                placeholder="Select wallet…"
              />
            )}
            <PrimaryButton
              title={recordModal?.kind === 'payable' ? 'Save payment' : 'Save receipt'}
              onPress={() => void submitRecord()}
              loading={saving}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  title: { fontSize: typography.title, fontWeight: '800' },
  sub: { marginTop: 2, fontSize: typography.caption },
  error: { marginBottom: spacing.md, fontWeight: '600' },
  prompt: { borderRadius: radii.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.lg },
  promptTitle: { fontWeight: '800', marginBottom: 4 },
  promptBody: { fontSize: typography.caption, lineHeight: 18 },
  promptActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  promptPrimary: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.sm },
  promptPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  promptSkip: { fontWeight: '700', fontSize: 12 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  summaryCard: { flex: 1, borderRadius: radii.md, borderWidth: 1, padding: 10 },
  summaryLab: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  summaryVal: { fontWeight: '800', fontSize: 12, marginTop: 4 },
  summarySub: { fontSize: 9, marginTop: 2 },
  tabRow: { gap: 8, marginBottom: spacing.md },
  tabChip: { borderWidth: 1, borderRadius: radii.full, paddingHorizontal: 14, paddingVertical: 8 },
  tabChipText: { fontWeight: '800', fontSize: 12 },
  addBtn: { borderRadius: radii.sm, paddingVertical: 12, alignItems: 'center', marginBottom: spacing.md },
  addBtnText: { color: '#fff', fontWeight: '800' },

  // Rich expense / payable / receivable cards
  richCard: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  richTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 3 },
  richTitle: { fontWeight: '800', fontSize: typography.body },
  richMeta: { fontSize: 12 },
  stuckWarning: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  dueBadgeWrap: { marginTop: 6, flexDirection: 'row' },
  richAmt: { fontWeight: '800', fontSize: typography.body, textAlign: 'right' },
  perMo: { fontSize: 11, fontWeight: '400' },
  remainingLabel: { fontSize: 11, marginTop: 2, textAlign: 'right' },
  pill: { borderRadius: radii.full, paddingHorizontal: 9, paddingVertical: 3, maxWidth: 190 },
  pillText: { fontWeight: '700', fontSize: 10, textTransform: 'capitalize' },
  progressBlock: { marginTop: spacing.sm },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabel: { fontSize: 11 },
  progressTrack: { height: 6, borderRadius: radii.full, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radii.full },
  divider: { height: 1, marginVertical: spacing.sm },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.sm },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  actionBtnMuted: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.sm, borderWidth: 1 },
  actionBtnMutedText: { fontWeight: '700', fontSize: 12 },
  actionBtnOutline: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.sm, borderWidth: 1 },
  actionOutlineText: { fontWeight: '700', fontSize: 12 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  chip: { borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 8 },
  chipText: { fontWeight: '700', fontSize: 12 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },

  modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,31,26,0.4)' },
  sheet: { maxHeight: '88%', borderRadius: radii.lg, padding: spacing.lg, zIndex: 2 },
  sheetTitle: { fontSize: typography.subtitle, fontWeight: '800', marginBottom: spacing.md },
})
