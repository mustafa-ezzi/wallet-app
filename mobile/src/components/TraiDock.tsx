import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { accountsApi, botApi, type BotTurnResult } from '@/src/api/client'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { subscribeTraiAsk } from '@/src/lib/traiLaunch'
import { handsFreeAfter, stopHandsFree, voiceErrorLine } from '@/src/lib/traiVoice'
import { useReminders } from '@/src/notifications'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'
import { isThemeId } from '@/src/theme/colors'
import { useColors, useTheme } from '@/src/theme/ThemeContext'
import { useTravelMode } from '@/src/travel/TravelModeContext'
import { TraiCrystal } from './TraiCrystal'

type MicButton = typeof import('./TraiMicButton').TraiMicButton
type WakeListener = typeof import('./TraiWakeListener').TraiWakeListener
type Conversation = typeof import('./TraiConversation').TraiConversation
let TraiMicButton: MicButton | null = null
let TraiWakeListener: WakeListener | null = null
let TraiConversation: Conversation | null = null
try {
  TraiMicButton = require('./TraiMicButton').TraiMicButton as MicButton
  TraiWakeListener = require('./TraiWakeListener').TraiWakeListener as WakeListener
  TraiConversation = require('./TraiConversation').TraiConversation as Conversation
} catch {
  TraiMicButton = null
  TraiWakeListener = null
  TraiConversation = null
}

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
type Turn = { id: number; role: 'user' | 'trai'; text: string; card?: Card | null; read?: ReadBlock; ask?: boolean }

const EXAMPLES = [
  'Slanty chips, Rp 50, cash',
  'Salary of 50 thousand in Meezan',
  'How was my month?',
  'What was my recent transaction?',
  "What's my balance?",
  'Mark rent paid',
]
const traiIcon = require('../../assets/images/trai-icon.jpg')

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
  return `Rs ${whole ? value.toLocaleString('en-PK') : value.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

/** Robot button on the left. The add button stays on the right. */
export function TraiDock({ bottom }: { bottom: number }) {
  const colors = useColors()
  const router = useRouter()
  const { setThemeId } = useTheme()
  const privacy = usePrivacyLock()
  const reminders = useReminders()
  const { refresh: refreshTravel } = useTravelMode()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { bumpRefresh } = useMoneyUi()
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState<Card | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [wakeArmed, setWakeArmed] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [linger, setLinger] = useState(false)
  const [preview, setPreview] = useState(false)
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [keyboard, setKeyboard] = useState(0)
  const nextId = useRef(1)
  const inputRef = useRef<TextInput>(null)
  const saving = useRef(false)
  const stopVoiceRef = useRef<() => void>(() => {})
  const sendRef = useRef<(raw: string) => void>(() => {})
  const handsFreeRef = useRef(false)
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearLinger = () => {
    if (lingerTimer.current) clearTimeout(lingerTimer.current)
    lingerTimer.current = null
  }
  const endHandsFree = (holdReply = false) => {
    handsFreeRef.current = false
    setHandsFree(false)
    setText('')
    clearLinger()
    setPreview(false)
    if (holdReply) {
      setLinger(true)
      lingerTimer.current = setTimeout(() => setLinger(false), 4200)
    } else {
      setLinger(false)
    }
  }
  const beginHandsFree = () => {
    clearLinger()
    setLinger(false)
    setPreview(false)
    handsFreeRef.current = true
    setHandsFree(true)
  }

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, event => setKeyboard(event.endCoordinates.height))
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  useEffect(() => subscribeTraiAsk(message => {
    setOpen(true)
    if (message) void sendRef.current(message)
  }), [])

  useEffect(() => {
    if (!open && !handsFree) return
    accountsApi.list().then(res => {
      const rows = Array.isArray(res.data) ? (res.data as Wallet[]) : []
      setWallets(rows.filter(row => row.type !== 'person'))
    }).catch(() => setWallets([]))
  }, [open, handsFree])

  const push = (turn: Omit<Turn, 'id'>) => {
    const id = nextId.current++
    setTurns(prev => [...prev, { ...turn, id }])
  }

  const applyResult = (data: BotTurnResult) => {
    if (handsFreeRef.current && !handsFreeAfter(data)) endHandsFree(true)
    const action = data.action
    if (data.saved && action?.action === 'set_theme' && isThemeId(action.theme)) void setThemeId(action.theme)
    if (data.saved && action?.action === 'set_travel') void refreshTravel()
    if (data.saved && action?.action === 'set_reminder' && action.remind) {
      void reminders.updatePrefs({ enabled: true, leadDue: true })
    }
    if (!data.saved && action?.action === 'hide_amounts') {
      if (privacy.enabled) privacy.lockNow()
      else void privacy.setEnabled(true)
    }
    if (!data.saved && action?.action === 'show_amounts' && privacy.amountsHidden) privacy.openUnlockSheet()
    if (!data.saved && action?.action === 'open_page') {
      const path = {
        home: '/(tabs)',
        wallets: '/(tabs)/wallets',
        budgets: '/(tabs)/budgets',
        bills: '/(tabs)/bills',
        reports: '/(tabs)/reports',
        settings: '/(tabs)/settings',
        travel: '/travel-mode',
      }[action.page || ''] as '/(tabs)' | '/(tabs)/wallets' | '/(tabs)/budgets' | '/(tabs)/bills' | '/(tabs)/reports' | '/(tabs)/settings' | '/travel-mode' | undefined
      if (path) {
        endHandsFree()
        setOpen(false)
        router.push(path)
      }
    }
    const reply = data.reply || data.detail || ''
    if (data.saved) {
      setDraft(null)
      push({ role: 'trai', text: reply || 'Saved.' })
      bumpRefresh()
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
    push({ role: 'trai', text: reply, ask: action?.action === 'ask' })
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
    stopVoiceRef.current()
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
    }
  }
  sendRef.current = send

  const save = async () => {
    if (!draft || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      const { data } = await botApi.confirm(draft.draftId)
      applyResult(data)
    } catch (err) {
      push({ role: 'trai', text: errorDetail(err).detail })
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  const panelBottom = keyboard > 0 ? keyboard + 8 : bottom + 64
  const panelMax = Math.min(height * 0.7, height - panelBottom - insets.top - 16)
  const lastAsk = [...turns].reverse().find(turn => turn.role === 'trai' && turn.ask)
  const walletName = (id: number | null) => wallets.find(wallet => wallet.id === id)?.name || 'your wallet'
  const stageOn = (handsFree || linger || preview) && !open
  const showingPreview = preview && !handsFree
  const lastTrai = [...turns].reverse().find(turn => turn.role === 'trai')
  const stageReply = showingPreview ? 'Which wallet was that?' : (lastTrai?.text || 'Listening…')
  const stageDetail = showingPreview ? 'Rp 250' : lastTrai?.read
    ? lastTrai.read.lines.slice(0, 3).map(line => `${line.label} ${money(line.amount)}`).join('   ·   ')
    : lastTrai?.card?.summary && lastTrai.card.summary !== lastTrai.text
      ? lastTrai.card.summary
      : ''

  return (
    <>
      {open ? (
        <Pressable style={styles.backdrop} onPress={() => { endHandsFree(); setOpen(false) }} accessibilityLabel="Close Trai" />
      ) : null}
      {open ? (
        <View
          style={[
            styles.panel,
            {
              bottom: panelBottom,
              maxHeight: panelMax,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.head}>
            <Image source={traiIcon} style={styles.mark} resizeMode="cover" accessibilityIgnoresInvertColors />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Trai</Text>
              <Text style={[styles.sub, { color: colors.textMuted }]}>
                Say “Hey Trai”, then keep talking. Say “yes save it” when the card looks right.
              </Text>
            </View>
            <Pressable onPress={() => { endHandsFree(); setOpen(false) }} hitSlop={8} accessibilityLabel="Close">
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.thread}
            keyboardShouldPersistTaps="handled"
          >
            {turns.length === 0 && !busy ? (
              <View style={{ gap: 8 }}>
                {EXAMPLES.map(example => (
                  <Pressable key={example} style={[styles.example, { borderColor: colors.border }]} onPress={() => void send(example)}>
                    <Text style={{ color: colors.text }}>{example}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {turns.map(turn => (
              <View
                key={turn.id}
                style={[
                  styles.bubble,
                  turn.role === 'user'
                    ? { alignSelf: 'flex-end', backgroundColor: colors.primarySoft }
                    : { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted },
                ]}
              >
                <Text style={{ color: colors.text }}>{turn.text}</Text>
                {turn.read ? (
                  <View style={[styles.month, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Text style={[styles.monthTitle, { color: colors.textSecondary, backgroundColor: colors.surfaceMuted }]}>
                      {turn.read.title}
                    </Text>
                    {turn.read.lines.map(line => (
                      <View key={line.label} style={styles.monthRow}>
                        <Text style={{ color: colors.text, fontWeight: line.emphasis ? '800' : '500' }}>{line.label}</Text>
                        <Text style={{ color: colors.text, fontWeight: line.emphasis ? '800' : '700' }}>{money(line.amount)}</Text>
                      </View>
                    ))}
                    {turn.read.breakdown && turn.read.breakdown.length > 0 ? (
                      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                        <Text style={[styles.kicker, { color: colors.textMuted }]}>{turn.read.breakdownTitle || 'Where it went'}</Text>
                        {turn.read.breakdown.map(line => (
                          <View key={line.label} style={styles.monthRow}>
                            <Text style={{ color: colors.text, flex: 1 }}>{line.label}</Text>
                            <Text style={{ color: colors.text, fontWeight: '700' }}>{money(line.amount)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {turn.read.note ? (
                      <Text style={{ color: colors.textMuted, fontSize: 12, paddingHorizontal: 10, paddingBottom: 8 }}>{turn.read.note}</Text>
                    ) : null}
                  </View>
                ) : null}
                {turn.card ? (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {turn.card.summary ? (
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{turn.card.summary}</Text>
                    ) : (
                      <>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>
                          {money(turn.card.amount)} · {walletName(turn.card.accountId)}
                        </Text>
                        <Text style={{ color: colors.textSecondary }}>
                          {turn.card.category}{turn.card.notes ? ` · ${turn.card.notes}` : ''}
                        </Text>
                      </>
                    )}
                    {isLatestCard(turns, turn, draft?.draftId) ? (
                      <View style={{ gap: 6 }}>
                        <View style={styles.row}>
                          <Pressable style={[styles.save, { backgroundColor: colors.primary }]} onPress={() => void save()} disabled={busy}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
                          </Pressable>
                          <Pressable style={[styles.change, { borderColor: colors.border }]} onPress={() => inputRef.current?.focus()} disabled={busy}>
                            <Text style={{ color: colors.text }}>Change</Text>
                          </Pressable>
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          Before Save: “it was 150”, “put it on Meezan”, “category Grocery”, or “note chips”.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
            {lastAsk && isWalletAsk(lastAsk.text) ? (
              <View style={styles.chips}>
                {wallets.map(wallet => (
                  <Pressable
                    key={wallet.id}
                    style={[styles.chip, { borderColor: colors.border }]}
                    disabled={busy}
                    onPress={() => {
                      if (draft) {
                        void send(`put it on ${wallet.name}`)
                        return
                      }
                      const lastUser = [...turns].reverse().find(turn => turn.role === 'user')
                      void send(lastUser ? `${lastUser.text} from ${wallet.name}` : wallet.name)
                    }}
                  >
                    <Text style={{ color: colors.text }}>{wallet.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {busy ? <Text style={{ color: colors.textMuted }}>Trai is counting on its fingers…</Text> : null}
          </ScrollView>
          {handsFree && open && TraiConversation ? (
            <TraiConversation
              active={open && !busy}
              busy={busy}
              prompt={turns[turns.length - 1]?.role === 'trai' ? turns[turns.length - 1].text : ''}
              partial={text}
              primary={colors.primary}
              ink={colors.text}
              muted={colors.textMuted}
              hints={wallets.map(wallet => wallet.name)}
              onTranscript={message => {
                if (stopHandsFree(message)) {
                  endHandsFree()
                  return
                }
                void send(message)
              }}
              onPartial={setText}
              onNotice={line => push({ role: 'trai', text: line })}
              onStop={hold => endHandsFree(Boolean(hold))}
            />
          ) : null}
          <View style={[styles.composer, { borderTopColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={handsFree || listening ? 'Listening…' : 'Slanty chips, Rp 50, cash'}
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              editable={!busy}
              maxLength={500}
              onSubmitEditing={() => void send(text)}
            />
            {TraiMicButton && !handsFree ? (
              <TraiMicButton
                busy={busy}
                primary={colors.primary}
                border={colors.border}
                stopRef={stopVoiceRef}
                onTranscript={message => { void send(message) }}
                onPartial={setText}
                onNotice={line => push({ role: 'trai', text: line })}
                onListening={setListening}
              />
            ) : !handsFree ? (
              <Pressable
                style={[styles.mic, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
                disabled={busy}
                onPress={() => push({ role: 'trai', text: voiceErrorLine('unavailable') || '' })}
                accessibilityLabel="Speak to Trai"
              >
                <Ionicons name="mic" size={18} color={colors.primary} />
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.send, { backgroundColor: colors.primary, opacity: busy || !text.trim() ? 0.5 : 1 }]}
              disabled={busy || !text.trim()}
              onPress={() => void send(text)}
              accessibilityLabel="Send"
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Send</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {TraiWakeListener ? (
        <TraiWakeListener
          paused={open || handsFree || linger || preview}
          onArmed={setWakeArmed}
          onWake={command => {
            beginHandsFree()
            if (command) void sendRef.current(command)
            else push({ role: 'trai', text: "I'm here. What should I write down?" })
          }}
        />
      ) : null}
      {stageOn ? (
        <View style={[styles.stage, { bottom: bottom + 8 }]} pointerEvents="box-none">
          <View pointerEvents="none" style={[styles.stageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text numberOfLines={3} style={[styles.stageReply, { color: colors.text }]}>
              {busy ? 'Trai is thinking…' : stageReply}
            </Text>
            {stageDetail ? (
              <Text numberOfLines={2} style={[styles.stageDetail, { color: colors.text }]}>{stageDetail}</Text>
            ) : null}
            {showingPreview ? (
              <Text numberOfLines={2} style={[styles.stageHeard, { color: colors.textMuted }]}>from Meezan bank</Text>
            ) : handsFree && text.trim() ? (
              <Text numberOfLines={2} style={[styles.stageHeard, { color: colors.textMuted }]}>{text.trim()}</Text>
            ) : null}
          </View>
          <Pressable onPress={() => endHandsFree()} accessibilityLabel={handsFree ? 'Stop listening' : 'Dismiss Trai'}>
            <TraiCrystal primary={colors.primary} highlight={colors.primarySoft} />
          </Pressable>
          {handsFree && TraiConversation ? (
            <TraiConversation
              variant="hidden"
              active={!open && !busy}
              busy={busy}
              prompt=""
              partial={text}
              primary={colors.primary}
              ink={colors.text}
              muted={colors.textMuted}
              hints={wallets.map(wallet => wallet.name)}
              onTranscript={message => {
                if (stopHandsFree(message)) {
                  endHandsFree()
                  return
                }
                void send(message)
              }}
              onPartial={setText}
              onNotice={line => push({ role: 'trai', text: line })}
              onStop={hold => endHandsFree(Boolean(hold))}
            />
          ) : null}
        </View>
      ) : null}
      {wakeArmed && !open ? <View pointerEvents="none" style={[styles.wakeRing, { bottom: bottom - 6 }]} /> : null}
      {Platform.OS === 'web' ? (
        <Pressable
          style={[styles.previewBtn, { bottom: bottom + 64, backgroundColor: colors.primary }]}
          onPress={() => {
            if (preview) endHandsFree()
            else {
              setOpen(false)
              setPreview(true)
            }
          }}
          accessibilityLabel="Preview the Trai listening knot"
        >
          <Text style={styles.previewLabel}>{preview ? 'Hide knot' : 'Test knot'}</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={[styles.fab, { bottom }]}
        onPress={() => {
          if (open) endHandsFree()
          setOpen(value => !value)
        }}
        accessibilityLabel={wakeArmed && !open ? 'Trai is listening for Hey Trai' : open ? 'Close Trai' : 'Open Trai'}
      >
        <Image source={traiIcon} style={styles.fabImage} resizeMode="cover" accessibilityIgnoresInvertColors />
        {!open && draft ? <View style={styles.dot} /> : null}
      </Pressable>
    </>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 20,
    zIndex: 50,
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#047857',
    elevation: 12,
  },
  fabImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  previewBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 50,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewLabel: { color: '#fff', fontWeight: '800', fontSize: 13 },
  wakeRing: {
    position: 'absolute',
    left: 14,
    zIndex: 49,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#6ee7b7',
  },
  dot: {
    position: 'absolute',
    zIndex: 1,
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f97316',
    borderWidth: 2,
    borderColor: '#fff',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    zIndex: 42,
  },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 46,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 16,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  mark: { width: 36, height: 36, borderRadius: 18 },
  title: { fontSize: 17, fontWeight: '800' },
  month: { marginTop: 8, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  monthTitle: { paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, fontWeight: '800' },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10, paddingVertical: 4 },
  kicker: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 2, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  sub: { fontSize: 12, marginTop: 2 },
  thread: { paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  example: { borderWidth: 1, borderRadius: 12, padding: 10 },
  bubble: { maxWidth: '92%', borderRadius: 14, padding: 10 },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
  save: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  change: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  composer: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 8 },
  mic: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  send: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  stage: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 44,
    alignItems: 'center',
  },
  stageCard: {
    maxWidth: 280,
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  stageReply: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  stageDetail: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  stageHeard: {
    marginTop: 4,
    fontSize: 14,
    textAlign: 'center',
  },
})
