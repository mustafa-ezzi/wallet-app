import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startAndroidInstallTour } from '../components/AndroidInstallTour'
import {
  Check,
  Inbox,
  Link2,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react'
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
} from '../lib/bank-sms-parser'
import {
  accountsApi,
  asList,
  apiErrorMessage,
  bankSmsApi,
  peopleApi,
  type BankSmsImportRow,
} from '../api/client'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/categories'
import { useOffline } from '../offline'
import { fmt, toMoney } from '../utils/format'

type Acc = { id: number; name: string; type: string }

const KINDS: { value: BankSmsKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'atm', label: 'ATM (cash out)' },
  { value: 'income', label: 'Received' },
  { value: 'reversal', label: 'Reversed' },
]

function kindBadgeClass(kind: string): string {
  if (kind === 'income') return 'badge badge-green'
  if (kind === 'atm') return 'badge badge-blue'
  if (kind === 'reversal') return 'badge badge-yellow'
  if (kind === 'expense') return 'badge badge-red'
  return 'badge badge-gray'
}

function kindLabel(kind: string): string {
  return KINDS.find((k) => k.value === kind)?.label || kind
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

export default function BankSmsImportPage() {
  const navigate = useNavigate()
  const { hydrateNow, getCachedAccounts } = useOffline()

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
      /* offline — inbox empty */
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
      setOkMsg(`Saved to pending queue (#${res.data.id}). Approve here or on another device.`)
      if (needsManualTypePick(p)) {
        setOkMsg((m) => `${m} Low confidence — confirm the type before approving.`)
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not sync pending draft. Check your connection.'))
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const patchDraft = (patch: Partial<ApproveDraft>) => {
    setDraft((prev: ApproveDraft | null) => (prev ? { ...prev, ...patch } : prev))
  }

  const categoryOptions = useMemo(() => {
    if (!draft) return EXPENSE_CATEGORIES
    if (draft.kind === 'income' || draft.kind === 'reversal') return INCOME_CATEGORIES
    if (draft.kind === 'atm' && !draft.recordAtmAsExpense) return []
    return EXPENSE_CATEGORIES
  }, [draft])

  const onApprove = async () => {
    if (!draft || !pendingId) {
      setError('Detect and sync a message first (or open one from the pending inbox).')
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
      await hydrateNow()
      await loadWallets()
      await loadPending()
      await loadSettings()
      setOkMsg(
        `Approved #${res.data.id}`
        + (res.data.created_transaction_ids?.length
          ? ` · txs ${res.data.created_transaction_ids.join(', ')}`
          : '')
        + (res.data.linked_import ? ` · linked original #${res.data.linked_import}` : '')
        + (rememberWallet ? ' · wallet remembered' : '')
        + (rememberKind ? ' · type correction saved' : ''),
      )
      setPaste('')
      setParsed(null)
      setDraft(null)
      setPendingId(null)
      setTypeConfirmed(false)
      setRememberKind(false)
      setPeopleHint(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not approve this draft.'))
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
    const next: WalletAlias[] = [
      ...aliases.filter((a) => {
        if (aliasMask && a.mask === aliasMask.replace(/\D/g, '').slice(-4)) return false
        if (aliasHint && a.hint === aliasHint.toLowerCase().replace(/[^a-z0-9]/g, '') && !a.mask) return false
        return true
      }),
    ]
    if (aliasMask.trim()) {
      next.push({ account_id: Number(aliasWalletId), mask: aliasMask.replace(/\D/g, '').slice(-4) })
    }
    if (aliasHint.trim()) {
      next.push({
        account_id: Number(aliasWalletId),
        hint: aliasHint.toLowerCase().replace(/[^a-z0-9]/g, ''),
      })
    }
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
    const cashId = id ? Number(id) : null
    setBusy(true)
    try {
      const res = await bankSmsApi.updateSettings({ default_cash_wallet_id: cashId })
      setDefaultCashId(res.data.default_cash_wallet_id ?? null)
      setOkMsg('Default Cash wallet updated.')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update default Cash.'))
    } finally {
      setBusy(false)
    }
  }

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const onBatchApprove = async () => {
    if (!selectedIds.length) return
    setBusy(true)
    setError('')
    try {
      const res = await bankSmsApi.batchApprove({ ids: selectedIds })
      await hydrateNow()
      await loadPending()
      setSelectedIds([])
      const errN = res.data.errors?.length || 0
      setOkMsg(`Batch approved ${res.data.approved.length}${errN ? ` · ${errN} failed` : ''}.`)
      if (errN) setError(res.data.errors.map((e) => `#${e.id}: ${e.detail}`).join(' · '))
    } catch (err) {
      setError(apiErrorMessage(err, 'Batch approve failed.'))
    } finally {
      setBusy(false)
    }
  }

  const onBatchReject = async () => {
    if (!selectedIds.length) return
    setBusy(true)
    setError('')
    try {
      const res = await bankSmsApi.batchReject({ ids: selectedIds })
      await loadPending()
      setSelectedIds([])
      setOkMsg(`Rejected ${res.data.rejected_count} item(s).`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Batch reject failed.'))
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
    setError('')
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
    <div className="page">
      <div className="page-header">
        <div className="page-header-left bsms-hero">
          <div className="bsms-hero-icon" aria-hidden>
            <MessageSquareText size={20} strokeWidth={1.75} />
          </div>
          <div>
            <h1 style={{ margin: 0 }}>{BANK_SMS_UX.settingsTitle}</h1>
            <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
              Paste a bank alert, review the draft, then Approve — nothing posts without you.
            </p>
          </div>
        </div>
        <button className="btn-glass" type="button" onClick={() => navigate('/settings')}>
          <X size={14} strokeWidth={2} /> Close
        </button>
      </div>

      <div className="bsms-layout">
        {error ? <div className="auth-error">{error}</div> : null}
        {okMsg ? <div className="auth-success">{okMsg}</div> : null}

        <section className="glass bsms-panel get-android-promo">
          <div className="bsms-panel-head" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1 }}>
              <div className="bsms-hero-icon" style={{ width: '2.35rem', height: '2.35rem' }} aria-hidden>
                <Smartphone size={17} strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="bsms-panel-title" style={{ marginBottom: '0.25rem' }}>
                  Want auto bank alerts?
                </h2>
                <p className="bsms-panel-sub" style={{ margin: 0 }}>
                  Web can paste &amp; approve. Auto SMS needs the Android app — use the guided walkthrough.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
              onClick={() => startAndroidInstallTour(0)}
            >
              Start walkthrough
            </button>
          </div>
        </section>

        <section className="glass bsms-panel">
          <div className="bsms-panel-head">
            <div>
              <h2 className="bsms-panel-title">
                <Inbox size={16} strokeWidth={2} color="var(--primary)" />
                Pending inbox
                {pending.length > 0 ? <span className="bsms-count">{pending.length}</span> : null}
              </h2>
              <p className="bsms-panel-sub">Synced from mobile & web. Select several to batch approve.</p>
            </div>
            {pending.length > 0 ? (
              <div className="bsms-batch">
                <button
                  type="button"
                  className="btn-glass"
                  style={{ fontSize: '0.78rem' }}
                  disabled={busy || selectedIds.length === pending.length}
                  onClick={() => setSelectedIds(pending.map((p) => p.id))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ fontSize: '0.78rem' }}
                  disabled={busy || !selectedIds.length}
                  onClick={() => void onBatchApprove()}
                >
                  Approve ({selectedIds.length})
                </button>
                <button
                  type="button"
                  className="btn-glass"
                  style={{ fontSize: '0.78rem' }}
                  disabled={busy || !selectedIds.length}
                  onClick={() => void onBatchReject()}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </div>

          {pending.length === 0 ? (
            <div className="bsms-empty">No pending drafts. Paste a bank SMS below to get started.</div>
          ) : (
            <div className="list">
              {pending.map((row) => (
                <div
                  key={row.id}
                  className={`bsms-pending-row${pendingId === row.id ? ' is-active' : ''}`}
                >
                  <input
                    className="bsms-check"
                    type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    onChange={() => toggleSelected(row.id)}
                    aria-label={`Select #${row.id}`}
                  />
                  <button type="button" className="bsms-pending-main" onClick={() => openPending(row)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span className={kindBadgeClass(row.kind)}>{kindLabel(row.kind)}</span>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>#{row.id} · {row.source}</span>
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.raw_snippet || row.notes || 'Bank SMS'}
                    </div>
                  </button>
                  <div className="bsms-pending-amt">{fmt(row.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="glass bsms-panel">
          <div className="bsms-panel-head">
            <div>
              <h2 className="bsms-panel-title">
                <MessageSquareText size={16} strokeWidth={2} color="var(--primary)" />
                Paste bank SMS
              </h2>
              <p className="bsms-panel-sub">{BANK_SMS_UX.privacyBlurb}</p>
            </div>
          </div>
          <textarea
            className="bsms-textarea"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={BANK_SMS_UX.pastePlaceholder}
            rows={5}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!paste.trim() || busy}
            onClick={() => void onDetect()}
          >
            {busy && !draft ? <span className="spinner" /> : BANK_SMS_UX.parseButton}
          </button>
        </section>

        {draft && parsed ? (
          <section className="glass bsms-panel">
            <div className="bsms-panel-head">
              <div>
                <h2 className="bsms-panel-title">
                  <Check size={16} strokeWidth={2} color="var(--primary)" />
                  {BANK_SMS_UX.reviewTitle}
                  {pendingId ? <span className="text-muted" style={{ fontWeight: 600 }}>#{pendingId}</span> : null}
                </h2>
              </div>
            </div>

            <div className="bsms-meta-row">
              <span className={kindBadgeClass(parsed.kind)}>{kindLabel(parsed.kind)}</span>
              <span className={`bsms-conf${mustPickType || parsed.confidence < 0.5 ? ' is-low' : ''}`}>
                {Math.round(parsed.confidence * 100)}% confidence
              </span>
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>{parsed.reason}</span>
            </div>

            {mustPickType ? (
              <div className="bsms-alert warn">
                <span>Type is unclear. Pick the correct type below, then confirm.</span>
                <button type="button" className="btn-glass" style={{ fontSize: '0.75rem', flexShrink: 0 }} onClick={() => setTypeConfirmed(true)}>
                  Confirmed
                </button>
              </div>
            ) : null}
            {peopleHint ? (
              <div className="bsms-alert info">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Link2 size={14} /> {peopleHint}
                </span>
              </div>
            ) : null}

            <div className="form-group">
              <label>Type</label>
              <select
                value={draft.kind}
                onChange={(e) => {
                  const kind = e.target.value as BankSmsKind
                  patchDraft({
                    kind,
                    category: kind === 'atm' ? 'Bank Transfer' : kind === 'income' || kind === 'reversal' ? 'Other' : 'Miscellaneous',
                    recordAtmAsExpense: kind === 'atm' ? draft.recordAtmAsExpense : false,
                  })
                }}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Amount (PKR)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.amount}
                  onChange={(e) => patchDraft({ amount: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={draft.date} onChange={(e) => patchDraft({ date: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label>Bank wallet</label>
              <select
                value={draft.bankAccountId ?? ''}
                onChange={(e) => patchDraft({ bankAccountId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Select wallet…</option>
                {banks.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            {draft.kind === 'atm' ? (
              <div style={{ marginBottom: '0.85rem' }}>
                <label className="bsms-toggle">
                  <input
                    type="checkbox"
                    checked={draft.recordAtmAsExpense}
                    onChange={(e) => patchDraft({ recordAtmAsExpense: e.target.checked })}
                  />
                  <span>{BANK_SMS_UX.atmAsExpense}</span>
                </label>
                {!draft.recordAtmAsExpense ? (
                  cashWallets.length ? (
                    <div className="form-group">
                      <label>Cash wallet (destination)</label>
                      <select
                        value={draft.cashAccountId ?? ''}
                        onChange={(e) => patchDraft({
                          cashAccountId: e.target.value ? Number(e.target.value) : null,
                          createCashNamed: null,
                        })}
                      >
                        {cashWallets.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="bsms-alert warn" style={{ display: 'block' }}>
                      <strong>{BANK_SMS_UX.atmNoCashTitle}</strong>
                      <p style={{ margin: '0.35rem 0 0' }}>{BANK_SMS_UX.atmNoCashBody}</p>
                    </div>
                  )
                ) : null}
              </div>
            ) : null}

            {categoryOptions.length > 0 ? (
              <div className="form-group">
                <label>Category</label>
                <select value={draft.category} onChange={(e) => patchDraft({ category: e.target.value })}>
                  {categoryOptions.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="form-group">
              <label>Notes</label>
              <input value={draft.notes} onChange={(e) => patchDraft({ notes: e.target.value })} />
            </div>

            <label className="bsms-toggle">
              <input type="checkbox" checked={rememberWallet} onChange={(e) => setRememberWallet(e.target.checked)} />
              <span>Always use this bank wallet for matching mask / bank hint</span>
            </label>
            <label className="bsms-toggle">
              <input type="checkbox" checked={rememberKind} onChange={(e) => setRememberKind(e.target.checked)} />
              <span>Always treat similar SMS (same mask / bank) as this type</span>
            </label>

            <div className="bsms-actions">
              <button type="button" className="btn-primary" disabled={busy || !pendingId || mustPickType} onClick={() => void onApprove()}>
                {busy ? <span className="spinner" /> : BANK_SMS_UX.approve}
              </button>
              <button type="button" className="btn-glass" disabled={busy} onClick={() => void onReject()}>
                {BANK_SMS_UX.reject}
              </button>
            </div>
          </section>
        ) : null}

        <section className="glass bsms-panel">
          <div className="bsms-panel-head">
            <div>
              <h2 className="bsms-panel-title">
                <Wallet size={16} strokeWidth={2} color="var(--primary)" />
                Wallet intelligence
              </h2>
              <p className="bsms-panel-sub">
                Map account last-4 or bank name → wallet so future alerts auto-select the right account.
              </p>
            </div>
          </div>

          <div className="form-group">
            <label>Default Cash wallet (ATM destination)</label>
            <select value={defaultCashId ?? ''} onChange={(e) => void saveDefaultCash(e.target.value)}>
              <option value="">First Cash wallet</option>
              {cashWallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label>Last-4 / mask</label>
              <input value={aliasMask} onChange={(e) => setAliasMask(e.target.value)} placeholder="2554" />
            </div>
            <div className="form-group">
              <label>Bank hint</label>
              <input value={aliasHint} onChange={(e) => setAliasHint(e.target.value)} placeholder="meezan" />
            </div>
          </div>
          <div className="form-group">
            <label>Wallet</label>
            <select value={aliasWalletId} onChange={(e) => setAliasWalletId(e.target.value)}>
              <option value="">Select…</option>
              {banks.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void saveAlias()}>
            Save mapping
          </button>

          {aliases.length > 0 ? (
            <div className="list" style={{ marginTop: '0.95rem' }}>
              {aliases.map((a, i) => {
                const w = wallets.find((x) => x.id === a.account_id)
                return (
                  <div key={`${a.account_id}-${a.mask}-${a.hint}-${i}`} className="list-item">
                    <div>
                      <strong>{w?.name || `Wallet #${a.account_id}`}</strong>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        {a.mask ? <span className="bsms-alias-chip">…{a.mask}</span> : null}
                        {a.hint ? <span className="bsms-alias-chip">{a.hint}</span> : null}
                      </div>
                    </div>
                    <button type="button" className="btn-glass" style={{ fontSize: '0.75rem' }} onClick={() => void removeAlias(i)}>
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="bsms-empty" style={{ paddingBottom: 0 }}>No aliases yet — save one after you approve a draft.</p>
          )}

          <p className="text-muted" style={{ fontSize: '0.75rem', margin: '1rem 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} /> OTP and marketing messages are filtered automatically.
          </p>
        </section>
      </div>
    </div>
  )
}
