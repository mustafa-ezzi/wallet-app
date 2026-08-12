import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  accountsApi,
  apiErrorMessage,
  asList,
  peopleApi,
} from '@/src/api/client'
import type {
  Account,
  PeopleActionKind,
  PeopleHistory,
  PeopleLink,
  PeopleProposal,
  Transaction,
} from '@/src/api/types'
import { DateField } from '@/src/components/SelectFields'
import { ErrorBanner, Field, PrimaryButton } from '@/src/components/ui'
import { InvitePersonSheet } from '@/src/people/InvitePersonSheet'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { formatForeignSubtitle, foreignToPkr, formatRateLine } from '@/src/travel/currencies'
import { useTravelMode } from '@/src/travel/TravelModeContext'
import { fmtBalance, todayISO, toMoney } from '@/src/utils/format'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const ACTIONS: {
  key: PeopleActionKind
  label: string
  hint: string
  color: string
  icon: ComponentProps<typeof FontAwesome>['name']
}[] = [
  { key: 'lend', label: 'Lend', hint: 'They owe you', color: '#8b5cf6', icon: 'arrow-up' },
  { key: 'borrow', label: 'Borrow', hint: 'You owe them', color: '#f59e0b', icon: 'arrow-down' },
  { key: 'pay', label: 'Pay', hint: 'Settle your debt', color: '#ef4444', icon: 'send' },
  { key: 'receive', label: 'Receive', hint: 'Collect debt', color: '#22c55e', icon: 'download' },
]

function actionMeta(action?: string | null) {
  return ACTIONS.find((a) => a.key === action) ?? {
    key: 'lend' as PeopleActionKind,
    label: action || 'People',
    hint: '',
    color: '#8b5cf6',
    icon: 'user' as ComponentProps<typeof FontAwesome>['name'],
  }
}

/** Notes look like "Money Lent: Meezan ↔ Hussain · …" */
function counterpartFromNotes(notes: string, personName: string): string {
  const m = /:\s*(.+?)\s*↔/.exec(notes || '')
  if (m?.[1]) return m[1].trim()
  const cleaned = (notes || '').replace(/\s*·\s*.*$/, '').trim()
  if (cleaned && !cleaned.includes(personName)) return cleaned
  return 'Wallet'
}

function directionLabel(action: string | null | undefined, walletName: string, personName: string) {
  switch (action) {
    case 'lend':
    case 'pay':
      return `${walletName} → ${personName}`
    case 'borrow':
    case 'receive':
      return `${personName} → ${walletName}`
    default:
      return `${walletName} ↔ ${personName}`
  }
}

export default function PersonHistoryScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const money = useMaskedMoney()
  const { bumpRefresh, refreshKey } = useMoneyUi()
  const {
    isActive: travelOn,
    currency: travelCurrency,
    rate: travelRate,
    rateLine,
    toPkr,
  } = useTravelMode()

  const { id, name: nameParam } = useLocalSearchParams<{ id: string; name?: string }>()
  const personId = Number(id)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [history, setHistory] = useState<PeopleHistory | null>(null)
  const [wallets, setWallets] = useState<Account[]>([])
  const [link, setLink] = useState<PeopleLink | null>(null)
  const [incomingProposals, setIncomingProposals] = useState<PeopleProposal[]>([])
  const [outgoingProposals, setOutgoingProposals] = useState<PeopleProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [proposalBusyId, setProposalBusyId] = useState<number | null>(null)

  const [sheetAction, setSheetAction] = useState<PeopleActionKind | null>(null)
  const [walletId, setWalletId] = useState('')
  const [acceptWalletId, setAcceptWalletId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [formError, setFormError] = useState('')
  const [convertOpen, setConvertOpen] = useState(false)
  const [unlinkBusy, setUnlinkBusy] = useState(false)

  const personName = history?.person?.name || nameParam || 'Person'
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`
  const pendingNet = toMoney(history?.pending_net)
  const settled = Math.abs(pendingNet) < 0.01
  const isLinked = Boolean(link)

  const load = useCallback(
    async (soft = false) => {
      if (!Number.isFinite(personId) || personId <= 0) {
        setError('Invalid person.')
        setLoading(false)
        return
      }
      if (!soft) setLoading(true)
      setError('')
      try {
        const [hRes, aRes] = await Promise.all([
          peopleApi.history(personId, { year, month }),
          accountsApi.list({ type: 'bank,cash' }),
        ])
        setHistory(hRes.data as PeopleHistory)
        const list = asList<Account>(aRes.data).filter((a) => a.type !== 'person')
        setWallets(list)
        setWalletId((prev) => {
          if (prev && list.some((w) => String(w.id) === prev)) return prev
          return list[0] ? String(list[0].id) : ''
        })
        setAcceptWalletId((prev) => {
          if (prev && list.some((w) => String(w.id) === prev)) return prev
          return list[0] ? String(list[0].id) : ''
        })

        try {
          const [linkRes, propRes] = await Promise.all([
            peopleApi.links(),
            peopleApi.pendingProposals(),
          ])
          const allLinks = asList<PeopleLink>(linkRes.data)
          const mine = allLinks.find((l) => l.my_person?.id === personId) || null
          setLink(mine)
          const linkId = mine?.id
          const incoming = (propRes.data?.incoming || []) as PeopleProposal[]
          const outgoing = (propRes.data?.outgoing || []) as PeopleProposal[]
          setIncomingProposals(linkId ? incoming.filter((p) => p.link === linkId) : [])
          setOutgoingProposals(linkId ? outgoing.filter((p) => p.link === linkId) : [])
        } catch {
          setLink(null)
          setIncomingProposals([])
          setOutgoingProposals([])
        }
      } catch (err) {
        setError(apiErrorMessage(err, 'Could not load person history.'))
        setHistory(null)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [personId, year, month],
  )

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  useFocusEffect(
    useCallback(() => {
      void load(true)
    }, [load]),
  )

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else setMonth((m) => m + 1)
  }

  const openAction = (action: PeopleActionKind) => {
    setSheetAction(action)
    setAmount('')
    setDate(todayISO())
    setNotes('')
    setFormError('')
  }

  const closeSheet = () => {
    if (saving) return
    setSheetAction(null)
    setFormError('')
  }

  const submitAction = async () => {
    if (!sheetAction || savingRef.current) return
    savingRef.current = true
    setFormError('')
    const value = parseFloat(amount.replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setFormError('Enter a valid amount.')
      savingRef.current = false
      return
    }
    if (!walletId) {
      setFormError('Pick a wallet.')
      savingRef.current = false
      return
    }
    const pkrAmount = travelOn ? toPkr(value) : value
    if (travelOn && (!(travelRate > 0) || !(pkrAmount > 0))) {
      setFormError('Travel rate missing. Open Travel Mode and set a rate.')
      savingRef.current = false
      return
    }

    setSaving(true)
    try {
      const fx = travelOn
        ? {
            original_amount: value,
            original_currency: travelCurrency,
            fx_rate: travelRate,
            fx_source: 'manual',
          }
        : {}

      if (link) {
        await peopleApi.propose({
          link_id: link.id,
          action: sheetAction,
          wallet_id: Number(walletId),
          amount: pkrAmount,
          date,
          notes: notes.trim(),
          ...fx,
        })
      } else {
        await peopleApi.action({
          action: sheetAction,
          wallet_id: Number(walletId),
          person_id: personId,
          amount: pkrAmount,
          date,
          notes: notes.trim(),
          ...fx,
        })
      }
      setSheetAction(null)
      bumpRefresh()
      await load(true)
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Could not save.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const respondProposal = async (id: number, action: 'accept' | 'decline') => {
    setProposalBusyId(id)
    setError('')
    try {
      if (action === 'accept') {
        if (!acceptWalletId) {
          setError('Pick a wallet to accept into.')
          return
        }
        await peopleApi.acceptProposal(id, { wallet_id: Number(acceptWalletId) })
      } else {
        await peopleApi.declineProposal(id)
      }
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update proposal.'))
    } finally {
      setProposalBusyId(null)
    }
  }

  const unlink = async () => {
    if (!link) return
    setUnlinkBusy(true)
    setError('')
    try {
      await peopleApi.unlink(link.id)
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not unlink. Settle both sides to zero first.'))
    } finally {
      setUnlinkBusy(false)
    }
  }

  const netStatus = settled
    ? 'No pending debts'
    : pendingNet > 0
      ? 'They owe you'
      : 'You owe them'

  const sheetMeta = sheetAction ? actionMeta(sheetAction) : null

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <FontAwesome name="chevron-left" size={18} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title} numberOfLines={1}>
            {personName}
          </Text>
          <Text style={styles.headerSub}>{isLinked ? 'Linked · History' : 'History'}</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      {!isLinked ? (
        <Pressable style={styles.linkCta} onPress={() => setConvertOpen(true)}>
          <FontAwesome name="link" size={13} color={colors.primaryDark} />
          <Text style={[styles.linkCtaText, { color: colors.primaryDark }]}>
            Invite CashTrail user to link
          </Text>
        </Pressable>
      ) : settled ? (
        <Pressable style={styles.linkCta} onPress={() => void unlink()} disabled={unlinkBusy}>
          {unlinkBusy ? (
            <ActivityIndicator color={colors.primaryDark} size="small" />
          ) : (
            <>
              <FontAwesome name="unlink" size={13} color={colors.textSecondary} />
              <Text style={[styles.linkCtaText, { color: colors.textSecondary }]}>
                Unlink (settled)
              </Text>
            </>
          )}
        </Pressable>
      ) : (
        <Text style={[styles.linkHint, { color: colors.textMuted }]}>
          Settle to zero to unlink
        </Text>
      )}

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void load(true)
            }}
            tintColor={colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.monthNav}>
          <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
            <FontAwesome name="chevron-left" size={14} color={colors.primaryDark} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={8}>
            <FontAwesome name="chevron-right" size={14} color={colors.primaryDark} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && !history ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : history ? (
          <>
            <View style={styles.netCard}>
              <Text style={styles.netLabel}>Pending net</Text>
              <Text
                style={[
                  styles.netValue,
                  money.amountStyle,
                  {
                    color: settled
                      ? 'rgba(255,255,255,0.95)'
                      : pendingNet > 0
                        ? '#86efac'
                        : '#fca5a5',
                  },
                ]}
              >
                {money.fmtBalance(pendingNet)}
              </Text>
              <Text style={styles.netStatus}>{netStatus}</Text>
              <View style={styles.netStats}>
                <View style={styles.netStat}>
                  <Text style={styles.netStatLabel}>Opening</Text>
                  <Text style={[styles.netStatValue, money.amountStyle]}>
                    {money.fmtBalance(history.opening_balance)}
                  </Text>
                </View>
                <View style={styles.netStat}>
                  <Text style={styles.netStatLabel}>Inflow</Text>
                  <Text style={[styles.netStatValue, money.amountStyle]}>
                    {money.fmtBalance(history.inflow)}
                  </Text>
                </View>
                <View style={styles.netStat}>
                  <Text style={styles.netStatLabel}>Outflow</Text>
                  <Text style={[styles.netStatValue, money.amountStyle]}>
                    {money.fmtBalance(history.outflow)}
                  </Text>
                </View>
              </View>
            </View>

            {incomingProposals.length > 0 ? (
              <View style={styles.proposalBox}>
                <Text style={styles.sectionTitle}>Waiting for you</Text>
                <Text style={[styles.hintLine, { color: colors.textMuted }]}>
                  Accept posts the matching entry on your books. Pick the wallet that received (or paid) the money.
                </Text>
                <Text style={styles.fieldLabel}>Your wallet</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletRow}>
                  {wallets.map((w) => {
                    const active = acceptWalletId === String(w.id)
                    return (
                      <Pressable
                        key={w.id}
                        onPress={() => setAcceptWalletId(String(w.id))}
                        style={[
                          styles.walletChip,
                          {
                            backgroundColor: active ? colors.primary : colors.surfaceMuted,
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 13 }}>
                          {w.name}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
                {incomingProposals.map((p) => {
                  const meta = actionMeta(p.action)
                  return (
                    <View key={p.id} style={styles.proposalRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txTitle}>
                          {p.proposer_name || 'Them'}: {meta.label} · {fmtBalance(p.amount)}
                        </Text>
                        <Text style={styles.txSub}>
                          {p.date}{p.notes ? ` · ${p.notes}` : ''} · Accept to settle on your side
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.smallBtn, { borderColor: colors.border }]}
                        onPress={() => void respondProposal(p.id, 'decline')}
                        disabled={proposalBusyId === p.id}
                      >
                        <Text style={{ fontWeight: '700', fontSize: 12, color: colors.textSecondary }}>Decline</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                        onPress={() => void respondProposal(p.id, 'accept')}
                        disabled={proposalBusyId === p.id}
                      >
                        {proposalBusyId === p.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={{ fontWeight: '800', fontSize: 12, color: '#fff' }}>Accept</Text>
                        )}
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            ) : null}

            {outgoingProposals.length > 0 ? (
              <View style={[styles.proposalBox, { marginBottom: spacing.md }]}>
                <Text style={styles.sectionTitle}>Waiting for {link?.other_user?.name || personName}</Text>
                {outgoingProposals.map((p) => {
                  const meta = actionMeta(p.action)
                  return (
                    <View key={p.id} style={styles.proposalRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txTitle}>{meta.label} · {fmtBalance(p.amount)}</Text>
                        <Text style={styles.txSub}>Posted on your side · awaiting their accept</Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Actions</Text>
            {isLinked ? (
              <Text style={[styles.hintLine, { color: colors.textMuted }]}>
                Linked: they’ll get a notification to accept before their books update.
              </Text>
            ) : null}
            <View style={styles.actionGrid}>
              {ACTIONS.map((a) => (
                <Pressable
                  key={a.key}
                  onPress={() => openAction(a.key)}
                  style={[styles.actionBtn, { borderColor: a.color }]}
                >
                  <View style={[styles.actionIcon, { backgroundColor: `${a.color}22` }]}>
                    <FontAwesome name={a.icon} size={16} color={a.color} />
                  </View>
                  <Text style={styles.actionLabel}>{a.label}</Text>
                  <Text style={styles.actionHint}>{a.hint}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>This month</Text>
            {history.transactions.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {settled ? 'No pending debts' : 'No activity this month'}
                </Text>
                <Text style={styles.emptyBody}>
                  {settled
                    ? 'You’re settled up. Use Lend or Borrow when money moves again.'
                    : 'Use Lend, Borrow, Pay, or Receive to record a movement.'}
                </Text>
              </View>
            ) : (
              history.transactions.map((tx) => (
                <HistoryRow
                  key={tx.id}
                  tx={tx}
                  personName={personName}
                  styles={styles}
                  colors={colors}
                  money={money}
                />
              ))
            )}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={!!sheetAction} transparent animationType="fade" onRequestClose={closeSheet}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        >
          <Pressable style={styles.backdrop} onPress={closeSheet} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>
                {sheetMeta?.label} · {personName}
              </Text>
              <Pressable onPress={closeSheet} hitSlop={10}>
                <FontAwesome name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <ErrorBanner message={formError} />

            {travelOn ? (
              <View style={[styles.travelBanner, { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }]}>
                <FontAwesome name="plane" size={13} color={colors.primaryDark} />
                <Text style={[styles.travelBannerText, { color: colors.primaryDark }]}>
                  Amounts in {travelCurrency} · {rateLine || formatRateLine(travelCurrency, travelRate)}
                </Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>
              {sheetAction === 'lend' || sheetAction === 'pay' ? 'From wallet' : 'Into wallet'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.walletRow}
            >
              {wallets.map((w) => {
                const active = walletId === String(w.id)
                return (
                  <Pressable
                    key={w.id}
                    onPress={() => setWalletId(String(w.id))}
                    style={[
                      styles.walletChip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceMuted,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 13 }}>
                      {w.name}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            <Field
              label={travelOn ? `Amount (${travelCurrency})` : 'Amount (PKR)'}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            {travelOn && amount && Number(amount) > 0 ? (
              <Text style={styles.pkrHint}>
                ≈ {fmtBalance(foreignToPkr(Number(amount), travelRate))}
              </Text>
            ) : null}

            <DateField label="Date" value={date} onChange={setDate} />
            <Field
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              autoCapitalize="sentences"
            />

            {isLinked ? (
              <Text style={[styles.hintLine, { color: colors.textMuted, marginBottom: spacing.md }]}>
                Posts on your books now. {link?.other_user?.name || personName} gets a request to accept.
              </Text>
            ) : null}

            <PrimaryButton
              title={
                sheetMeta
                  ? isLinked
                    ? `Send ${sheetMeta.label} request`
                    : `Record ${sheetMeta.label}`
                  : 'Save'
              }
              onPress={() => void submitAction()}
              loading={saving}
              color={sheetMeta?.color}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <InvitePersonSheet
        visible={convertOpen}
        onClose={() => setConvertOpen(false)}
        existingPersonId={personId}
        defaultDisplayName={personName}
        onDone={() => {
          bumpRefresh()
          void load(true)
        }}
      />
    </View>
  )
}

function HistoryRow({
  tx,
  personName,
  styles,
  colors,
  money,
}: {
  tx: Transaction
  personName: string
  styles: ReturnType<typeof makeStyles>
  colors: ColorTokens
  money: ReturnType<typeof useMaskedMoney>
}) {
  const meta = actionMeta(tx.people_action)
  const walletName = counterpartFromNotes(tx.notes || '', personName)
  const line = directionLabel(tx.people_action, walletName, personName)
  const foreign = formatForeignSubtitle(tx.original_amount, tx.original_currency, tx.fx_rate)
  const amt = toMoney(tx.amount)
  const isIn = tx.type === 'income'

  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: `${meta.color}22` }]}>
        <FontAwesome name={meta.icon} size={14} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txTitle}>{meta.label}</Text>
        <Text style={styles.txSub} numberOfLines={1}>
          {line}
        </Text>
        <Text style={styles.txDate}>{tx.date}</Text>
        {foreign ? <Text style={styles.txForeign}>{foreign}</Text> : null}
      </View>
          <Text
            style={[
              styles.txAmt,
              money.amountStyle,
              { color: isIn ? colors.success : colors.danger },
            ]}
          >
            {money.fmtSigned(amt, isIn)}
          </Text>
    </View>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: typography.title, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginTop: 2 },
    linkCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingVertical: 10,
      borderRadius: radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    linkCtaText: { fontWeight: '800', fontSize: 13 },
    linkHint: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.lg,
    },
    navBtn: { padding: 8 },
    monthLabel: { fontWeight: '800', color: colors.primaryDark, fontSize: typography.subtitle },
    error: { color: colors.danger, marginBottom: spacing.md, fontWeight: '600' },
    netCard: {
      backgroundColor: colors.primaryDark,
      borderRadius: radii.lg,
      padding: spacing.xl,
      marginBottom: spacing.lg,
    },
    netLabel: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: typography.label,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    netValue: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: spacing.sm },
    netStatus: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', marginTop: 6, fontSize: 13 },
    netStats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    netStat: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: radii.sm,
      padding: spacing.sm,
    },
    netStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    netStatValue: { color: '#fff', fontWeight: '800', fontSize: 12, marginTop: 4 },
    sectionTitle: {
      fontSize: typography.subtitle,
      fontWeight: '800',
      color: colors.text,
      marginBottom: spacing.md,
    },
    actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    actionBtn: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      padding: spacing.md,
      minWidth: '46%',
    },
    actionIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    actionLabel: { fontWeight: '800', color: colors.text, fontSize: typography.body },
    actionHint: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
    hintLine: { fontSize: 12, fontWeight: '600', marginBottom: spacing.sm, lineHeight: 17 },
    proposalBox: { marginBottom: spacing.md },
    proposalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    smallBtn: {
      borderRadius: radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      paddingVertical: 8,
      minWidth: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyTitle: { fontWeight: '800', color: colors.text },
    emptyBody: { color: colors.textMuted, marginTop: 4, fontSize: typography.caption, fontWeight: '600', lineHeight: 18 },
    txRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    txIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txTitle: { fontWeight: '800', color: colors.text, fontSize: typography.body },
    txSub: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 2 },
    txDate: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
    txForeign: { color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 2 },
    txAmt: { fontWeight: '800', fontSize: typography.body },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,31,26,0.45)' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
      maxHeight: '92%',
      zIndex: 2,
    },
    sheetHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    sheetTitle: { fontSize: typography.title, fontWeight: '800', color: colors.primaryDark, flex: 1 },
    travelBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: radii.sm,
      padding: spacing.sm,
      marginBottom: spacing.md,
    },
    travelBannerText: { flex: 1, fontWeight: '700', fontSize: 12 },
    fieldLabel: {
      fontSize: typography.label,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
    },
    walletRow: { gap: 8, paddingBottom: spacing.md },
    walletChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radii.full,
      borderWidth: 1,
    },
    pkrHint: { color: colors.textMuted, fontWeight: '700', fontSize: 12, marginTop: -8, marginBottom: spacing.sm },
  })
}
