import { useEffect, useRef, useState } from 'react'
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { accountsApi, botApi, type BotTurnResult } from '@/src/api/client'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useColors } from '@/src/theme/ThemeContext'

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
type Turn = { id: number; role: 'user' | 'trai'; text: string; card?: Card | null; read?: ReadBlock; ask?: boolean }

const EXAMPLES = ['Slanty chips, Rp 50, cash', 'Salary of 50 thousand in Meezan', 'How was my month?']
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
  if (action.action === 'category_spent') {
    return {
      title: action.category || 'Category',
      lines: [{ label: 'Spent', amount: action.amount || '0', emphasis: true }],
    }
  }
  return null
}

/** Robot button on the left. The add button stays on the right. */
export function TraiDock({ bottom }: { bottom: number }) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { bumpRefresh } = useMoneyUi()
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState<Card | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [keyboard, setKeyboard] = useState(0)
  const nextId = useRef(1)
  const inputRef = useRef<TextInput>(null)
  const saving = useRef(false)

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

  useEffect(() => {
    if (!open) return
    accountsApi.list().then(res => {
      const rows = Array.isArray(res.data) ? (res.data as Wallet[]) : []
      setWallets(rows.filter(row => row.type !== 'person'))
    }).catch(() => setWallets([]))
  }, [open])

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
      bumpRefresh()
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

  return (
    <>
      {open ? (
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close Trai" />
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
                Add an expense, mark income, or ask about this month.
              </Text>
            </View>
            <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Close">
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
                        <Text style={[styles.kicker, { color: colors.textMuted }]}>Where it went</Text>
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
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {money(turn.card.amount)} · {walletName(turn.card.accountId)}
                    </Text>
                    <Text style={{ color: colors.textSecondary }}>
                      {turn.card.category}{turn.card.notes ? ` · ${turn.card.notes}` : ''}
                    </Text>
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
          <View style={[styles.composer, { borderTopColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder="Slanty chips, Rp 50, cash"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              editable={!busy}
              maxLength={500}
              onSubmitEditing={() => void send(text)}
            />
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
      <Pressable
        style={[styles.fab, { bottom }]}
        onPress={() => setOpen(value => !value)}
        accessibilityLabel={open ? 'Close Trai' : 'Open Trai'}
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
  send: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
})
