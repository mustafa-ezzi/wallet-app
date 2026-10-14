import { FormEvent, useEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { accountsApi, botApi, type BotTurnResult } from '../api/client'

type Wallet = { id: number; name: string; type: string }
type Card = {
  draftId: number
  amount: string
  accountId: number | null
  category: string
  notes: string
}
type ReadLine = { label: string; amount: string; emphasis?: boolean }
type ReadBlock = { title: string; lines: ReadLine[]; breakdown?: ReadLine[]; note?: string }
type Turn = {
  id: number
  role: 'user' | 'trai'
  text: string
  card?: Card | null
  read?: ReadBlock
  ask?: boolean
}

const EXAMPLES = [
  { label: 'Slanty chips, Rp 50, cash', text: 'Slanty chips, Rp 50, cash' },
  { label: 'Salary of 50 thousand in Meezan', text: 'Salary of 50 thousand in Meezan' },
  { label: 'How was my month?', text: 'How was my month?' },
]

function errorDetail(err: unknown): { status: number; detail: string } {
  const response = (err as { response?: { status?: number; data?: { detail?: unknown } } }).response
  const status = response?.status ?? 0
  const detail = response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return { status, detail }
  if (status === 429) return { status, detail: 'Trai is resting until tomorrow.' }
  if (status === 503) return { status, detail: 'Trai is unavailable right now.' }
  return { status, detail: 'Trai could not do that.' }
}

function money(amount: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return amount
  const whole = Math.round(value * 100) % 100 === 0
  return `Rs ${whole ? value.toLocaleString('en-PK', { maximumFractionDigits: 0 }) : value.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function isWalletAsk(text: string): boolean {
  return /wallet|which account/i.test(text)
}

function isLatestCard(turns: Turn[], turn: Turn, draftId: number | null | undefined) {
  if (!draftId || turn.card?.draftId !== draftId) return false
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].card?.draftId === draftId) return turns[index].id === turn.id
  }
  return false
}

function readLines(action: BotTurnResult['action']): ReadBlock | null {
  if (!action) return null
  if (action.action === 'month_summary') {
    const net = Number(action.month_net || 0)
    const count = action.expense_count || 0
    return {
      title: action.month_label || 'This month',
      lines: [
        { label: 'Income', amount: action.month_income || '0' },
        { label: 'Expenses', amount: action.month_expense || '0' },
        { label: net < 0 ? 'Over' : 'Left', amount: String(Math.abs(net)), emphasis: true },
      ],
      breakdown: (action.top_categories || []).map(row => ({ label: row.category, amount: row.amount })),
      note: count ? `${count} expense${count === 1 ? '' : 's'}, not counting transfers` : undefined,
    }
  }
  if (action.action === 'category_spent') {
    return {
      title: action.category || 'Category',
      lines: [{ label: 'Spent', amount: action.amount || '0', emphasis: true }],
    }
  }
  return null
}

export default function TraiPanel({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState<Card | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [wallets, setWallets] = useState<Wallet[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)
  const saving = useRef(false)

  useEffect(() => {
    if (!open) return
    accountsApi.list().then(res => {
      const rows = Array.isArray(res.data) ? res.data : []
      setWallets(rows.filter((row: Wallet) => row.type !== 'person'))
    }).catch(() => setWallets([]))
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, busy, open])

  const push = (turn: Omit<Turn, 'id'>) => {
    const id = nextId.current++
    setTurns(prev => [...prev, { ...turn, id }])
  }

  const applyResult = (data: BotTurnResult) => {
    const action = data.action
    const reply = data.reply || data.detail || ''
    if (data.saved) {
      setDraft(null)
      push({ role: 'trai', text: reply || 'Saved.' })
      onSaved()
      return
    }
    const lines = readLines(action)
    if (lines) {
      push({ role: 'trai', text: reply, read: lines })
      return
    }
    const writing = action && ['create_expense', 'create_income', 'mark_recurring_income'].includes(action.action)
    if (writing && data.draft_id && action) {
      const card: Card = {
        draftId: data.draft_id,
        amount: action.amount || '',
        accountId: action.account_id,
        category: action.category || '',
        notes: action.notes || '',
      }
      setDraft(card)
      push({ role: 'trai', text: reply, card })
      return
    }
    if (/^Cancelled\./.test(reply)) setDraft(null)
    push({
      role: 'trai',
      text: reply,
      ask: action?.action === 'ask',
    })
  }

  const textForModel = (message: string) => {
    const last = turns[turns.length - 1]
    if (!last || last.role !== 'trai' || !last.ask) return message
    const earlier: string[] = []
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index]
      if (turn.role === 'trai' && !turn.ask) break
      if (turn.role === 'user') earlier.unshift(turn.text)
    }
    return [...earlier, message].join('. ').slice(0, 500)
  }

  const send = async (raw: string) => {
    const message = raw.trim()
    if (!message || busy) return
    setText('')
    push({ role: 'user', text: message })
    setBusy(true)
    try {
      const { data } = await botApi.message(textForModel(message))
      applyResult(data)
    } catch (err) {
      const { detail } = errorDetail(err)
      push({ role: 'trai', text: detail })
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!draft || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      const { data } = await botApi.confirm(draft.draftId)
      applyResult(data)
    } catch (err) {
      const { detail } = errorDetail(err)
      push({ role: 'trai', text: detail })
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send(text)
  }

  const walletName = (id: number | null) => wallets.find(wallet => wallet.id === id)?.name || 'your wallet'
  const lastAsk = [...turns].reverse().find(turn => turn.role === 'trai' && turn.ask)

  return (
    <>
      {open ? <button type="button" className="trai-backdrop" aria-label="Close Trai" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <section className="trai-panel" aria-label="Trai">
          <header className="trai-head">
            <img src="/trai-icon.jpg" alt="" className="trai-mark" />
            <div>
              <strong>Trai</strong>
              <p>Add an expense, mark income, or ask about this month.</p>
            </div>
            <button type="button" className="trai-close" onClick={() => setOpen(false)} aria-label="Close">
              <X size={18} />
            </button>
          </header>
          <div className="trai-thread" ref={threadRef}>
            {turns.length === 0 && !busy ? (
              <div className="trai-empty">
                {EXAMPLES.map(example => (
                  <button key={example.text} type="button" onClick={() => void send(example.text)}>
                    {example.label}
                  </button>
                ))}
              </div>
            ) : null}
            {turns.map(turn => (
              <div key={turn.id} className={`trai-turn trai-turn-${turn.role}`}>
                <p>{turn.text}</p>
                {turn.read ? (
                  <div className="trai-month">
                    <div className="trai-month-title">{turn.read.title}</div>
                    {turn.read.lines.map(line => (
                      <div key={line.label} className={`trai-month-row${line.emphasis ? ' net' : ''}`}>
                        <span>{line.label}</span>
                        <b>{money(line.amount)}</b>
                      </div>
                    ))}
                    {turn.read.breakdown && turn.read.breakdown.length > 0 ? (
                      <div className="trai-month-split">
                        <div className="trai-month-kicker">Where it went</div>
                        {turn.read.breakdown.map(line => (
                          <div key={line.label} className="trai-month-row">
                            <span>{line.label}</span>
                            <b>{money(line.amount)}</b>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {turn.read.note ? <p className="trai-month-note">{turn.read.note}</p> : null}
                  </div>
                ) : null}
                {turn.card ? (
                  <div className="trai-card">
                    <div><b>{money(turn.card.amount)}</b> · {walletName(turn.card.accountId)}</div>
                    <div>{turn.card.category}{turn.card.notes ? ` · ${turn.card.notes}` : ''}</div>
                    {isLatestCard(turns, turn, draft?.draftId) ? (
                      <>
                        <div className="trai-card-actions">
                          <button type="button" onClick={() => void save()} disabled={busy}>Save</button>
                          <button type="button" onClick={() => inputRef.current?.focus()} disabled={busy}>Change</button>
                        </div>
                        <p className="trai-hint">Before Save: “it was 150”, “put it on Meezan”, “category Grocery”, or “note chips”.</p>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {lastAsk && isWalletAsk(lastAsk.text) && wallets.length > 0 ? (
              <div className="trai-chips">
                {wallets.map(wallet => (
                  <button
                    key={wallet.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (draft) {
                        void send(`put it on ${wallet.name}`)
                        return
                      }
                      const lastUser = [...turns].reverse().find(turn => turn.role === 'user')
                      void send(lastUser ? `${lastUser.text} from ${wallet.name}` : wallet.name)
                    }}
                  >
                    {wallet.name}
                  </button>
                ))}
              </div>
            ) : null}
            {busy ? <p className="trai-thinking">Trai is counting on its fingers…</p> : null}
          </div>
          <form className="trai-composer" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="Slanty chips, Rp 50, cash"
              aria-label="Message Trai"
              disabled={busy}
              maxLength={500}
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send">
              <Send size={16} />
            </button>
          </form>
        </section>
      ) : null}
      <button
        type="button"
        className="trai-fab"
        aria-label={open ? 'Close Trai' : 'Open Trai'}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <img src="/trai-icon.jpg" alt="" />
        {!open && draft ? <span className="trai-dot" aria-label="Confirmation waiting" /> : null}
      </button>
    </>
  )
}
