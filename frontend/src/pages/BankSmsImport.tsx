import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquareText, X } from 'lucide-react'
import {
  BANK_SMS_UX,
  buildApproveDraft,
  parseBankSms,
  type ApproveDraft,
  type BankSmsKind,
  type ParsedBankSms,
  type WalletLike,
} from '../lib/bank-sms-parser'
import {
  accountsApi,
  asList,
  apiErrorMessage,
  bankSmsApi,
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
      /* offline — inbox empty */
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
      setOkMsg(`Saved to pending queue (#${res.data.id}). Approve here or on another device.`)
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
      await hydrateNow()
      await loadWallets()
      await loadPending()
      setOkMsg(
        `Approved #${res.data.id}`
        + (res.data.created_transaction_ids?.length
          ? ` · txs ${res.data.created_transaction_ids.join(', ')}`
          : ''),
      )
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
        <div className="page-header-left">
          <h1>{BANK_SMS_UX.pasteTitle}</h1>
          <p className="page-subtitle">{BANK_SMS_UX.pasteHint}</p>
        </div>
        <button className="btn-glass" type="button" onClick={() => navigate('/settings')}>
          <X size={14} strokeWidth={2} /> Close
        </button>
      </div>

      {pending.length > 0 ? (
        <div className="glass" style={{ padding: '1.1rem 1.15rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.95rem' }}>
            Pending inbox ({pending.length})
          </h3>
          <div className="list">
            {pending.map((row) => (
              <button
                key={row.id}
                type="button"
                className="list-item"
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => openPending(row)}
              >
                <div>
                  <strong>#{row.id} · {row.kind}</strong>
                  <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                    {row.raw_snippet || row.notes || 'Bank SMS'} · {row.source}
                  </div>
                </div>
                <strong>{fmt(row.amount)}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="glass" style={{ padding: '1.1rem 1.15rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.65rem' }}>
          <MessageSquareText size={16} strokeWidth={1.75} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Paste new</h3>
        </div>
        <p className="text-muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          {BANK_SMS_UX.privacyBlurb} Detected drafts sync to your pending inbox (web + mobile).
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={BANK_SMS_UX.pastePlaceholder}
          rows={5}
          style={{ width: '100%', resize: 'vertical', marginBottom: '0.75rem' }}
        />
        <button type="button" className="btn-primary" disabled={!paste.trim() || busy} onClick={() => void onDetect()}>
          {BANK_SMS_UX.parseButton}
        </button>
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {okMsg ? <div className="auth-success" style={{ marginBottom: '1rem' }}>{okMsg}</div> : null}

      {draft && parsed ? (
        <div className="glass" style={{ padding: '1.1rem 1.15rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ marginTop: 0 }}>
            {BANK_SMS_UX.reviewTitle}
            {pendingId ? <span className="text-muted" style={{ fontWeight: 600 }}> · #{pendingId}</span> : null}
          </h3>
          <p className="text-muted" style={{ fontSize: '0.78rem' }}>
            Detected as <strong>{parsed.kind}</strong> · confidence {Math.round(parsed.confidence * 100)}% · {parsed.reason}
          </p>

          <div className="form-group" style={{ marginTop: '0.85rem' }}>
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
              <input
                type="date"
                value={draft.date}
                onChange={(e) => patchDraft({ date: e.target.value })}
              />
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={draft.recordAtmAsExpense}
                  onChange={(e) => patchDraft({ recordAtmAsExpense: e.target.checked })}
                />
                {BANK_SMS_UX.atmAsExpense}
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
                  <div className="auth-error" style={{ marginBottom: 0 }}>
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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button type="button" className="btn-primary" disabled={busy || !pendingId} onClick={() => void onApprove()}>
              {busy ? <span className="spinner" /> : BANK_SMS_UX.approve}
            </button>
            <button type="button" className="btn-glass" disabled={busy} onClick={() => void onReject()}>
              {BANK_SMS_UX.reject}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
