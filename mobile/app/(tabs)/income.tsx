import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  accountsApi,
  apiErrorMessage,
  asList,
  projectsApi,
  transactionsApi,
} from '@/src/api/client'
import type { Account, Project } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { BouncyPressable, Reveal } from '@/src/components/motion'
import { DateField, SelectField } from '@/src/components/SelectFields'
import { ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography } from '@/src/theme/colors'
import { mutationId, todayISO, toMoney } from '@/src/utils/format'

const TYPE_LABEL: Record<string, string> = {
  recurring_monthly: 'Every month',
  contract_monthly: 'Salary / contract',
  one_time: 'One-time payment',
  one_time_installments: 'Paid in parts',
}

const TYPE_HINT: Record<string, string> = {
  recurring_monthly: 'Salary, retainer, or anything that lands each month',
  contract_monthly: 'A fixed monthly amount from a client or deal',
  one_time: 'A single payment still owed to you — saved under Bills → Owed to you',
  one_time_installments: 'Total due in smaller payments — saved under Bills → Owed to you',
}

/** Recurring sources stay on this tab. One-time & installments are created here, listed under Bills. */
const INCOME_TYPES = Object.keys(TYPE_LABEL) as Project['income_type'][]
const OWED_TYPES = new Set(['one_time', 'one_time_installments'])

export default function IncomeScreen() {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const money = useMaskedMoney()
  const { refreshKey, bumpRefresh } = useMoneyUi()
  const [projects, setProjects] = useState<Project[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState<Project | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [form, setForm] = useState({
    name: '',
    income_type: 'recurring_monthly' as Project['income_type'],
    amount: '',
    installment_amount: '',
    advance_amount: '0',
    start_date: todayISO(),
    default_account: '',
    notes: '',
  })
  const [receiveAmount, setReceiveAmount] = useState('')

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      const [pRes, aRes] = await Promise.all([projectsApi.list(), accountsApi.list()])
      setProjects(asList<Project>(pRes.data))
      setAccounts(asList<Account>(aRes.data))
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load income.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const active = useMemo(
    () => projects.filter((p) => p.status === 'active' && !OWED_TYPES.has(p.income_type)),
    [projects],
  )
  const other = useMemo(
    () => projects.filter((p) => p.status !== 'active' && !OWED_TYPES.has(p.income_type)),
    [projects],
  )

  const create = async () => {
    if (busyRef.current) return
    if (!form.name.trim() || toMoney(form.amount) <= 0) {
      setError('Name and amount are required.')
      return
    }
    if (form.income_type === 'one_time_installments' && toMoney(form.installment_amount) <= 0) {
      setError('Enter how much you expect in each payment.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        income_type: form.income_type,
        amount: toMoney(form.amount),
        advance_amount: OWED_TYPES.has(form.income_type) ? toMoney(form.advance_amount) : 0,
        start_date: form.start_date || todayISO(),
        status: 'active',
        notes: form.notes.trim(),
      }
      if (form.income_type === 'one_time_installments') {
        payload.installment_amount = toMoney(form.installment_amount)
      }
      if (form.default_account) payload.default_account = Number(form.default_account)
      await projectsApi.create(payload)
      const createdType = form.income_type
      setCreateOpen(false)
      setForm({
        name: '',
        income_type: 'recurring_monthly',
        amount: '',
        installment_amount: '',
        advance_amount: '0',
        start_date: todayISO(),
        default_account: '',
        notes: '',
      })
      bumpRefresh()
      await load(true)
      if (OWED_TYPES.has(createdType)) {
        Alert.alert(
          'Saved',
          createdType === 'one_time'
            ? 'This one-time amount is under Bills → Owed to you.'
            : 'This installment plan is under Bills → Owed to you.',
        )
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create income source.'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const recordReceived = async () => {
    if (busyRef.current) return
    if (!receiveOpen) return
    const amount = toMoney(receiveAmount || receiveOpen.installment_amount || receiveOpen.amount)
    const account = receiveOpen.default_account || accounts[0]?.id
    if (!account || amount <= 0) {
      setError('Pick a wallet and amount.')
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      await transactionsApi.create({
        type: 'income',
        amount,
        date: todayISO(),
        account,
        category: receiveOpen.name,
        notes: `Received: ${receiveOpen.name}`,
        linked_project: receiveOpen.id,
        client_mutation_id: mutationId(),
      })
      setReceiveOpen(null)
      setReceiveAmount('')
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not record receipt.'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const setStatus = async (p: Project, status: string) => {
    setBusy(true)
    try {
      await projectsApi.update(p.id, { status })
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update status.'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (p: Project) => {
    setBusy(true)
    try {
      await projectsApi.remove(p.id)
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not delete income source.'))
    } finally {
      setBusy(false)
    }
  }

  const renderCard = (p: Project, index: number) => (
    <Reveal index={index} key={p.id}>
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{p.name}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: colors.infoBg }]}>
              <Text style={[styles.badgeText, { color: colors.infoText }]}>{p.status}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                {TYPE_LABEL[p.income_type] || p.income_type}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.amt, money.amountStyle, { color: colors.success }]}>
            {money.fmt(p.amount)}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>each month</Text>
        </View>
      </View>

      {p.default_account_name ? (
        <Text style={[styles.walletLine, { color: colors.textMuted }]}>→ {p.default_account_name}</Text>
      ) : null}
      {p.notes ? (
        <Text style={[styles.notes, { color: colors.textMuted }]} numberOfLines={2}>{p.notes}</Text>
      ) : null}
      {p.remaining_amount != null ? (
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {toMoney(p.remaining_amount) > 0.01
            ? `You'll still receive ${money.fmt(p.remaining_amount)}${p.income_type === 'recurring_monthly' || p.income_type === 'contract_monthly' ? ' this month' : ''}`
            : p.income_type === 'recurring_monthly' || p.income_type === 'contract_monthly'
              ? 'Fully received this month'
              : 'Fully received'}
        </Text>
      ) : null}

      <View style={styles.cardActions}>
        {p.status === 'active' && toMoney(p.remaining_amount ?? p.amount) > 0.01 ? (
          <BouncyPressable
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setReceiveAmount(String(p.remaining_amount || p.installment_amount || p.amount || ''))
              setReceiveOpen(p)
            }}
          >
            <Text style={styles.actionBtnText}>Got paid</Text>
          </BouncyPressable>
        ) : p.status === 'active' ? (
          <View style={[styles.actionBtn, styles.actionBtnMuted, { borderColor: colors.border }]}>
            <Text style={[styles.actionBtnMutedText, { color: colors.success }]}>Received this month</Text>
          </View>
        ) : null}
        {p.status === 'active' ? (
          <BouncyPressable
            style={[styles.actionBtnOutline, { borderColor: colors.border }]}
            onPress={() => void setStatus(p, 'paused')}
          >
            <Text style={[styles.actionOutlineText, { color: colors.textSecondary }]}>Pause</Text>
          </BouncyPressable>
        ) : p.status === 'paused' ? (
          <BouncyPressable
            style={[styles.actionBtnOutline, { borderColor: colors.border }]}
            onPress={() => void setStatus(p, 'active')}
          >
            <Text style={[styles.actionOutlineText, { color: colors.primary }]}>Resume</Text>
          </BouncyPressable>
        ) : null}
        <BouncyPressable
          style={[styles.actionBtnOutline, { borderColor: '#fecaca' }]}
          onPress={() => void remove(p)}
        >
          <Text style={[styles.actionOutlineText, { color: colors.danger }]}>Delete</Text>
        </BouncyPressable>
      </View>
    </View>
    </Reveal>
  )

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110 }}
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
            <Text style={[styles.title, { color: colors.text }]}>Income</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Projects, salary & one-time sources</Text>
          </View>
          <AmountEyeToggle />
        </View>

        <BouncyPressable
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => setCreateOpen(true)}
        >
          <Text style={styles.addBtnText}>+ Add income source</Text>
        </BouncyPressable>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {loading && projects.length === 0 ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={[styles.section, { color: colors.primaryDark }]}>Active</Text>
            {active.length === 0 ? (
              <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>No active income sources.</Text>
            ) : (
              active.map(renderCard)
            )}
            {other.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.primaryDark }]}>Paused / Done</Text>
                {other.map((p, i) => renderCard(p, active.length + i))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        >
          <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)} />
          <ScrollView
            style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.sheetTitle, { color: colors.primaryDark }]}>New income source</Text>
            <ErrorBanner message={error} />
            <Field label="Name" value={form.name} onChangeText={(t) => setForm((f) => ({ ...f, name: t }))} placeholder="Client / Salary" autoCapitalize="words" />
            <SelectField
              label="How do you get paid?"
              value={form.income_type}
              options={INCOME_TYPES.map((t) => ({
                value: t,
                label: TYPE_LABEL[t],
              }))}
              onChange={(t) => setForm((f) => ({ ...f, income_type: t as Project['income_type'] }))}
            />
            <Text style={[styles.hint, { color: colors.textMuted }]}>{TYPE_HINT[form.income_type]}</Text>
            <Field
              label={form.income_type === 'recurring_monthly' || form.income_type === 'contract_monthly' ? 'Amount each month' : 'Total amount'}
              value={form.amount}
              onChangeText={(t) => setForm((f) => ({ ...f, amount: t }))}
              keyboardType="decimal-pad"
            />
            {form.income_type === 'one_time_installments' ? (
              <Field
                label="Each payment"
                value={form.installment_amount}
                onChangeText={(t) => setForm((f) => ({ ...f, installment_amount: t }))}
                keyboardType="decimal-pad"
                placeholder="e.g. 20000"
              />
            ) : null}
            {OWED_TYPES.has(form.income_type) ? (
              <Field
                label="Advance already received (optional)"
                value={form.advance_amount}
                onChangeText={(t) => setForm((f) => ({ ...f, advance_amount: t }))}
                keyboardType="decimal-pad"
              />
            ) : null}
            <DateField
              label="Start date"
              value={form.start_date}
              onChange={(d) => setForm((f) => ({ ...f, start_date: d }))}
            />
            {accounts.length > 0 ? (
              <SelectField
                label="Default wallet (optional)"
                value={form.default_account}
                options={[
                  { value: '', label: 'None' },
                  ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
                ]}
                onChange={(v) => setForm((f) => ({ ...f, default_account: v }))}
                placeholder="None"
              />
            ) : null}
            <PrimaryButton title="Create" onPress={() => void create()} loading={busy} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!receiveOpen} transparent animationType="fade" onRequestClose={() => setReceiveOpen(null)}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        >
          <Pressable style={styles.backdrop} onPress={() => setReceiveOpen(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sheetTitle, { color: colors.primaryDark }]}>
              Record received — {receiveOpen?.name}
            </Text>
            <Field label="Amount" value={receiveAmount} onChangeText={setReceiveAmount} keyboardType="decimal-pad" />
            <PrimaryButton title="Save receipt" onPress={() => void recordReceived()} loading={busy} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  title: { fontSize: typography.title, fontWeight: '800' },
  sub: { marginTop: 2, fontSize: typography.caption },
  addBtn: {
    borderRadius: radii.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  addBtnText: { color: '#fff', fontWeight: '800' },
  error: { fontWeight: '600', marginBottom: spacing.md },
  section: { fontWeight: '800', fontSize: typography.subtitle, marginBottom: spacing.sm, marginTop: spacing.sm },
  card: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardTitle: { fontWeight: '800', fontSize: typography.body },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { borderRadius: radii.full, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontWeight: '700', fontSize: 10, textTransform: 'capitalize' },
  meta: { fontSize: 12, marginTop: 2 },
  amt: { fontWeight: '800', fontSize: typography.body },
  walletLine: { fontSize: 12, marginTop: spacing.sm },
  notes: { fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.sm },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  actionBtnMuted: { borderWidth: 1, backgroundColor: 'transparent' },
  actionBtnMutedText: { fontWeight: '700', fontSize: 12 },
  actionBtnOutline: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.sm, borderWidth: 1 },
  actionOutlineText: { fontWeight: '700', fontSize: 12 },
  modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,31,26,0.4)' },
  sheet: {
    maxHeight: '88%',
    borderRadius: radii.lg,
    padding: spacing.lg,
    zIndex: 2,
  },
  sheetTitle: { fontSize: typography.subtitle, fontWeight: '800', marginBottom: spacing.md },
  hint: { fontSize: 12, marginTop: -6, marginBottom: spacing.md, lineHeight: 16 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  segBtn: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  segText: { fontWeight: '700', fontSize: 12 },
})
