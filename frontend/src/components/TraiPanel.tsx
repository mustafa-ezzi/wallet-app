import { FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, Send, X } from 'lucide-react'
import { accountsApi, botApi, type BotTurnResult } from '../api/client'
import CrystalizedBall from './CrystalizedBall'
import { handsFreeAfter, stopHandsFree, transcriptMessage, voiceErrorLine } from '../lib/traiVoice'
import { wakeCommand } from '../lib/traiWake'
import { isThemeId } from '../theme/themes'
import { useTheme } from '../theme/useTheme'
import { useTravelMode } from '../travel/TravelModeContext'

type Wallet = { id: number; name: string; type: string }
type Card = {
  draftId: number
  amount: string
  accountId: number | null
  category: string
  notes: string
  summary?: string
}
type ReadLine = { label: string; amount: string; emphasis?: boolean }
type ReadBlock = { title: string; lines: ReadLine[]; breakdown?: ReadLine[]; breakdownTitle?: string; note?: string }
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
  { label: 'What was my recent transaction?', text: 'What was my recent transaction?' },
  { label: "What's my balance?", text: "What's my balance?" },
  { label: 'Mark rent paid', text: 'Mark rent paid' },
  { label: 'Switch to Ocean', text: 'Switch to Ocean' },
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

type BrowserSpeechRecognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function speechRecognition(): BrowserSpeechRecognition | null {
  const host = window as Window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition
  }
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
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
  if (action.action === 'category_spent' || action.action === 'budget_status') {
    const rows = action.action === 'budget_status' ? (action.items || []) : []
    if (action.action === 'budget_status' && rows.length) {
      const [first, ...rest] = rows
      return {
        title: action.category || 'Budget',
        lines: [{ label: first.label, amount: first.amount, emphasis: true }],
        breakdown: rest.map(row => ({ label: row.label, amount: row.amount })),
        breakdownTitle: action.month_label || 'This month',
      }
    }
    return {
      title: action.category || 'Category',
      lines: [{ label: 'Spent', amount: action.amount || '0', emphasis: true }],
    }
  }
  if (action.action === 'recent_transaction' || action.action === 'balance') {
    const rows = action.items || []
    if (!rows.length) return null
    const [first, ...rest] = rows
    return {
      title: action.month_label || 'Latest',
      lines: [{ label: first.label, amount: first.amount, emphasis: true }],
      breakdown: rest.map(row => ({ label: row.label, amount: row.amount })),
      breakdownTitle: action.action === 'balance' ? 'Wallets' : 'Before that',
      note: first.detail || undefined,
    }
  }
  return null
}

export default function TraiPanel({ onSaved }: { onSaved: () => void }) {
  const navigate = useNavigate()
  const { setTheme, theme } = useTheme()
  const { refresh: refreshTravel } = useTravelMode()
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState<Card | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [wallets, setWallets] = useState<Wallet[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)
  const saving = useRef(false)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const heardRef = useRef('')
  const ignoreEndRef = useRef(false)
  const handsFreeRef = useRef(false)
  const missesRef = useRef(0)
  const listenGen = useRef(0)
  const [handsFree, setHandsFree] = useState(false)
  const [linger, setLinger] = useState(false)
  const sendRef = useRef<(raw: string) => void>(() => {})
  const wakeRef = useRef<BrowserSpeechRecognition | null>(null)
  const micUnlocked = useRef(false)
  const beginVoiceRef = useRef<(command: string) => void>(() => {})
  const lingerTimer = useRef<number | null>(null)

  const endHandsFree = (holdReply = false) => {
    listenGen.current += 1
    handsFreeRef.current = false
    setHandsFree(false)
    ignoreEndRef.current = true
    try {
      recognitionRef.current?.abort()
    } catch {
      // The recognizer already finished.
    }
    try {
      wakeRef.current?.abort()
    } catch {
      // Wake listening was not running.
    }
    setListening(false)
    setText('')
    if (lingerTimer.current) window.clearTimeout(lingerTimer.current)
    if (holdReply) {
      setLinger(true)
      lingerTimer.current = window.setTimeout(() => setLinger(false), 4200)
    } else {
      setLinger(false)
    }
  }

  useEffect(() => {
    if (!open && !handsFree) return
    accountsApi.list().then(res => {
      const rows = Array.isArray(res.data) ? res.data : []
      setWallets(rows.filter((row: Wallet) => row.type !== 'person'))
    }).catch(() => setWallets([]))
    if (open) inputRef.current?.focus()
  }, [open, handsFree])

  useEffect(() => () => {
    ignoreEndRef.current = true
    if (lingerTimer.current) window.clearTimeout(lingerTimer.current)
    try {
      recognitionRef.current?.abort()
    } catch {
      // The recognizer already finished.
    }
    try {
      wakeRef.current?.abort()
    } catch {
      // Wake listening was not running.
    }
  }, [])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, busy, open])

  const push = (turn: Omit<Turn, 'id'>) => {
    const id = nextId.current++
    setTurns(prev => [...prev, { ...turn, id }])
  }

  const applyResult = (data: BotTurnResult) => {
    if (handsFreeRef.current && !handsFreeAfter(data)) endHandsFree(true)
    const action = data.action
    if (data.saved && action?.action === 'set_theme' && isThemeId(action.theme)) setTheme(action.theme)
    if (data.saved && action?.action === 'set_travel') void refreshTravel()
    if (!data.saved && action?.action === 'open_page') {
      const path = {
        home: '/',
        wallets: '/accounts',
        budgets: '/budgets',
        bills: '/expenses',
        reports: '/reports',
        settings: '/settings',
        travel: '/travel-mode',
      }[action.page || '']
      if (path) {
        endHandsFree()
        setOpen(false)
        navigate(path)
      }
    }
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
    const writing = Boolean(action && data.draft_id && action.action !== 'ask' && action.action !== 'refuse')
    if (writing && data.draft_id && action) {
      const card: Card = {
        draftId: data.draft_id,
        amount: action.amount || '',
        accountId: action.account_id,
        category: action.category || '',
        notes: action.notes || '',
        summary: action.summary || '',
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
    listenGen.current += 1
    ignoreEndRef.current = true
    try {
      recognitionRef.current?.abort()
    } catch {
      // The recognizer already finished.
    }
    setListening(false)
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
      if (handsFreeRef.current) startListening()
    }
  }
  sendRef.current = send

  const startListening = () => {
    try {
      wakeRef.current?.abort()
    } catch {
      // Wake listening was not running.
    }
    wakeRef.current = null
    const recognition = speechRecognition()
    if (!recognition) {
      if (!handsFreeRef.current) push({ role: 'trai', text: voiceErrorLine('unavailable') || '' })
      return
    }
    const generation = ++listenGen.current
    heardRef.current = ''
    ignoreEndRef.current = false
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onresult = (event) => {
      let said = ''
      for (let index = 0; index < event.results.length; index += 1) {
        said += event.results[index][0]?.transcript || ''
      }
      const message = transcriptMessage(said)
      heardRef.current = message
      setText(message)
    }
    recognition.onerror = (event) => {
      const keepTranscript = event.error === 'no-speech' || event.error === 'speech-timeout'
      if (!keepTranscript) heardRef.current = ''
      const line = voiceErrorLine(event.error)
      if (!line || heardRef.current) return
      if (!handsFreeRef.current) {
        push({ role: 'trai', text: line })
        return
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        push({ role: 'trai', text: line })
        endHandsFree(true)
      }
    }
    recognitionRef.current = recognition
    let opened = false
    const launch = (attempt: number) => {
      if (generation !== listenGen.current) return
      try {
        recognition.start()
        opened = true
        setListening(true)
      } catch {
        if (attempt < 4 && handsFreeRef.current) {
          window.setTimeout(() => launch(attempt + 1), 280)
          return
        }
        if (!handsFreeRef.current) push({ role: 'trai', text: voiceErrorLine('unavailable') || '' })
      }
    }
    recognition.onend = () => {
      if (!opened || generation !== listenGen.current) return
      setListening(false)
      const message = heardRef.current
      heardRef.current = ''
      if (ignoreEndRef.current) {
        ignoreEndRef.current = false
        return
      }
      if (!message) {
        if (!handsFreeRef.current) return
        missesRef.current += 1
        if (missesRef.current >= 3) {
          missesRef.current = 0
          push({ role: 'trai', text: voiceErrorLine('no-speech') || '' })
          endHandsFree(true)
          return
        }
        startListening()
        return
      }
      missesRef.current = 0
      if (stopHandsFree(message)) {
        endHandsFree()
        return
      }
      if (handsFreeRef.current) setHandsFree(true)
      sendRef.current(message)
    }
    launch(0)
  }

  const toggleMic = () => {
    if (busy) return
    if (listening) {
      handsFreeRef.current = false
      setHandsFree(false)
      recognitionRef.current?.stop()
      return
    }
    if (lingerTimer.current) window.clearTimeout(lingerTimer.current)
    setLinger(false)
    handsFreeRef.current = true
    setHandsFree(true)
    setOpen(false)
    startListening()
  }

  const beginVoice = (command: string) => {
    if (lingerTimer.current) window.clearTimeout(lingerTimer.current)
    setLinger(false)
    handsFreeRef.current = true
    setHandsFree(true)
    setOpen(false)
    missesRef.current = 0
    if (command) sendRef.current(command)
    else {
      push({ role: 'trai', text: "I'm here. What should I write down?" })
      window.setTimeout(() => {
        if (handsFreeRef.current) startListening()
      }, 280)
    }
  }
  beginVoiceRef.current = beginVoice

  useEffect(() => {
    if (open || handsFree || linger) {
      try {
        wakeRef.current?.abort()
      } catch {
        // Wake listening was not running.
      }
      wakeRef.current = null
      return
    }
    let stopped = false
    let denied = false
    let timer: number | null = null
    let pendingCommand: string | null = null
    const arm = () => {
      if (stopped || denied || handsFreeRef.current) return
      const recognition = speechRecognition()
      if (!recognition) return
      recognition.lang = 'en-US'
      recognition.interimResults = false
      recognition.continuous = true
      recognition.onresult = (event) => {
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (!result || result.isFinal === false) continue
          const command = wakeCommand(result[0]?.transcript || '')
          if (command === null) continue
          stopped = true
          pendingCommand = command
          window.setTimeout(() => {
            if (pendingCommand !== command) return
            pendingCommand = null
            beginVoiceRef.current(command)
          }, 700)
          try {
            recognition.stop()
          } catch {
            try {
              recognition.abort()
            } catch {
              pendingCommand = null
              beginVoiceRef.current(command)
            }
          }
          return
        }
      }
      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          denied = true
          stopped = true
        }
        if (event.error === 'aborted' && pendingCommand !== null) {
          const command = pendingCommand
          pendingCommand = null
          beginVoiceRef.current(command)
        }
      }
      recognition.onend = () => {
        if (wakeRef.current === recognition) wakeRef.current = null
        if (pendingCommand !== null) {
          const command = pendingCommand
          pendingCommand = null
          beginVoiceRef.current(command)
          return
        }
        if (stopped || handsFreeRef.current) return
        timer = window.setTimeout(arm, 500)
      }
      wakeRef.current = recognition
      try {
        recognition.start()
      } catch {
        wakeRef.current = null
        if (!stopped) timer = window.setTimeout(arm, 800)
      }
    }
    const kick = () => {
      micUnlocked.current = true
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(arm, 350)
    }
    if (micUnlocked.current) kick()
    else window.addEventListener('pointerdown', kick, { once: true })
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('pointerdown', kick)
      try {
        wakeRef.current?.abort()
      } catch {
        // Wake listening was not running.
      }
      wakeRef.current = null
    }
  }, [open, handsFree, linger])

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
  const stageOn = (handsFree || linger) && !open
  const lastTrai = [...turns].reverse().find(turn => turn.role === 'trai')
  const stageReply = busy ? 'Trai is thinking…' : (lastTrai?.text || 'Listening…')
  const stageDetail = !busy && lastTrai?.read
    ? lastTrai.read.lines.slice(0, 3).map(line => `${line.label} ${money(line.amount)}`).join('   ·   ')
    : !busy && lastTrai?.card?.summary && lastTrai.card.summary !== lastTrai.text
      ? lastTrai.card.summary
      : ''
  const stageHeard = handsFree ? text.trim() : ''

  return (
    <>
      {open ? <button type="button" className="trai-backdrop" aria-label="Close Trai" onClick={() => { endHandsFree(); setOpen(false) }} /> : null}
      {open ? (
        <section className="trai-panel" aria-label="Trai">
          <header className="trai-head">
            <img src="/trai-icon.jpg" alt="" className="trai-mark" />
            <div>
              <strong>Trai</strong>
              <p>Tap the mic and keep talking. Say “yes save it” when the card looks right.</p>
            </div>
            <button type="button" className="trai-close" onClick={() => { endHandsFree(); setOpen(false) }} aria-label="Close">
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
                        <div className="trai-month-kicker">{turn.read.breakdownTitle || 'Where it went'}</div>
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
                    {turn.card.summary ? (
                      <div><b>{turn.card.summary}</b></div>
                    ) : (
                      <>
                        <div><b>{money(turn.card.amount)}</b> · {walletName(turn.card.accountId)}</div>
                        <div>{turn.card.category}{turn.card.notes ? ` · ${turn.card.notes}` : ''}</div>
                      </>
                    )}
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
          {handsFree && open ? (
            <div className="trai-live">
              <span className="trai-live-dot" aria-hidden="true" />
              <span>{busy ? 'Trai is thinking…' : 'Listening'}</span>
              <button type="button" onClick={() => endHandsFree()}>Stop</button>
            </div>
          ) : null}
          <form className="trai-composer" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder={handsFree || listening ? 'Listening… say the bank, or yes save it' : 'Slanty chips, Rp 50, cash'}
              aria-label="Message Trai"
              disabled={busy}
              maxLength={500}
            />
            <button
              type="button"
              className={`trai-mic${listening ? ' listening' : ''}`}
              onClick={toggleMic}
              disabled={busy}
              aria-label={listening ? 'Stop and send' : 'Speak to Trai'}
              aria-pressed={listening}
            >
              <Mic size={16} />
            </button>
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send">
              <Send size={16} />
            </button>
          </form>
        </section>
      ) : null}
      {stageOn ? (
        <div className="trai-stage" role="status" aria-live="polite">
          <p className="trai-stage-reply">{stageReply}</p>
          {stageDetail ? <p className="trai-stage-detail">{stageDetail}</p> : null}
          {stageHeard ? <p className="trai-stage-heard">{stageHeard}</p> : null}
          <button
            type="button"
            className="trai-stage-knot"
            onClick={() => endHandsFree()}
            aria-label={handsFree ? 'Stop listening' : 'Dismiss Trai'}
          >
            <CrystalizedBall
              preset="plasma"
              color={theme.swatch}
              theme="dark"
              size={0.85}
              crackle={0.85}
              fill={0.5}
              interactive
              hoverStrength={0.7}
            />
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="trai-fab"
        aria-label={open ? 'Close Trai' : 'Open Trai'}
        aria-expanded={open}
        onClick={() => {
          if (open) endHandsFree()
          setOpen(value => !value)
        }}
      >
        <img src="/trai-icon.jpg" alt="" />
        {!open && draft ? <span className="trai-dot" aria-label="Confirmation waiting" /> : null}
      </button>
    </>
  )
}
