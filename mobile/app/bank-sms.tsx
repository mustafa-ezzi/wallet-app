import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BANK_SMS_UX,
  buildApproveDraft,
  buildApprovePlan,
  parseBankSms,
  type ApproveDraft,
  type BankSmsKind,
  type ParsedBankSms,
  type WalletLike,
} from '@cashtrail/bank-sms-parser'
import { DateField, SelectField } from '@/src/components/SelectFields'
import { ErrorBanner, PrimaryButton } from '@/src/components/ui'
import { accountsApi, apiErrorMessage, asList } from '@/src/api/client'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/src/constants/categories'
import { useOffline } from '@/src/offline'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'

type Acc = { id: number; name: string; type: string }

const KIND_OPTIONS: { value: BankSmsKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'atm', label: 'ATM (cash out)' },
  { value: 'income', label: 'Received' },
  { value: 'reversal', label: 'Reversed' },
]

export default function BankSmsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { queueTransaction, syncNow, getCachedAccounts } = useOffline()

  const [paste, setPaste] = useState('')
  const [parsed, setParsed] = useState<ParsedBankSms | null>(null)
  const [draft, setDraft] = useState<ApproveDraft | null>(null)
  const [wallets, setWallets] = useState<WalletLike[]>([])
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const loadWallets = useCallback(async () => {
    try {
      const res = await accountsApi.list({ type: 'bank,cash' })
      const list = asList<Acc>(res.data).filter((a) => a.type === 'bank' || a.type === 'cash')
      setWallets(list.map((a) => ({ id: a.id, name: a.name, type: a.type })))
    } catch {
      const cached = await getCachedAccounts()
      setWallets(
        cached
          .filter((a) => a.type === 'bank' || a.type === 'cash')
          .map((a) => ({ id: a.serverId, name: a.name, type: a.type })),
      )
    }
  }, [getCachedAccounts])

  useEffect(() => {
    void loadWallets()
  }, [loadWallets])

  const banks = useMemo(() => wallets.filter((w) => w.type === 'bank'), [wallets])
  const cashWallets = useMemo(() => wallets.filter((w) => w.type === 'cash'), [wallets])

  const onDetect = () => {
    setError('')
    setOkMsg('')
    const p = parseBankSms(paste)
    setParsed(p)
    if (p.ignore) {
      setDraft(null)
      setError('This does not look like a bank money alert (OTP, failed, or marketing).')
      return
    }
    if (!p.amount) {
      setDraft(null)
      setError('Could not read an amount. Check the message and try again.')
      return
    }
    setDraft(buildApproveDraft(p, wallets))
  }

  const patchDraft = (patch: Partial<ApproveDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const categoryOptions = useMemo(() => {
    if (!draft) return []
    if (draft.kind === 'income' || draft.kind === 'reversal') return INCOME_CATEGORIES
    if (draft.kind === 'atm' && !draft.recordAtmAsExpense) return []
    return EXPENSE_CATEGORIES
  }, [draft])

  const onApprove = async () => {
    if (!draft) return
    if (!draft.bankAccountId) {
      setError('Pick a bank wallet.')
      return
    }
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      let cashId = draft.cashAccountId
      const plan = buildApprovePlan({ ...draft, cashAccountId: cashId })

      if (plan.createCashNamed) {
        const created = await accountsApi.create({
          name: plan.createCashNamed,
          type: 'cash',
          opening_balance: 0,
        })
        cashId = Number(created.data.id)
        await syncNow()
        await loadWallets()
      }

      const finalPlan = buildApprovePlan({ ...draft, cashAccountId: cashId })
      for (const step of finalPlan.steps) {
        const accountId = step.accountRole === 'cash' ? cashId : step.accountId
        if (!accountId) throw new Error('Missing wallet for one of the legs.')
        await queueTransaction({
          type: step.type,
          amount: step.amount,
          date: step.date,
          accountServerId: accountId,
          category: step.category,
          notes: step.notes,
        })
      }

      setOkMsg(`Posted: ${finalPlan.summary}`)
      setPaste('')
      setParsed(null)
      setDraft(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not approve this draft.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{BANK_SMS_UX.pasteTitle}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.textMuted }]}>{BANK_SMS_UX.pasteHint}</Text>
        <Text style={[styles.privacy, { color: colors.textSecondary }]}>{BANK_SMS_UX.privacyBlurb}</Text>

        {error ? <ErrorBanner message={error} /> : null}
        {okMsg ? (
          <View style={[styles.okBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{okMsg}</Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.textMuted }]}>Message</Text>
        <TextInput
          value={paste}
          onChangeText={setPaste}
          placeholder={BANK_SMS_UX.pastePlaceholder}
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <PrimaryButton
          title={BANK_SMS_UX.parseButton}
          onPress={onDetect}
          disabled={!paste.trim() || busy}
        />

        {draft && parsed ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{BANK_SMS_UX.reviewTitle}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
              Detected as {parsed.kind} · {Math.round(parsed.confidence * 100)}% · {parsed.reason}
            </Text>

            <SelectField
              label="Type"
              value={draft.kind}
              options={KIND_OPTIONS}
              onChange={(kind) => {
                patchDraft({
                  kind,
                  category:
                    kind === 'atm'
                      ? 'Bank Transfer'
                      : kind === 'income' || kind === 'reversal'
                        ? 'Other'
                        : 'Miscellaneous',
                  recordAtmAsExpense: kind === 'atm' ? draft.recordAtmAsExpense : false,
                })
              }}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Amount (PKR)</Text>
            <TextInput
              value={String(draft.amount)}
              onChangeText={(t) => patchDraft({ amount: Number(t.replace(/,/g, '')) || 0 })}
              keyboardType="decimal-pad"
              style={[styles.inputSingle, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />

            <DateField
              label="Date"
              value={draft.date}
              onChange={(date) => patchDraft({ date })}
            />

            <SelectField
              label="Bank wallet"
              value={draft.bankAccountId != null ? String(draft.bankAccountId) : ''}
              options={banks.map((w) => ({ value: String(w.id), label: w.name }))}
              onChange={(v) => patchDraft({ bankAccountId: Number(v) })}
              placeholder="Select wallet…"
            />

            {draft.kind === 'atm' ? (
              <View style={{ marginBottom: 12 }}>
                <View style={styles.switchRow}>
                  <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>
                    {BANK_SMS_UX.atmAsExpense}
                  </Text>
                  <Switch
                    value={draft.recordAtmAsExpense}
                    onValueChange={(v) => patchDraft({ recordAtmAsExpense: v })}
                  />
                </View>
                {!draft.recordAtmAsExpense ? (
                  cashWallets.length ? (
                    <SelectField
                      label="Cash wallet"
                      value={draft.cashAccountId != null ? String(draft.cashAccountId) : ''}
                      options={cashWallets.map((w) => ({ value: String(w.id), label: w.name }))}
                      onChange={(v) => patchDraft({ cashAccountId: Number(v), createCashNamed: null })}
                    />
                  ) : (
                    <View style={[styles.warn, { borderColor: colors.border }]}>
                      <Text style={{ color: colors.text, fontWeight: '800' }}>{BANK_SMS_UX.atmNoCashTitle}</Text>
                      <Text style={{ color: colors.textMuted, marginTop: 6 }}>{BANK_SMS_UX.atmNoCashBody}</Text>
                    </View>
                  )
                ) : null}
              </View>
            ) : null}

            {categoryOptions.length > 0 ? (
              <SelectField
                label="Category"
                value={draft.category}
                options={categoryOptions.map((c) => ({ value: c.key, label: c.label }))}
                onChange={(category) => patchDraft({ category })}
              />
            ) : null}

            <Text style={[styles.label, { color: colors.textMuted }]}>Notes</Text>
            <TextInput
              value={draft.notes}
              onChangeText={(notes) => patchDraft({ notes })}
              style={[styles.inputSingle, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />

            {busy ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : null}
            <PrimaryButton title={BANK_SMS_UX.approve} onPress={() => void onApprove()} disabled={busy} loading={busy} />
            <Pressable
              onPress={() => { setDraft(null); setParsed(null) }}
              style={{ marginTop: 12, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textMuted, fontWeight: '700' }}>{BANK_SMS_UX.reject}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function makeStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: 8,
    },
    title: { ...typography.title, fontSize: 17 },
    pad: { padding: spacing.md, paddingBottom: 48, gap: 8 },
    hint: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
    privacy: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
    label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8 },
    input: {
      minHeight: 110,
      borderWidth: 1,
      borderRadius: radii.md,
      padding: 12,
      textAlignVertical: 'top',
      marginBottom: 12,
      fontSize: 14,
    },
    inputSingle: {
      borderWidth: 1,
      borderRadius: radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
      fontSize: 15,
    },
    card: {
      marginTop: 16,
      borderWidth: 1,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 10,
    },
    warn: {
      borderWidth: 1,
      borderRadius: radii.md,
      padding: 12,
      marginTop: 4,
    },
    okBox: {
      borderWidth: 1,
      borderRadius: radii.md,
      padding: 12,
      marginBottom: 8,
    },
  })
}
