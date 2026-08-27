import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Platform,
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
  needsManualTypePick,
  parseBankSms,
  suggestPeopleMatch,
  type ApproveDraft,
  type BankSmsKind,
  type KindOverride,
  type ParsedBankSms,
  type WalletAlias,
  type WalletLike,
} from '@/src/lib/bank-sms-parser'
import { DateField, SelectField } from '@/src/components/SelectFields'
import { ErrorBanner, PrimaryButton } from '@/src/components/ui'
import {
  accountsApi,
  apiErrorMessage,
  asList,
  bankSmsApi,
  peopleApi,
  type BankSmsImportRow,
} from '@/src/api/client'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/src/constants/categories'
import { useOffline } from '@/src/offline'
import { useBankSms } from '@/src/bankSms'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useColors } from '@/src/theme/ThemeContext'
import { iosShadow, radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { fmt } from '@/src/utils/format'

type Acc = { id: number; name: string; type: string }

const KIND_OPTIONS: { value: BankSmsKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'atm', label: 'ATM (cash out)' },
  { value: 'income', label: 'Received' },
  { value: 'reversal', label: 'Reversed' },
]

function kindTone(kind: string, colors: ColorTokens): { bg: string; fg: string } {
  if (kind === 'income') return { bg: colors.primarySoft + '22', fg: colors.primaryDark }
  if (kind === 'atm') return { bg: colors.infoBg, fg: colors.infoText }
  if (kind === 'reversal') return { bg: colors.warningBg, fg: colors.warning }
  if (kind === 'expense') return { bg: '#fef2f2', fg: colors.danger }
  return { bg: colors.surfaceMuted, fg: colors.textMuted }
}

function kindLabel(kind: string): string {
  return KIND_OPTIONS.find((k) => k.value === kind)?.label || kind
}


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
  const { hydrateNow, getCachedAccounts } = useOffline()
  const bankSms = useBankSms()
  const { bumpRefresh } = useMoneyUi()

  const [paste, setPaste] = useState('')
  const [parsed, setParsed] = useState<ParsedBankSms | null>(null)
  const [draft, setDraft] = useState<ApproveDraft | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [pending, setPending] = useState<BankSmsImportRow[]>([])
  const [wallets, setWallets] = useState<WalletLike[]>([])
  const [aliases, setAliases] = useState<WalletAlias[]>([])
  const [kindOverrides, setKindOverrides] = useState<KindOverride[]>([])
  const [defaultCashId, setDefaultCashId] = useState<number | null>(null)
  const [rememberWallet, setRememberWallet] = useState(true)
  const [rememberKind, setRememberKind] = useState(false)
  const [typeConfirmed, setTypeConfirmed] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [peopleHint, setPeopleHint] = useState<string | null>(null)
  const [aliasMask, setAliasMask] = useState('')
  const [aliasHint, setAliasHint] = useState('')
  const [aliasWalletId, setAliasWalletId] = useState('')
  const [showMapping, setShowMapping] = useState(false)
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

  const loadSettings = useCallback(async () => {
    try {
      const res = await bankSmsApi.settings()
      setAliases((res.data.wallet_aliases || []) as WalletAlias[])
      setKindOverrides((res.data.kind_overrides || []) as KindOverride[])
      setDefaultCashId(res.data.default_cash_wallet_id ?? null)
    } catch {
      /* offline */
    }
  }, [])

  const loadPeopleHint = useCallback(async (counterparty: string | null | undefined) => {
    if (!counterparty) {
      setPeopleHint(null)
      return
    }
    try {
      const res = await peopleApi.list()
      const people = asList<{ id: number; name: string }>(res.data)
      const hit = suggestPeopleMatch(counterparty, people)
      setPeopleHint(hit ? `Matches People: ${hit.name}` : null)
    } catch {
      setPeopleHint(null)
    }
  }, [])

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
    void loadSettings()
  }, [loadWallets, loadPending, loadSettings])

  const banks = useMemo(() => wallets.filter((w) => w.type === 'bank'), [wallets])
  const cashWallets = useMemo(() => wallets.filter((w) => w.type === 'cash'), [wallets])
  const mustPickType = parsed ? needsManualTypePick(parsed) && !typeConfirmed : false

  const onDetect = async () => {
    setError('')
    setOkMsg('')
    setTypeConfirmed(false)
    const p = parseBankSms(paste, { kindOverrides })
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
    const localDraft = buildApproveDraft(p, wallets, undefined, { aliases, defaultCashId })
    setDraft(localDraft)
    void loadPeopleHint(p.counterparty)
    if (p.accountMask) setAliasMask(p.accountMask.replace(/\D/g, '').slice(-4) || p.accountMask)
    if (p.bankHint) setAliasHint(p.bankHint)
    if (localDraft.bankAccountId) setAliasWalletId(String(localDraft.bankAccountId))
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
      let msg = `Saved to pending (#${res.data.id}). Approve here or on web.`
      if (needsManualTypePick(p)) msg += ' Low confidence — confirm the type before approving.'
      setOkMsg(msg)
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
    setTypeConfirmed(false)
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
    if (row.account_mask) setAliasMask(String(row.account_mask).replace(/\D/g, '').slice(-4))
    if (row.bank_hint) setAliasHint(row.bank_hint)
    const acct = row.resolved_account ?? row.suggested_account
    if (acct) setAliasWalletId(String(acct))
    void loadPeopleHint(row.counterparty)
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

  const refreshBooksAfterAction = useCallback(async () => {
    try {
      await hydrateNow()
      await loadWallets()
      await loadPending()
      await loadSettings()
    } catch {
      /* server already updated — cache refresh is best-effort */
    }
    void bankSms.refreshPending()
    bumpRefresh()
  }, [hydrateNow, loadWallets, loadPending, loadSettings, bankSms, bumpRefresh])

  const onApprove = async () => {
    if (!draft || !pendingId) {
      setError('Detect a message first, or open one from the pending inbox.')
      return
    }
    if (!draft.bankAccountId) {
      setError('Pick a bank wallet.')
      return
    }
    if (mustPickType) {
      setError('Confirm the transaction type — detection confidence is low.')
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
        remember_wallet: rememberWallet,
        remember_kind: rememberKind,
      })
      setOkMsg(
        `Approved #${res.data.id}`
        + (res.data.linked_import ? ` · linked #${res.data.linked_import}` : '')
        + (rememberWallet ? ' · wallet remembered' : '')
        + (rememberKind ? ' · type saved' : ''),
      )
      setPaste('')
      setParsed(null)
      setDraft(null)
      setPendingId(null)
      setTypeConfirmed(false)
      setRememberKind(false)
      setPeopleHint(null)
      await refreshBooksAfterAction()
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
      setOkMsg(`Rejected #${pendingId}.`)
      setDraft(null)
      setParsed(null)
      setPendingId(null)
      setPaste('')
      setTypeConfirmed(false)
      await refreshBooksAfterAction()
    } catch (err) {
      setError(apiErrorMessage(err, 'Reject failed.'))
    } finally {
      setBusy(false)
    }
  }

  const saveAlias = async () => {
    if (!aliasWalletId) {
      setError('Pick a wallet for the alias.')
      return
    }
    if (!aliasMask.trim() && !aliasHint.trim()) {
      setError('Enter a last-4 / mask or a bank hint.')
      return
    }
    const maskDigits = aliasMask.replace(/\D/g, '').slice(-4)
    const hintNorm = aliasHint.toLowerCase().replace(/[^a-z0-9]/g, '')
    const next: WalletAlias[] = [
      ...aliases.filter((a) => {
        if (maskDigits && a.mask === maskDigits) return false
        if (hintNorm && a.hint === hintNorm && !a.mask) return false
        return true
      }),
    ]
    if (maskDigits) next.push({ account_id: Number(aliasWalletId), mask: maskDigits })
    if (hintNorm) next.push({ account_id: Number(aliasWalletId), hint: hintNorm })
    setBusy(true)
    try {
      const res = await bankSmsApi.updateSettings({ wallet_aliases: next })
      setAliases((res.data.wallet_aliases || []) as WalletAlias[])
      setOkMsg('Wallet alias saved.')
      setAliasMask('')
      setAliasHint('')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save alias.'))
    } finally {
      setBusy(false)
    }
  }

  const removeAlias = async (idx: number) => {
    const next = aliases.filter((_, i) => i !== idx)
    setBusy(true)
    try {
      const res = await bankSmsApi.updateSettings({ wallet_aliases: next })
      setAliases((res.data.wallet_aliases || []) as WalletAlias[])
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not remove alias.'))
    } finally {
      setBusy(false)
    }
  }

  const saveDefaultCash = async (id: string) => {
    setBusy(true)
    try {
      const res = await bankSmsApi.updateSettings({
        default_cash_wallet_id: id ? Number(id) : null,
      })
      setDefaultCashId(res.data.default_cash_wallet_id ?? null)
      setOkMsg('Default Cash wallet updated.')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update default Cash.'))
    } finally {
      setBusy(false)
    }
  }

  const onBatchApprove = async () => {
    if (!selectedIds.length) return
    setBusy(true)
    setError('')
    try {
      const res = await bankSmsApi.batchApprove({ ids: selectedIds })
      setSelectedIds([])
      const errN = res.data.errors?.length || 0
      setOkMsg(`Batch approved ${res.data.approved.length}${errN ? ` · ${errN} failed` : ''}.`)
      if (errN) setError(res.data.errors.map((e) => `#${e.id}: ${e.detail}`).join(' · '))
      await refreshBooksAfterAction()
    } catch (err) {
      setError(apiErrorMessage(err, 'Batch approve failed.'))
    } finally {
      setBusy(false)
    }
  }

  const onBatchReject = async () => {
    if (!selectedIds.length) return
    setBusy(true)
    try {
      const res = await bankSmsApi.batchReject({ ids: selectedIds })
      setSelectedIds([])
      setOkMsg(`Rejected ${res.data.rejected_count} item(s).`)
      await refreshBooksAfterAction()
    } catch (err) {
      setError(apiErrorMessage(err, 'Batch reject failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Bank alerts</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {Platform.OS === 'android' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, iosShadow]}>
            <View style={styles.switchRow}>
              <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>SMS</Text>
              <Switch
                value={bankSms.enabled && bankSms.permissionGranted}
                onValueChange={(v) => void bankSms.setEnabled(v)}
              />
            </View>
            {bankSms.notifNativeAvailable ? (
              <View style={[styles.switchRow, { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>Bank apps</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                    {bankSms.notifPermissionGranted
                      ? (bankSms.notifEnabled ? 'Listening' : 'Off')
                      : 'Needed for Meezan push alerts'}
                  </Text>
                  {!bankSms.notifPermissionGranted ? (
                    <Pressable onPress={() => bankSms.openNotifSettings()} style={{ marginTop: 6 }}>
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                        Open Notification access
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Switch
                  value={bankSms.notifEnabled}
                  onValueChange={(v) => void bankSms.setNotifEnabled(v)}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}
        {okMsg ? (
          <View style={[styles.okBox, { backgroundColor: colors.primarySoft + '18', borderColor: colors.primarySoft + '55' }]}>
            <Text style={{ color: colors.primaryDark, fontWeight: '700', fontSize: 13, lineHeight: 18 }}>{okMsg}</Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, iosShadow]}>
          <View style={styles.sectionHead}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>Pending</Text>
            {pending.length > 0 ? (
              <View style={[styles.countPill, { backgroundColor: colors.primary }]}>
                <Text style={styles.countPillText}>{pending.length}</Text>
              </View>
            ) : null}
          </View>

          {pending.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
              Nothing to review yet.
            </Text>
          ) : (
            <>
              <View style={styles.batchRow}>
                <Pressable onPress={() => setSelectedIds(pending.map((r) => r.id))} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Select all</Text>
                </Pressable>
                {selectedIds.length > 0 ? (
                  <>
                    <Pressable onPress={() => void onBatchApprove()} hitSlop={8}>
                      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>
                        Approve ({selectedIds.length})
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => void onBatchReject()} hitSlop={8}>
                      <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 13 }}>Reject</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
              {pending.map((row, idx) => {
                const tone = kindTone(row.kind, colors)
                const selected = selectedIds.includes(row.id)
                const active = pendingId === row.id
                return (
                  <View
                    key={row.id}
                    style={[
                      styles.pendingCard,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primarySoft + '14' : colors.background,
                        marginBottom: idx === pending.length - 1 ? 0 : 8,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() => {
                        setSelectedIds((prev) =>
                          selected ? prev.filter((x) => x !== row.id) : [...prev, row.id],
                        )
                      }}
                      style={[
                        styles.checkBox,
                        {
                          borderColor: selected ? colors.primary : colors.borderStrong,
                          backgroundColor: selected ? colors.primary : 'transparent',
                        },
                      ]}
                      hitSlop={6}
                    >
                      {selected ? <Text style={styles.checkMark}>✓</Text> : null}
                    </Pressable>
                    <Pressable onPress={() => openPending(row)} style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <View style={[styles.kindPill, { backgroundColor: tone.bg }]}>
                          <Text style={[styles.kindPillText, { color: tone.fg }]}>{kindLabel(row.kind)}</Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }} numberOfLines={2}>
                        {row.raw_snippet || row.notes || 'Alert'}
                      </Text>
                    </Pressable>
                    <Text style={{ color: colors.text, fontWeight: '800' }}>
                      {fmt(row.amount)}
                    </Text>
                  </View>
                )
              })}
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, iosShadow]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Paste</Text>
          <TextInput
            value={paste}
            onChangeText={setPaste}
            placeholder="Paste bank SMS or alert…"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <PrimaryButton
            title="Detect"
            onPress={() => void onDetect()}
            disabled={!paste.trim() || busy}
            loading={busy && !draft}
          />
        </View>

        {draft && parsed ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, iosShadow]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Review{pendingId ? ` · #${pendingId}` : ''}
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.kindPill, { backgroundColor: kindTone(parsed.kind, colors).bg }]}>
                <Text style={[styles.kindPillText, { color: kindTone(parsed.kind, colors).fg }]}>
                  {kindLabel(parsed.kind)}
                </Text>
              </View>
              <View style={[
                styles.confPill,
                {
                  backgroundColor: mustPickType || parsed.confidence < 0.5 ? colors.warningBg : colors.surfaceMuted,
                  borderColor: mustPickType || parsed.confidence < 0.5 ? colors.warningBorder : colors.border,
                },
              ]}>
                <Text style={{
                  color: mustPickType || parsed.confidence < 0.5 ? colors.warning : colors.textMuted,
                  fontSize: 11,
                  fontWeight: '700',
                }}>
                  {Math.round(parsed.confidence * 100)}%
                </Text>
              </View>
            </View>

            {mustPickType ? (
              <View style={[styles.warn, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder, marginBottom: 12 }]}>
                <Text style={{ color: colors.warning, fontWeight: '800' }}>Confirm the type below</Text>
                <Pressable onPress={() => setTypeConfirmed(true)} style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>Confirmed</Text>
                </Pressable>
              </View>
            ) : null}
            {peopleHint ? (
              <View style={[styles.infoBox, { backgroundColor: colors.infoBg, marginBottom: 10 }]}>
                <Text style={{ color: colors.infoText, fontSize: 12, fontWeight: '600' }}>{peopleHint}</Text>
              </View>
            ) : null}

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

            <Text style={[styles.label, { color: colors.textMuted }]}>Amount</Text>
            <TextInput
              value={String(draft.amount)}
              onChangeText={(t) => patchDraft({ amount: Number(t.replace(/,/g, '')) || 0 })}
              keyboardType="decimal-pad"
              style={[styles.inputSingle, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />

            <DateField label="Date" value={draft.date} onChange={(date) => patchDraft({ date })} />

            <SelectField
              label="Wallet"
              value={draft.bankAccountId != null ? String(draft.bankAccountId) : ''}
              options={banks.map((w) => ({ value: String(w.id), label: w.name }))}
              onChange={(v) => patchDraft({ bankAccountId: Number(v) })}
              placeholder="Select…"
            />

            {draft.kind === 'atm' ? (
              <View style={{ marginBottom: 12 }}>
                <View style={[styles.toggleCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={{ flex: 1, color: colors.text, fontWeight: '600', fontSize: 13 }}>
                    Record as expense
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
                    <View style={[styles.warn, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                        No Cash wallet — approving will create one.
                      </Text>
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

            <View style={[styles.toggleCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={{ flex: 1, color: colors.text, fontWeight: '600', fontSize: 13 }}>
                Remember wallet
              </Text>
              <Switch value={rememberWallet} onValueChange={setRememberWallet} />
            </View>
            <View style={[styles.toggleCard, { borderColor: colors.border, backgroundColor: colors.background, marginBottom: 12 }]}>
              <Text style={{ flex: 1, color: colors.text, fontWeight: '600', fontSize: 13 }}>
                Remember type
              </Text>
              <Switch value={rememberKind} onValueChange={setRememberKind} />
            </View>

            <PrimaryButton
              title={BANK_SMS_UX.approve}
              onPress={() => void onApprove()}
              disabled={busy || !pendingId || mustPickType}
              loading={busy}
            />
            <Pressable onPress={() => void onReject()} style={{ marginTop: 14, alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ color: colors.danger, fontWeight: '700' }}>{BANK_SMS_UX.reject}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, iosShadow]}>
          <Pressable onPress={() => setShowMapping((v) => !v)} style={styles.sectionHead}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0, flex: 1 }]}>Wallet mapping</Text>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
              {showMapping ? 'Hide' : 'Show'}
            </Text>
          </Pressable>

          {showMapping ? (
            <>
              <SelectField
                label="Default Cash (ATM)"
                value={defaultCashId != null ? String(defaultCashId) : ''}
                options={[
                  { value: '', label: 'First Cash wallet' },
                  ...cashWallets.map((w) => ({ value: String(w.id), label: w.name })),
                ]}
                onChange={(v) => void saveDefaultCash(v)}
              />

              <Text style={[styles.label, { color: colors.textMuted }]}>Last-4</Text>
              <TextInput
                value={aliasMask}
                onChangeText={setAliasMask}
                placeholder="2554"
                placeholderTextColor={colors.textMuted}
                style={[styles.inputSingle, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />
              <Text style={[styles.label, { color: colors.textMuted }]}>Bank</Text>
              <TextInput
                value={aliasHint}
                onChangeText={setAliasHint}
                placeholder="meezan"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={[styles.inputSingle, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />
              <SelectField
                label="Wallet"
                value={aliasWalletId}
                options={banks.map((w) => ({ value: String(w.id), label: w.name }))}
                onChange={setAliasWalletId}
                placeholder="Select…"
              />
              <PrimaryButton title="Save" onPress={() => void saveAlias()} disabled={busy} />

              {aliases.length > 0 ? (
                aliases.map((a, i) => {
                  const w = wallets.find((x) => x.id === a.account_id)
                  return (
                    <View key={`${a.account_id}-${a.mask}-${a.hint}-${i}`} style={[styles.aliasRow, { borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '800' }}>{w?.name || `Wallet #${a.account_id}`}</Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {a.mask ? (
                            <View style={[styles.aliasChip, { borderColor: colors.border, backgroundColor: colors.background }]}>
                              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>…{a.mask}</Text>
                            </View>
                          ) : null}
                          {a.hint ? (
                            <View style={[styles.aliasChip, { borderColor: colors.border, backgroundColor: colors.background }]}>
                              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>{a.hint}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <Pressable onPress={() => void removeAlias(i)} hitSlop={8}>
                        <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>Remove</Text>
                      </Pressable>
                    </View>
                  )
                })
              ) : null}
            </>
          ) : null}
        </View>
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
      paddingBottom: 10,
    },
    backBtn: { width: 56 },
    title: { ...typography.title, fontSize: 18, fontWeight: '800', textAlign: 'center', flex: 1 },
    pad: { padding: spacing.md, paddingBottom: 56, gap: 12 },
    label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8 },
    input: {
      minHeight: 118,
      borderWidth: 1,
      borderRadius: radii.md,
      padding: 12,
      textAlignVertical: 'top',
      marginBottom: 12,
      fontSize: 14,
      lineHeight: 20,
    },
    inputSingle: {
      borderWidth: 1,
      borderRadius: radii.md,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 10,
      fontSize: 15,
    },
    card: {
      borderWidth: 1,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    countPill: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    countPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    batchRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 14,
      marginBottom: 10,
    },
    pendingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderWidth: 1,
      borderRadius: radii.md,
    },
    checkBox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkMark: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 14 },
    kindPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    kindPillText: { fontSize: 11, fontWeight: '800' },
    confPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
      flexWrap: 'wrap',
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    toggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderRadius: radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
    },
    warn: {
      borderWidth: 1,
      borderRadius: radii.md,
      padding: 12,
      marginTop: 4,
    },
    infoBox: {
      borderRadius: radii.md,
      padding: 10,
    },
    okBox: {
      borderWidth: 1,
      borderRadius: radii.md,
      padding: 12,
    },
    aliasRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    aliasChip: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
  })
}
