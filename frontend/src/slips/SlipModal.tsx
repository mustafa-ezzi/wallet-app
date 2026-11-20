import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { apiErrorMessage, slipsApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { track } from '../lib/analytics'
import { fmt } from '../utils/format'
import { SLIP_LOGO_DATA_URI } from './logo'
import { printHtml } from './printHtml'
import { buildSlipData, buildSlipShareMessage, DEFAULT_STORE_URL, slipFileName } from './slipData'
import { getSlipTemplate, SLIP_TEMPLATES } from './templates'
import { slipDate, slipLabels } from './templates/shared'
import type { SlipHistoryResponse, SlipKind } from './types'

const TEMPLATE_KEY = 'wallettrails_slip_template_id'

export type SlipTarget = {
  kind: SlipKind
  id: number
  name: string
  highlightTransactionId?: number | null
}

const NAME_KEY = 'wallettrails_slip_prepared_by'

function currencySymbol(code?: string | null): string {
  const c = (code || 'PKR').toUpperCase()
  if (c === 'PKR') return 'Rs'
  return c
}

function isProRequired(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { code?: string } } })?.response
  return res?.status === 403 && res?.data?.code === 'pro_required'
}

async function fetchHistory(target: SlipTarget) {
  if (target.kind === 'payable') return slipsApi.payable(target.id)
  if (target.kind === 'receivable') return slipsApi.receivable(target.id)
  return slipsApi.project(target.id)
}

type Props = {
  target: SlipTarget | null
  onClose: () => void
}

export function SlipModal({ target, onClose }: Props) {
  const { user } = useAuth()
  const [history, setHistory] = useState<SlipHistoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  const [proOnly, setProOnly] = useState(false)
  const [storeUrl, setStoreUrl] = useState(DEFAULT_STORE_URL)
  const [templateId, setTemplateId] = useState(() => getSlipTemplate(localStorage.getItem(TEMPLATE_KEY)).id)

  useEffect(() => {
    if (!target) {
      setHistory(null)
      setError('')
      setBusy(false)
      setHint('')
      setProOnly(false)
      return
    }
    track('slip_opened', { kind: target.kind, surface: 'web' })
    const profileName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
    setName(localStorage.getItem(NAME_KEY) || profileName || user?.username || '')
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const cfg = await slipsApi.config().catch(() => null)
        if (cfg) {
          const url = (cfg.store_url || '').trim()
          if (url) setStoreUrl(url)
          const enforce = cfg.feature_flags?.enforce_pro_slips === true
          const premium = Boolean(user?.is_premium || cfg.viewer?.is_premium)
          if (enforce && !premium) {
            track('slip_pro_required', { kind: target.kind, surface: 'web' })
            setProOnly(true)
            setLoading(false)
            return
          }
        }
        const { data } = await fetchHistory(target)
        setHistory(data)
      } catch (err) {
        if (isProRequired(err)) {
          track('slip_pro_required', { kind: target.kind, surface: 'web' })
          setProOnly(true)
        } else {
          setError(apiErrorMessage(err, 'Could not load the payment history.'))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [target?.kind, target?.id, user])

  if (!target) return null

  const labels = history ? slipLabels(history.direction, history.kind) : null

  const onSavePdf = async () => {
    if (!history) return
    setBusy(true)
    setError('')
    setHint('')
    try {
      const preparedBy = name.trim()
      const data = buildSlipData(history, {
        preparedBy,
        currencySymbol: currencySymbol(user?.currency),
        logoDataUri: SLIP_LOGO_DATA_URI,
        storeUrl,
        highlightTransactionId: target.highlightTransactionId ?? null,
      })
      const html = getSlipTemplate(templateId).render(data)
      const fileName = slipFileName(data.counterparty, data.generatedAt)
      track('slip_generated', { kind: target.kind, rows: data.payments.length, surface: 'web', template: templateId })
      await printHtml(html, fileName)
      if (preparedBy) localStorage.setItem(NAME_KEY, preparedBy)
      track('slip_shared', { kind: target.kind, rows: data.payments.length, surface: 'web', template: templateId })
      setHint('Use Save as PDF in the print dialog.')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not open the print dialog.'))
    } finally {
      setBusy(false)
    }
  }

  const onCopyMessage = async () => {
    if (!history) return
    setBusy(true)
    setError('')
    setHint('')
    try {
      const data = buildSlipData(history, {
        preparedBy: name.trim(),
        currencySymbol: currencySymbol(user?.currency),
        logoDataUri: SLIP_LOGO_DATA_URI,
        storeUrl,
        highlightTransactionId: target.highlightTransactionId ?? null,
      })
      await navigator.clipboard.writeText(buildSlipShareMessage(data))
      track('slip_message_copied', { kind: target.kind, surface: 'web' })
      setHint('Share message copied. Paste it with the PDF.')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not copy the message.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet" style={{ maxWidth: 520, width: '100%' }}>
        <div className="modal-header">
          <h2>{proOnly ? 'WalletTrails Pro' : 'Payment slip'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {proOnly ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p className="text-muted" style={{ margin: 0, lineHeight: 1.5 }}>
              Payment slips are part of WalletTrails Pro. Share a clean PDF record of every payment on a loan or
              installment plan, with the remaining amount at the end.
            </p>
            <button type="button" className="btn-primary" onClick={onClose}>
              OK
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>{target.name}</div>
            {error ? <div className="auth-error">{error}</div> : null}
            {loading && !history ? <div className="text-muted">Loading…</div> : null}

            {history && labels ? (
              <>
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 0.9rem',
                    background: 'var(--surface-muted, rgba(0,0,0,0.03))',
                  }}
                >
                  <Row label="Total amount" value={fmt(history.total_amount)} />
                  <Row label={labels.totalPaidLabel} value={fmt(history.total_paid)} />
                  <Row label={labels.remainingLabel} value={fmt(history.remaining_amount)} strong />
                </div>

                {history.paid_in_full ? (
                  <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.82rem' }}>
                    ✓ {history.direction === 'owe' ? 'Paid in full' : 'Received in full'}
                  </div>
                ) : null}
                {history.closed_without_full_payment ? (
                  <div style={{ color: '#b45309', fontWeight: 700, fontSize: '0.82rem' }}>
                    This record was closed without full payment.
                  </div>
                ) : null}

                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '52px 1fr auto',
                      gap: '0.5rem',
                      padding: '0.55rem 0.75rem',
                      background: 'var(--primary-dark, #04333b)',
                      color: '#fff',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span>S.No</span>
                    <span>Payment date</span>
                    <span>{labels.paymentColumn}</span>
                  </div>
                  {history.payments.length === 0 ? (
                    <div className="text-muted" style={{ textAlign: 'center', padding: '1.1rem' }}>
                      {labels.emptyText}
                    </div>
                  ) : (
                    history.payments.map((p) => {
                      const hl =
                        target.highlightTransactionId != null
                        && p.transaction_id === target.highlightTransactionId
                      return (
                        <div
                          key={`${p.index}-${p.transaction_id ?? 'adv'}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '52px 1fr auto',
                            gap: '0.5rem',
                            padding: '0.55rem 0.75rem',
                            borderTop: '1px solid var(--border)',
                            background: hl ? 'rgba(15,157,110,0.1)' : undefined,
                            fontSize: '0.85rem',
                          }}
                        >
                          <span className="text-muted">{p.index}</span>
                          <span>
                            {slipDate(p.date)}
                            {p.is_advance ? (
                              <span style={{ marginLeft: 6, color: 'var(--info-text, #2f4fa8)', fontSize: '0.72rem', fontWeight: 700 }}>
                                Advance
                              </span>
                            ) : null}
                          </span>
                          <span style={{ fontWeight: 700 }}>{fmt(p.amount)}</span>
                        </div>
                      )
                    })
                  )}
                </div>

                <div>
                  <div className="text-muted" style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                    Template
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {SLIP_TEMPLATES.map((t) => {
                      const active = t.id === templateId
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={active ? 'btn-primary' : 'btn-glass'}
                          style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                          onClick={() => {
                            setTemplateId(t.id)
                            localStorage.setItem(TEMPLATE_KEY, t.id)
                            track('slip_template_selected', { template: t.id, surface: 'web' })
                          }}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
                  <span className="text-muted">Your name (shown on the slip)</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    placeholder="Your name"
                    autoCapitalize="words"
                  />
                </label>

                <button type="button" className="btn-primary" disabled={busy} onClick={() => void onSavePdf()}>
                  {busy ? <span className="spinner" /> : 'Save as PDF'}
                </button>
                <button
                  type="button"
                  className="btn-glass"
                  disabled={busy}
                  onClick={() => void onCopyMessage()}
                  style={{ width: '100%' }}
                >
                  Copy share message
                </button>
                {hint ? <div className="text-muted" style={{ fontSize: '0.78rem', textAlign: 'center' }}>{hint}</div> : null}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', gap: '0.75rem' }}>
      <span className="text-muted" style={{ fontSize: '0.82rem' }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 700, fontSize: strong ? '0.95rem' : '0.85rem' }}>{value}</span>
    </div>
  )
}
