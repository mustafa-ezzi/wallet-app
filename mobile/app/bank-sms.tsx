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
  parseBankSms,
  type ApproveDraft,
  type BankSmsKind,
  type ParsedBankSms,
  type WalletLike,
} from '@cashtrail/bank-sms-parser'
import { DateField, SelectField } from '@/src/components/SelectFields'
import { ErrorBanner, PrimaryButton } from '@/src/components/ui'
import {
  accountsApi,
  apiErrorMessage,
  asList,
  bankSmsApi,
  type BankSmsImportRow,
} from '@/src/api/client'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/src/constants/categories'
import { useOffline } from '@/src/offline'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { fmt } from '@/src/utils/format'

type Acc = { id: number; name: string; type: string }

const KIND_OPTIONS: { value: BankSmsKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'atm', label: 'ATM (cash out)' },
  { value: 'income', label: 'Received' },
  { value: 'reversal', label: 'Reversed' },
]

function toMoney(n: number | string | null | undefined): number {
  if (n == null || n === '') return 0
  const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/,/g, ''))
  return Number.isFinite(num) ? num : 0
}

function draftFromRow(row: BankSmsImportRow): ApproveDraft {
  const kind = (row.kind === 'unknown' ? 'expense' : row.kind) as BankSmsKind
  return {
    kind,
    amount: toMoney(row.amount),
    date: row.tx_date || new Date().toISOString().slice(0, 10),
    bankAccountId: row.resolved_account ?? row.suggested_account,
    cashAccountId: row.cash_account,
    category: row.category || (kind === 'atm' ? 'Bank Transfer' : kind === 'income' || kind === 'reversal' ? 'Other' : 'Miscellaneous'),
    notes: row.notes || '',
    createCashNamed: row.cash_account ? null : 'Cash',
    recordAtmAsExpense: row.record_atm_as_expense,
  }
}

export default function BankSmsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { syncNow, getCachedAccounts } = useOffline()

  const [paste, setPaste] = useState('')
  const [parsed, setParsed] = useState<ParsedBankSms | null>(null)
  const [draft, setDraft] = useState<ApproveDraft | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [pending, setPending] = useState<BankSmsImportRow[]>([])
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

  const loadPending = useCallback(async () => {
    try {
      const res = await bankSmsApi.list({ status: 'pending' })
      setPending(Array.isArray(res.data) ? res.data : [])
    } catch {
      /* offline */
    }
  }, [])

  useEffect(() => {
    void loadWallets()
    void loadPending()
  }, [loadWallets, loadPending])

  const banks = useMemo(() => wallets.filter((w) => w.type === 'bank'), [wallets])
  const cashWallets = useMemo(() => wallets.filter((w) => w.type === 'cash'), [wallets])

  const onDetect = async () => {
    setError('')
    setOkMsg('')
    const p = parseBankSms(paste)
    setParsed(p)
    if (p.ignore) {
      setDraft(null)
      setPendingId(null)
      setError('This does not look like a bank money alert (OTP, failed, or marketing).')
      return
    }
    if (!p.amount) {
      setDraft(null)
      setPendingId(null)
      setError('Could not read an amount. Check the message and try again.')
      return
    }
    const localDraft = buildApproveDraft(p, wallets)
    setDraft(localDraft)
    setBusy(true)
    try {
      const res = await bankSmsApi.create({
        kind: localDraft.kind,
        amount: localDraft.amount,
        tx_date: localDraft.date,
        fingerprint: p.fingerprint,
        tid: p.tid || '',
        counterparty: p.counterparty || '',
        bank_hint: p.bankHint || '',
        account_mask: p.accountMask || '',
        raw_snippet: p.raw.slice(0, 280),
        source: 'paste',
        category: localDraft.category,
        notes: localDraft.notes,
        confidence: p.confidence,
        parse_reason: p.reason,
        parser_version: '1',
        suggested_account_id: localDraft.bankAccountId,
        resolved_account_id: localDraft.bankAccountId,
        cash_account_id: localDraft.cashAccountId,
        record_atm_as_expense: localDraft.recordAtmAsExpense,
      })
      setPendingId(res.data.id)
      setDraft(draftFromRow(res.data))
      await loadPending()
      setOkMsg(`Saved to pending (#${res.data.id}). Approve here or on web.`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not sync pending draft.'))
      setPendingId(null)
    } finally {
      setBusy(false)
    }
  }

  const openPending = (row: BankSmsImportRow) => {
    setError('')
    setOkMsg('')
    setPendingId(row.id)
    setDraft(draftFromRow(row))
    setParsed({
      ok: true,
      kind: row.kind,
      amount: toMoney(row.amount),
      occurredAt: row.occurred_at,
      date: row.tx_date,
      tid: row.tid || null,
      counterparty: row.counterparty || null,
      accountMask: row.account_mask || null,
      bankHint: row.bank_hint || null,
      confidence: Number(row.confidence) || 0.5,
      reason: row.parse_reason || 'queued',
      fingerprint: row.fingerprint,
      raw: row.raw_snippet || '',
      ignore: false,
    })
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
    if (!draft || !pendingId) {
      setError('Detect a message first, or open one from the pending inbox.')
      return
    }
    if (!draft.bankAccountId) {
      setError('Pick a bank wallet.')
      return
    }
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      const res = await bankSmsApi.approve(pendingId, {
        kind: draft.kind,
        amount: draft.amount,
        tx_date: draft.date,
        category: draft.category,
        notes: draft.notes,
        resolved_account_id: draft.bankAccountId,
        cash_account_id: draft.cashAccountId,
        record_atm_as_expense: draft.recordAtmAsExpense,
        create_cash: draft.kind === 'atm' && !draft.recordAtmAsExpense && !draft.cashAccountId,
        create_cash_name: draft.createCashNamed || 'Cash',
      })
      await syncNow()
      await loadWallets()
      await loadPending()
      setOkMsg(`Approved #${res.data.id}`)
      setPaste('')
      setParsed(null)
      setDraft(null)
      setPendingId(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not approve this draft.'))
    } finally {
      setBusy(false)
    }
  }

  const onReject = async () => {
    if (!pendingId) {
      setDraft(null)
      setParsed(null)
      return
    }
    setBusy(true)
    try {
      await bankSmsApi.reject(pendingId)
      await loadPending()
      setOkMsg(`Rejected #${pendingId}.`)
      setDraft(null)
      setParsed(null)
      setPendingId(null)
      setPaste('')
    } catch (err) {
      setError(apiErrorMessage(err, 'Reject failed.'))
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
        <Text style={[styles.privacy, { color: colors.textSecondary }]}>
          {BANK_SMS_UX.privacyBlurb} Drafts sync to your pending inbox across devices.
        </Text>

        {error ? <ErrorBanner message={error} /> : null}
        {okMsg ? (
          <View style={[styles.okBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{okMsg}</Text>
          </View>
        ) : null}

        {pending.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Pending ({pending.length})</Text>
            {pending.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => openPending(row)}
                style={[styles.pendingRow, { borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '800' }}>#{row.id} · {row.kind}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={2}>
                    {row.raw_snippet || row.notes || 'Bank SMS'}
                  </Text>
                </View>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{fmt(row.amount)}</Text>
              </Pressable>
            ))}
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
          onPress={() => void onDetect()}
          disabled={!paste.trim() || busy}
          loading={busy && !draft}
        />

        {draft && parsed ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {BANK_SMS_UX.reviewTitle}{pendingId ? ` · #${pendingId}` : ''}
            </Text>
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

            <DateField label="Date" value={draft.date} onChange={(date) => patchDraft({ date })} />

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
            <PrimaryButton
              title={BANK_SMS_UX.approve}
              onPress={() => void onApprove()}
              disabled={busy || !pendingId}
              loading={busy}
            />
            <Pressable onPress={() => void onReject()} style={{ marginTop: 12, alignItems: 'center' }}>
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
      marginTop: 8,
      marginBottom: 8,
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
    pendingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
  })
}
