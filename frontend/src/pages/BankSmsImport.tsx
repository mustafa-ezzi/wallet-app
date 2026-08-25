import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquareText, X } from 'lucide-react'
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
import { accountsApi, asList, apiErrorMessage } from '../api/client'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/categories'
import { useOffline } from '../offline'

type Acc = { id: number; name: string; type: string }

const KINDS: { value: BankSmsKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'atm', label: 'ATM (cash out)' },
  { value: 'income', label: 'Received' },
  { value: 'reversal', label: 'Reversed' },
]

export default function BankSmsImportPage() {
  const navigate = useNavigate()
  const { queueTransaction, hydrateNow, getCachedAccounts } = useOffline()

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
    if (!draft) return EXPENSE_CATEGORIES
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
    if (draft.kind === 'atm' && !draft.recordAtmAsExpense && !draft.cashAccountId && !draft.createCashNamed) {
      setError('Pick a Cash wallet or create one.')
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
        await hydrateNow()
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

      <div className="glass" style={{ padding: '1.1rem 1.15rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.65rem' }}>
          <MessageSquareText size={16} strokeWidth={1.75} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Message</h3>
        </div>
        <p className="text-muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          {BANK_SMS_UX.privacyBlurb}
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={BANK_SMS_UX.pastePlaceholder}
          rows={5}
          style={{ width: '100%', resize: 'vertical', marginBottom: '0.75rem' }}
        />
        <button type="button" className="btn-primary" disabled={!paste.trim() || busy} onClick={onDetect}>
          {BANK_SMS_UX.parseButton}
        </button>
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div> : null}
      {okMsg ? <div className="auth-success" style={{ marginBottom: '1rem' }}>{okMsg}</div> : null}

      {draft && parsed ? (
        <div className="glass" style={{ padding: '1.1rem 1.15rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ marginTop: 0 }}>{BANK_SMS_UX.reviewTitle}</h3>
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
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                      {BANK_SMS_UX.atmCreateCash}: will create “{draft.createCashNamed || 'Cash'}”.
                    </p>
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
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void onApprove()}>
              {busy ? <span className="spinner" /> : BANK_SMS_UX.approve}
            </button>
            <button
              type="button"
              className="btn-glass"
              disabled={busy}
              onClick={() => { setDraft(null); setParsed(null) }}
            >
              {BANK_SMS_UX.reject}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
