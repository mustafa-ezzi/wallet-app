import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  accountsApi,
  apiErrorMessage,
  asList,
  householdsApi,
} from '@/src/api/client'
import type {
  Account,
  Household,
  HouseholdExpense,
  HouseholdInvite,
  HouseholdLedger,
  HouseholdMember,
  LedgerSummary,
  SettlementRow,
} from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { CategoryDonut } from '@/src/components/CategoryDonut'
import { MemberSpendBars } from '@/src/components/MemberSpendBars'
import { BouncyPressable, Reveal } from '@/src/components/motion'
import { DateField, SelectField } from '@/src/components/SelectFields'
import { ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { getCategoryMeta } from '@/src/constants/categories'
import { useOffline } from '@/src/offline'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { iosShadow, radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { todayISO, toMoney } from '@/src/utils/format'
import { buildHouseholdInviteMessage } from '@/src/utils/shareInvite'
import { useAuth } from '@/src/context/AuthContext'

type ViewMode = 'list' | 'detail' | 'ledger'
type PeriodMode = 'month' | 'all'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function HouseholdScreen() {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const money = useMaskedMoney()
  const { online } = useOffline()
  const { user } = useAuth()

  const [view, setView] = useState<ViewMode>('list')
  const [households, setHouseholds] = useState<Household[]>([])
  const [selected, setSelected] = useState<Household | null>(null)
  const [ledgers, setLedgers] = useState<HouseholdLedger[]>([])
  const [activeLedger, setActiveLedger] = useState<HouseholdLedger | null>(null)
  const [expenses, setExpenses] = useState<HouseholdExpense[]>([])
  const [periodSpent, setPeriodSpent] = useState(0)
  const [period, setPeriod] = useState<PeriodMode>('month')
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [invite, setInvite] = useState<HouseholdInvite | null>(null)
  const [summary, setSummary] = useState<LedgerSummary | null>(null)
  const [settlement, setSettlement] = useState<SettlementRow[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [ledgerTab, setLedgerTab] = useState<'feed' | 'report' | 'split'>('feed')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [contribOpen, setContribOpen] = useState(false)
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [editHhOpen, setEditHhOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const [hhName, setHhName] = useState('')
  const [editHhName, setEditHhName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [previewName, setPreviewName] = useState('')
  const [expForm, setExpForm] = useState({
    amount: '',
    category: '',
    date: todayISO(),
    notes: '',
    pot_amount: '',
    linked_account: '',
  })
  const [contribForm, setContribForm] = useState({
    amount: '',
    date: todayISO(),
    notes: '',
    linked_account: '',
  })
  const [ledgerForm, setLedgerForm] = useState({
    name: '',
    kind: 'ongoing' as 'ongoing' | 'event',
    start_date: todayISO(),
  })

  const requireOnline = () => {
    // NetInfo is unreliable on some Android devices (false “offline”).
    // Always attempt the API call; real failures use apiErrorMessage.
    return true
  }

  const loadList = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      const [hRes, aRes] = await Promise.all([
        householdsApi.list(),
        accountsApi.list(),
      ])
      setHouseholds(asList<Household>(hRes.data))
      setAccounts(asList<Account>(aRes.data))
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load households.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const openHousehold = async (hh: Household) => {
    setSelected(hh)
    setView('detail')
    setError('')
    setBusy(true)
    try {
      const [lRes, iRes, mRes] = await Promise.all([
        householdsApi.ledgers(hh.id),
        householdsApi.getInvite(hh.id).catch(() => ({ data: null })),
        householdsApi.members(hh.id).catch(() => ({ data: [] })),
      ])
      setLedgers(asList<HouseholdLedger>(lRes.data))
      setInvite(iRes.data as HouseholdInvite | null)
      setMembers(asList<HouseholdMember>(mRes.data))
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load household.'))
    } finally {
      setBusy(false)
    }
  }

  const openLedger = async (ledger: HouseholdLedger, nextPeriod: PeriodMode = 'month') => {
    setActiveLedger(ledger)
    setView('ledger')
    setLedgerTab('feed')
    setPeriod(nextPeriod)
    setError('')
    setBusy(true)
    try {
      const now = new Date()
      const expenseParams: Record<string, number> = { limit: 50, offset: 0 }
      const reportParams: { year?: number; month?: number } = {}
      // Ongoing open ledgers default to this calendar month so totals "reset" each month.
      // All-time is available as an explicit filter. Event/closed ledgers stay all-time.
      const useMonth =
        nextPeriod === 'month'
        && ledger.kind === 'ongoing'
        && ledger.status === 'open'
      if (useMonth) {
        expenseParams.year = now.getFullYear()
        expenseParams.month = now.getMonth() + 1
        reportParams.year = now.getFullYear()
        reportParams.month = now.getMonth() + 1
      }
      const [eRes, sRes] = await Promise.all([
        householdsApi.ledgerExpenses(ledger.id, expenseParams),
        useMonth
          ? householdsApi.ledgerReport(ledger.id, reportParams).catch(() => ({ data: null }))
          : householdsApi.ledgerSummary(ledger.id).catch(() => ({ data: null })),
      ])
      const payload = eRes.data as {
        results?: HouseholdExpense[]
        total?: number | string
      } | HouseholdExpense[]
      const rows = Array.isArray(payload)
        ? payload
        : asList<HouseholdExpense>(payload?.results)
      setExpenses(rows)
      const totalFromFeed = !Array.isArray(payload) && payload?.total != null
        ? toMoney(payload.total)
        : rows.reduce((s, r) => s + toMoney(r.amount), 0)
      setPeriodSpent(totalFromFeed)
      const report = sRes.data as (LedgerSummary & { total_spent?: number | string }) | null
      setSummary(report)
      if (report?.total_spent != null) setPeriodSpent(toMoney(report.total_spent))
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load ledger.'))
    } finally {
      setBusy(false)
    }
  }

  const changePeriod = (next: PeriodMode) => {
    if (!activeLedger || next === period) return
    void openLedger(activeLedger, next)
  }

  const loadSettlement = async () => {
    if (!activeLedger) return
    try {
      const { data } = await householdsApi.settlement(activeLedger.id)
      const rows = asList<SettlementRow>((data as { transfers?: unknown })?.transfers)
      setSettlement(
        rows.map((r) => ({
          ...r,
          from_name: r.from_name || (r as { from_name?: string }).from_name,
          to_name: r.to_name || (r as { to_name?: string }).to_name,
        })),
      )
      setLedgerTab('split')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load split.'))
    }
  }

  const createHousehold = async () => {
    if (!requireOnline() || busyRef.current) return
    if (!hhName.trim()) {
      setError('Name is required.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const { data } = await householdsApi.create({ name: hhName.trim() })
      setCreateOpen(false)
      setHhName('')
      await loadList(true)
      if (data?.id) await openHousehold(data as Household)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create household.'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const previewJoin = async () => {
    if (!requireOnline()) return
    setBusy(true)
    setError('')
    setPreviewName('')
    try {
      const { data } = await householdsApi.joinPreview({ code: joinCode.trim() })
      setPreviewName(data?.household_name || 'Household')
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid invite code.'))
    } finally {
      setBusy(false)
    }
  }

  const acceptJoin = async () => {
    if (!requireOnline()) return
    setBusy(true)
    setError('')
    try {
      const { data } = await householdsApi.join({ code: joinCode.trim() })
      setJoinOpen(false)
      setJoinCode('')
      setPreviewName('')
      await loadList(true)
      if (data?.id) await openHousehold(data as Household)
      else if (data?.household) await openHousehold(data.household as Household)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not join.'))
    } finally {
      setBusy(false)
    }
  }

  const shareInvite = async () => {
    if (!invite?.code || !selected) return
    const inviterName =
      [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
      || user?.email
      || null
    const msg = buildHouseholdInviteMessage({
      householdName: selected.name,
      inviteCode: invite.code,
      inviterName,
    })
    await Share.share({ message: msg, title: 'Join my CashTrail household' })
  }

  const isOwner = selected?.my_role === 'owner'
  const isAdmin = selected?.my_role === 'owner' || selected?.my_role === 'admin'
  const potBalance = toMoney(activeLedger?.pot_balance)

  const categoryChartData = useMemo(
    () =>
      (summary?.by_category ?? []).map((r) => ({
        category: r.name || 'Other',
        amount: toMoney(r.amount),
      })),
    [summary],
  )

  const spentLabel =
    period === 'month' && activeLedger?.kind === 'ongoing' && activeLedger?.status === 'open'
      ? 'This month'
      : 'Total spent'
  const spentValue = periodSpent || toMoney(summary?.total_spent) || toMoney(activeLedger?.total_spent)

  const openInviteModal = async () => {
    if (!requireOnline() || !selected) return
    setInviteOpen(true)
    setError('')
    try {
      if (!invite?.code) {
        const { data } = await householdsApi.regenerateInvite(selected.id)
        setInvite(data as HouseholdInvite)
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load invite.'))
    }
  }

  const saveHouseholdName = async () => {
    if (!requireOnline() || !selected) return
    if (!editHhName.trim()) {
      setError('Name is required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await householdsApi.update(selected.id, { name: editHhName.trim() })
      setEditHhOpen(false)
      const updated = { ...selected, name: editHhName.trim() }
      setSelected(updated)
      await loadList(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update household.'))
    } finally {
      setBusy(false)
    }
  }

  const deleteHousehold = () => {
    if (!requireOnline() || !selected || !isOwner) return
    Alert.alert(
      'Delete household?',
      `Permanently delete “${selected.name}”? All ledgers and shared expenses will be removed. Personal wallets are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true)
              setError('')
              try {
                await householdsApi.remove(selected.id)
                setSelected(null)
                setView('list')
                await loadList(true)
              } catch (err) {
                setError(apiErrorMessage(err, 'Could not delete household.'))
              } finally {
                setBusy(false)
              }
            })()
          },
        },
      ],
    )
  }

  const useMaxPot = () => {
    const amt = toMoney(expForm.amount)
    const max = Math.min(potBalance, amt > 0 ? amt : potBalance)
    setExpForm((f) => ({ ...f, pot_amount: String(max || 0) }))
  }

  const createLedger = async () => {
    if (!requireOnline() || !selected || busyRef.current) return
    if (!ledgerForm.name.trim()) {
      setError('Ledger name is required.')
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      await householdsApi.createLedger(selected.id, ledgerForm)
      setLedgerOpen(false)
      setLedgerForm({ name: '', kind: 'ongoing', start_date: todayISO() })
      await openHousehold(selected)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create ledger.'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const addExpense = async () => {
    if (!requireOnline() || !activeLedger || busyRef.current) return
    const amount = toMoney(expForm.amount)
    if (amount <= 0) {
      setError('Enter a valid amount.')
      return
    }
    const potAmt = toMoney(expForm.pot_amount)
    if (potAmt > amount) {
      setError('Pot amount can’t be more than the expense total.')
      return
    }
    if (potAmt > potBalance) {
      setError(`Only ${potBalance} available in the pot.`)
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        amount,
        category: expForm.category.trim() || 'Shared',
        date: expForm.date || todayISO(),
        notes: expForm.notes.trim(),
        pot_amount: potAmt,
      }
      if (expForm.linked_account && potAmt < amount) {
        payload.linked_account = Number(expForm.linked_account)
      }
      await householdsApi.addExpense(activeLedger.id, payload)
      setExpenseOpen(false)
      setExpForm({
        amount: '',
        category: '',
        date: todayISO(),
        notes: '',
        pot_amount: '',
        linked_account: '',
      })
      await openLedger(activeLedger)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not add expense.'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const addContribution = async () => {
    if (!requireOnline() || !activeLedger || busyRef.current) return
    const amount = toMoney(contribForm.amount)
    if (amount <= 0) {
      setError('Enter a valid amount.')
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {
        amount,
        date: contribForm.date || todayISO(),
        notes: contribForm.notes.trim(),
      }
      if (contribForm.linked_account) payload.linked_account = Number(contribForm.linked_account)
      await householdsApi.addContribution(activeLedger.id, payload)
      setContribOpen(false)
      setContribForm({ amount: '', date: todayISO(), notes: '', linked_account: '' })
      await openLedger(activeLedger)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not add contribution.'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const toggleClose = async () => {
    if (!requireOnline() || !activeLedger || !selected) return
    setBusy(true)
    try {
      if (activeLedger.status === 'open') {
        await householdsApi.closeLedger(activeLedger.id)
      } else {
        await householdsApi.reopenLedger(activeLedger.id)
      }
      await openHousehold(selected)
      setView('detail')
      setActiveLedger(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update ledger.'))
    } finally {
      setBusy(false)
    }
  }

  const back = () => {
    setError('')
    if (view === 'ledger') {
      setActiveLedger(null)
      setView('detail')
      return
    }
    if (view === 'detail') {
      setSelected(null)
      setView('list')
      void loadList(true)
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 88 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              if (view === 'list') void loadList(true)
              else if (view === 'detail' && selected) void openHousehold(selected)
              else if (view === 'ledger' && activeLedger) void openLedger(activeLedger)
              else setRefreshing(false)
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            {view !== 'list' ? (
              <Pressable onPress={back} style={styles.back} hitSlop={8}>
                <FontAwesome name="chevron-left" size={12} color={colors.primary} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>
            ) : null}
            <Text style={styles.title}>
              {view === 'list'
                ? 'Family'
                : view === 'detail'
                  ? selected?.name
                  : activeLedger?.name}
            </Text>
            <Text style={styles.sub}>
              {view === 'list'
                ? 'Shared ledgers, pot, and splits'
                : view === 'detail'
                  ? `${selected?.member_count ?? members.length} members · ${ledgers.length} ledger${ledgers.length === 1 ? '' : 's'}`
                  : activeLedger?.status === 'open'
                    ? `${activeLedger.kind === 'event' ? 'Event' : 'Ongoing'} · open`
                    : 'Closed ledger'}
            </Text>
          </View>
          <AmountEyeToggle />
        </View>

        {!online ? (
          <View style={styles.offline}>
            <Text style={styles.offlineText}>
              You’re offline — household writes are blocked until you reconnect.
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.md }} /> : null}

        {view === 'list' ? (
          <>
            <View style={styles.heroActions}>
              <BouncyPressable style={styles.heroPrimary} onPress={() => setCreateOpen(true)}>
                <FontAwesome name="plus" size={13} color="#fff" />
                <Text style={styles.heroPrimaryText}>Create household</Text>
              </BouncyPressable>
              <BouncyPressable style={styles.heroSecondary} onPress={() => setJoinOpen(true)}>
                <FontAwesome name="ticket" size={13} color={colors.primaryDark} />
                <Text style={styles.heroSecondaryText}>Join with code</Text>
              </BouncyPressable>
            </View>

            {loading && households.length === 0 ? (
              <ActivityIndicator color={colors.primary} />
            ) : households.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <FontAwesome name="users" size={22} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No households yet</Text>
                <Text style={styles.emptyBody}>
                  Create a shared space for family spending, or join with an invite code.
                </Text>
              </View>
            ) : (
              households.map((hh, i) => {
                const initial = (hh.name.trim()[0] || 'F').toUpperCase()
                return (
                  <Reveal index={i} key={hh.id}>
                    <BouncyPressable style={styles.hhCard} onPress={() => void openHousehold(hh)}>
                      <View style={styles.hhAvatar}>
                        <Text style={styles.hhAvatarText}>{initial}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{hh.name}</Text>
                        <Text style={styles.cardMeta}>
                          {hh.member_count} members · {hh.ledger_count} ledgers
                          {hh.my_role ? ` · ${hh.my_role}` : ''}
                        </Text>
                      </View>
                      <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
                    </BouncyPressable>
                  </Reveal>
                )
              })
            )}
          </>
        ) : null}

        {view === 'detail' && selected ? (
          <>
            <View style={styles.detailHero}>
              <View style={styles.detailStat}>
                <Text style={styles.detailLab}>Members</Text>
                <Text style={styles.detailVal}>{selected.member_count ?? members.length}</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailStat}>
                <Text style={styles.detailLab}>Ledgers</Text>
                <Text style={styles.detailVal}>{ledgers.length}</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailStat}>
                <Text style={styles.detailLab}>Your role</Text>
                <Text style={styles.detailVal}>{selected.my_role || 'member'}</Text>
              </View>
            </View>

            <View style={styles.hhActionRow}>
              {isAdmin ? (
                <>
                  <Pressable
                    style={styles.hhActionBtn}
                    onPress={() => {
                      setEditHhName(selected.name)
                      setError('')
                      setEditHhOpen(true)
                    }}
                  >
                    <FontAwesome name="pencil" size={13} color={colors.textSecondary} />
                    <Text style={styles.hhActionText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.hhActionBtn} onPress={() => setMembersOpen(true)}>
                    <FontAwesome name="users" size={13} color={colors.textSecondary} />
                    <Text style={styles.hhActionText}>Members</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.hhActionBtn, styles.hhActionPrimary]}
                    onPress={() => void openInviteModal()}
                  >
                    <FontAwesome name="user-plus" size={13} color="#fff" />
                    <Text style={[styles.hhActionText, { color: '#fff' }]}>Invite</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable style={styles.hhActionBtn} onPress={() => setMembersOpen(true)}>
                  <FontAwesome name="users" size={13} color={colors.textSecondary} />
                  <Text style={styles.hhActionText}>Members</Text>
                </Pressable>
              )}
              {isOwner ? (
                <Pressable style={[styles.hhActionBtn, styles.hhActionDanger]} onPress={deleteHousehold}>
                  <FontAwesome name="trash-o" size={13} color={colors.danger} />
                  <Text style={[styles.hhActionText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.section}>Ledgers</Text>
              {isAdmin ? (
                <Pressable onPress={() => setLedgerOpen(true)} hitSlop={8}>
                  <Text style={styles.link}>+ New ledger</Text>
                </Pressable>
              ) : null}
            </View>
            {ledgers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No ledgers yet</Text>
                <Text style={styles.emptyBody}>
                  Start an ongoing monthly ledger or an event ledger for a trip or wedding.
                </Text>
              </View>
            ) : (
              ledgers.map((led, i) => {
                const open = led.status === 'open'
                return (
                  <Reveal index={i} key={led.id}>
                    <BouncyPressable style={styles.ledgerCard} onPress={() => void openLedger(led)}>
                      <View style={styles.ledgerTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{led.name}</Text>
                          <Text style={styles.cardMeta}>
                            {led.kind === 'event' ? 'Event' : 'Ongoing'}
                          </Text>
                        </View>
                        <View style={[styles.statusPill, open ? styles.statusOpen : styles.statusClosed]}>
                          <Text style={[styles.statusText, open ? styles.statusTextOpen : styles.statusTextClosed]}>
                            {open ? 'Open' : 'Closed'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.ledgerBottom}>
                        <View>
                          <Text style={styles.detailLab}>
                            {led.kind === 'ongoing' && open ? 'This month' : 'Spent'}
                          </Text>
                          <Text style={[styles.ledgerAmt, money.amountStyle]}>
                            {money.fmt(
                              led.kind === 'ongoing' && open
                                ? led.month_spent ?? 0
                                : led.total_spent,
                            )}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.detailLab}>Pot</Text>
                          <Text style={[styles.ledgerAmt, money.amountStyle]}>
                            {money.fmt(led.pot_balance ?? 0)}
                          </Text>
                        </View>
                      </View>
                    </BouncyPressable>
                  </Reveal>
                )
              })
            )}
          </>
        ) : null}

        {view === 'ledger' && activeLedger ? (
          <>
            {activeLedger.kind === 'ongoing' && activeLedger.status === 'open' ? (
              <View style={styles.periodRow}>
                <Pressable
                  style={[styles.periodChip, period === 'month' && styles.periodChipOn]}
                  onPress={() => changePeriod('month')}
                >
                  <Text style={[styles.periodText, period === 'month' && styles.periodTextOn]}>
                    {MONTH_NAMES[new Date().getMonth()]}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.periodChip, period === 'all' && styles.periodChipOn]}
                  onPress={() => changePeriod('all')}
                >
                  <Text style={[styles.periodText, period === 'all' && styles.periodTextOn]}>
                    All time
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.statHero}>
              <View style={styles.statHeroMain}>
                <Text style={styles.statHeroLab}>{spentLabel}</Text>
                <Text style={[styles.statHeroAmt, money.amountStyle]}>{money.fmt(spentValue)}</Text>
                <Text style={styles.statHeroMeta}>
                  {(summary?.expense_count ?? expenses.length) || 0} expense
                  {(summary?.expense_count ?? expenses.length) === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.statHeroSide}>
                <Text style={styles.actualLab}>Shared pot</Text>
                <Text style={[styles.statSideAmt, money.amountStyle]}>
                  {money.fmt(activeLedger.pot_balance ?? 0)}
                </Text>
              </View>
            </View>

            <View style={styles.tabRow}>
              {(['feed', 'report', 'split'] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.tab, ledgerTab === t && styles.tabOn]}
                  onPress={() => {
                    if (t === 'split') void loadSettlement()
                    else setLedgerTab(t)
                  }}
                >
                  <Text style={[styles.tabText, ledgerTab === t && styles.tabTextOn]}>
                    {t === 'feed' ? 'Feed' : t === 'report' ? 'Report' : 'Split'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actions}>
              {activeLedger.status === 'open' ? (
                <>
                  <BouncyPressable style={styles.primaryChip} onPress={() => setExpenseOpen(true)}>
                    <Text style={styles.primaryChipText}>+ Expense</Text>
                  </BouncyPressable>
                  <BouncyPressable style={styles.secondaryChip} onPress={() => setContribOpen(true)}>
                    <Text style={styles.secondaryChipText}>Pot contribute</Text>
                  </BouncyPressable>
                </>
              ) : null}
              <BouncyPressable style={styles.secondaryChip} onPress={() => void toggleClose()}>
                <Text style={styles.secondaryChipText}>
                  {activeLedger.status === 'open' ? 'Close' : 'Reopen'}
                </Text>
              </BouncyPressable>
            </View>

            {ledgerTab === 'feed' ? (
              expenses.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>
                    {period === 'month' ? 'No expenses this month' : 'No expenses yet'}
                  </Text>
                  <Text style={styles.emptyBody}>
                    Add a shared expense — pay from the pot, a wallet, or both.
                  </Text>
                </View>
              ) : (
                expenses.map((ex, i) => {
                  const meta = getCategoryMeta(ex.category)
                  const potAmt = toMoney(ex.pot_amount)
                  const personal = toMoney(ex.personal_amount ?? Math.max(0, toMoney(ex.amount) - potAmt))
                  return (
                    <Reveal index={i} key={ex.id}>
                      <View style={styles.expenseCard}>
                        <View style={[styles.expenseIcon, { backgroundColor: `${meta.color}1f` }]}>
                          <FontAwesome name={meta.icon} size={15} color={meta.color} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.expenseTitle} numberOfLines={1}>
                            {ex.category || 'Expense'}
                          </Text>
                          <Text style={styles.expenseMeta} numberOfLines={1}>
                            {ex.paid_by_name || 'Member'} · {ex.date}
                          </Text>
                          {ex.notes ? (
                            <Text style={styles.expenseNotes} numberOfLines={2}>
                              {ex.notes}
                            </Text>
                          ) : null}
                          {potAmt > 0 || personal > 0 ? (
                            <View style={styles.expenseTags}>
                              {potAmt > 0 ? (
                                <View style={styles.tagPot}>
                                  <Text style={styles.tagPotText}>Pot {money.fmt(potAmt)}</Text>
                                </View>
                              ) : null}
                              {personal > 0 ? (
                                <View style={styles.tagWallet}>
                                  <Text style={styles.tagWalletText}>
                                    Wallet {money.fmt(personal)}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.expenseAmt, money.amountStyle]}>
                          {money.fmt(ex.amount)}
                        </Text>
                      </View>
                    </Reveal>
                  )
                })
              )
            ) : null}

            {ledgerTab === 'report' ? (
              summary ? (
                <>
                  <View style={styles.reportCard}>
                    <CategoryDonut
                      data={categoryChartData}
                      title={period === 'month' ? 'Household spent this month' : 'Household spent'}
                      emptyText="No category spending in this period."
                    />
                  </View>
                  <MemberSpendBars data={summary.by_member ?? []} title="Who paid" />
                </>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Report unavailable</Text>
                  <Text style={styles.emptyBody}>Pull to refresh, or switch period and try again.</Text>
                </View>
              )
            ) : null}

            {ledgerTab === 'split' ? (
              settlement.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIcon}>
                    <FontAwesome name="check" size={18} color={colors.success} />
                  </View>
                  <Text style={styles.emptyTitle}>Already even</Text>
                  <Text style={styles.emptyBody}>No transfers needed for an equal split.</Text>
                </View>
              ) : (
                settlement.map((row, i) => (
                  <Reveal index={i} key={`s-${i}`}>
                    <View style={styles.splitCard}>
                      <View style={styles.splitAvatars}>
                        <View style={[styles.splitAvatar, { backgroundColor: '#ecfdf5' }]}>
                          <Text style={[styles.splitAvatarText, { color: colors.success }]}>
                            {((row.from_name || 'M')[0] || 'M').toUpperCase()}
                          </Text>
                        </View>
                        <FontAwesome name="long-arrow-right" size={12} color={colors.textMuted} />
                        <View style={[styles.splitAvatar, { backgroundColor: colors.infoBg }]}>
                          <Text style={[styles.splitAvatarText, { color: colors.infoText }]}>
                            {((row.to_name || 'M')[0] || 'M').toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>
                          {(row.from_name || 'Member')} → {(row.to_name || 'Member')}
                        </Text>
                        <Text style={styles.cardMeta}>Equal-split settlement</Text>
                      </View>
                      <Text style={[styles.expenseAmt, money.amountStyle]}>
                        {money.fmt(row.amount)}
                      </Text>
                    </View>
                  </Reveal>
                ))
              )
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* Create household */}
      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text style={styles.sheetTitle}>Create household</Text>
            <ErrorBanner message={error} />
            <Field label="Name" value={hhName} onChangeText={setHhName} placeholder="Home" autoCapitalize="words" />
            <PrimaryButton title="Create" onPress={() => void createHousehold()} loading={busy} />
          </View>
        </View>
      </Modal>

      {/* Join */}
      <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setJoinOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text style={styles.sheetTitle}>Join with code</Text>
            <ErrorBanner message={error} />
            <Field
              label="Invite code"
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="HOME-XXXXXX"
              autoCapitalize="characters"
            />
            {previewName ? <Text style={styles.preview}>Join “{previewName}”?</Text> : null}
            <PrimaryButton title="Preview" onPress={() => void previewJoin()} loading={busy} />
            {previewName ? (
              <PrimaryButton title="Join household" onPress={() => void acceptJoin()} loading={busy} />
            ) : null}
          </View>
        </View>
      </Modal>

      {/* New ledger */}
      <Modal visible={ledgerOpen} transparent animationType="fade" onRequestClose={() => setLedgerOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setLedgerOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text style={styles.sheetTitle}>New ledger</Text>
            <Field
              label="Name"
              value={ledgerForm.name}
              onChangeText={(t) => setLedgerForm((f) => ({ ...f, name: t }))}
              placeholder="Home monthly"
              autoCapitalize="words"
            />
            <Text style={styles.label}>Kind</Text>
            <View style={styles.seg}>
              {(['ongoing', 'event'] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setLedgerForm((f) => ({ ...f, kind: k }))}
                  style={[styles.segBtn, ledgerForm.kind === k && styles.segBtnOn]}
                >
                  <Text style={[styles.segText, ledgerForm.kind === k && styles.segTextOn]}>
                    {k === 'ongoing' ? 'Ongoing' : 'Event'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <PrimaryButton title="Create ledger" onPress={() => void createLedger()} loading={busy} />
          </View>
        </View>
      </Modal>

      {/* Expense */}
      <Modal visible={expenseOpen} transparent animationType="fade" onRequestClose={() => setExpenseOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setExpenseOpen(false)} />
          <ScrollView
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sheetTitle}>Add shared expense</Text>
            <Text style={styles.sheetHint}>
              Pay from the pot, your wallet, or both. Pot-funded amounts reduce the pot balance.
            </Text>
            <ErrorBanner message={error} />
            <Field
              label="Amount (PKR)"
              value={expForm.amount}
              onChangeText={(t) => setExpForm((f) => ({ ...f, amount: t }))}
              keyboardType="decimal-pad"
            />
            <DateField
              label="Date"
              value={expForm.date}
              onChange={(d) => setExpForm((f) => ({ ...f, date: d }))}
            />
            <Field
              label={`Use from pot (available ${money.fmt(potBalance)})`}
              value={expForm.pot_amount}
              onChangeText={(t) => setExpForm((f) => ({ ...f, pot_amount: t }))}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <View style={styles.potActions}>
              <Pressable style={styles.secondaryChip} onPress={useMaxPot}>
                <Text style={styles.secondaryChipText}>Use max pot</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryChip}
                onPress={() => setExpForm((f) => ({ ...f, pot_amount: '0' }))}
              >
                <Text style={styles.secondaryChipText}>Clear pot</Text>
              </Pressable>
            </View>
            {toMoney(expForm.amount) > toMoney(expForm.pot_amount) ? (
              <SelectField
                label="Link wallet (remainder)"
                value={expForm.linked_account}
                options={[
                  { value: '', label: 'None' },
                  ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
                ]}
                onChange={(v) => setExpForm((f) => ({ ...f, linked_account: v }))}
                placeholder="Select wallet…"
              />
            ) : null}
            <Field
              label="Category"
              value={expForm.category}
              onChangeText={(t) => setExpForm((f) => ({ ...f, category: t }))}
              placeholder="Groceries, Utilities…"
              autoCapitalize="words"
            />
            <Field
              label="Notes"
              value={expForm.notes}
              onChangeText={(t) => setExpForm((f) => ({ ...f, notes: t }))}
            />
            <PrimaryButton title="Add expense" onPress={() => void addExpense()} loading={busy} />
          </ScrollView>
        </View>
      </Modal>

      {/* Edit household */}
      <Modal visible={editHhOpen} transparent animationType="fade" onRequestClose={() => setEditHhOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setEditHhOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text style={styles.sheetTitle}>Edit household</Text>
            <ErrorBanner message={error} />
            <Field
              label="Name"
              value={editHhName}
              onChangeText={setEditHhName}
              autoCapitalize="words"
            />
            <PrimaryButton title="Save" onPress={() => void saveHouseholdName()} loading={busy} />
          </View>
        </View>
      </Modal>

      {/* Members */}
      <Modal visible={membersOpen} transparent animationType="fade" onRequestClose={() => setMembersOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setMembersOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg), maxHeight: '70%' }]}>
            <Text style={styles.sheetTitle}>Members</Text>
            <ScrollView>
              {members.length === 0 ? (
                <Text style={styles.emptyBody}>No members loaded.</Text>
              ) : (
                members.map((m) => (
                  <View key={m.id} style={styles.memberRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{m.display_name || m.email}</Text>
                      <Text style={styles.cardMeta}>{m.role} · {m.status}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <PrimaryButton title="Close" onPress={() => setMembersOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* Invite */}
      <Modal visible={inviteOpen} transparent animationType="fade" onRequestClose={() => setInviteOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setInviteOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text style={styles.sheetTitle}>Invite members</Text>
            <ErrorBanner message={error} />
            {invite?.code ? (
              <View style={styles.inviteCard}>
                <Text style={styles.inviteLab}>Invite code</Text>
                <Text style={styles.inviteCode}>{invite.code}</Text>
              </View>
            ) : (
              <Text style={styles.emptyBody}>Generating invite…</Text>
            )}
            <View style={styles.actions}>
              <Pressable style={styles.primaryChip} onPress={() => void shareInvite()}>
                <Text style={styles.primaryChipText}>Share / WhatsApp</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryChip}
                onPress={() => {
                  if (!requireOnline() || !selected) return
                  void householdsApi.regenerateInvite(selected.id).then((r) => setInvite(r.data))
                }}
              >
                <Text style={styles.secondaryChipText}>New code</Text>
              </Pressable>
            </View>
            <PrimaryButton title="Done" onPress={() => setInviteOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* Contribution */}
      <Modal visible={contribOpen} transparent animationType="fade" onRequestClose={() => setContribOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setContribOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text style={styles.sheetTitle}>Contribute to pot</Text>
            <Field label="Amount" value={contribForm.amount} onChangeText={(t) => setContribForm((f) => ({ ...f, amount: t }))} keyboardType="decimal-pad" />
            <Field label="Notes" value={contribForm.notes} onChangeText={(t) => setContribForm((f) => ({ ...f, notes: t }))} />
            <PrimaryButton title="Add contribution" onPress={() => void addContribution()} loading={busy} />
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
    backText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
    title: { fontSize: typography.title, fontWeight: '800', color: colors.text },
    sub: { color: colors.textMuted, marginTop: 2, fontSize: typography.caption },
    offline: {
      backgroundColor: colors.warningBg,
      borderColor: colors.warningBorder,
      borderWidth: 1,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    offlineText: { color: colors.warning, fontWeight: '600', fontSize: typography.caption, lineHeight: 18 },
    error: { color: colors.danger, marginBottom: spacing.md, fontWeight: '600' },
    heroActions: { gap: spacing.sm, marginBottom: spacing.lg },
    heroPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: radii.md,
      ...iosShadow,
    },
    heroPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    heroSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      borderRadius: radii.md,
    },
    heroSecondaryText: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
    primaryChip: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radii.sm,
    },
    primaryChipText: { color: colors.white, fontWeight: '800', fontSize: 13 },
    secondaryChip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radii.sm,
    },
    secondaryChipText: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
    hhCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...iosShadow,
    },
    hhAvatar: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hhAvatarText: { fontWeight: '800', fontSize: 18, color: colors.primary },
    detailHero: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.md,
      ...iosShadow,
    },
    detailStat: { flex: 1, alignItems: 'center', gap: 2 },
    detailDivider: { width: 1, height: 28, backgroundColor: colors.border },
    detailLab: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    detailVal: { fontWeight: '800', fontSize: 15, color: colors.primaryDark, textTransform: 'capitalize' },
    hhActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: spacing.lg,
    },
    hhActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radii.sm,
    },
    hhActionPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    hhActionDanger: {
      borderColor: 'rgba(220,38,38,0.3)',
    },
    hhActionText: {
      fontWeight: '800',
      fontSize: 13,
      color: colors.textSecondary,
    },
    sheetHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: spacing.md,
      marginTop: -4,
    },
    potActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: spacing.md,
      marginTop: -4,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    emptyTitle: { fontWeight: '800', color: colors.text, marginBottom: 4, textAlign: 'center' },
    emptyBody: {
      color: colors.textMuted,
      fontSize: typography.caption,
      lineHeight: 18,
      textAlign: 'center',
    },
    cardTitle: { fontWeight: '800', color: colors.text, fontSize: 15 },
    cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    ledgerCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: spacing.md,
      ...iosShadow,
    },
    ledgerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    ledgerBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.sm,
    },
    ledgerAmt: { marginTop: 2, fontWeight: '800', fontSize: 15, color: colors.primaryDark },
    statusPill: {
      borderRadius: radii.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusOpen: { backgroundColor: '#ecfdf5' },
    statusClosed: { backgroundColor: colors.surfaceMuted },
    statusText: { fontSize: 11, fontWeight: '800' },
    statusTextOpen: { color: colors.success },
    statusTextClosed: { color: colors.textMuted },
    inviteCard: {
      backgroundColor: colors.infoBg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: '#bfdbfe',
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    inviteLab: { color: colors.infoText, fontWeight: '700', fontSize: 12 },
    inviteCode: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.primaryDark,
      marginVertical: 6,
      letterSpacing: 1,
    },
    section: {
      fontSize: typography.subtitle,
      fontWeight: '800',
      color: colors.primaryDark,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    sectionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    link: { color: colors.primary, fontWeight: '800' },
    memberRow: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    periodRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
    periodChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.full,
      paddingHorizontal: 14,
      paddingVertical: 7,
      backgroundColor: colors.surface,
    },
    periodChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    periodText: { fontWeight: '700', color: colors.textSecondary, fontSize: 12 },
    periodTextOn: { color: colors.white },
    actualLab: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    statHeroLab: {
      fontSize: 11,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.78)',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    statHero: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    statHeroMain: {
      flex: 1.4,
      backgroundColor: colors.primary,
      borderRadius: radii.lg,
      padding: spacing.md,
      ...iosShadow,
    },
    statHeroSide: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      justifyContent: 'center',
    },
    statHeroAmt: { marginTop: 4, fontWeight: '800', fontSize: 22, color: '#fff' },
    statHeroMeta: { marginTop: 4, color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600' },
    statSideAmt: { marginTop: 6, fontWeight: '800', fontSize: 16, color: colors.primaryDark },
    tabRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: spacing.md,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      padding: 4,
    },
    tab: {
      flex: 1,
      borderRadius: radii.sm,
      paddingVertical: 9,
      alignItems: 'center',
    },
    tabOn: { backgroundColor: colors.surface, ...iosShadow },
    tabText: { fontWeight: '800', fontSize: 12, color: colors.textMuted },
    tabTextOn: { color: colors.primaryDark },
    expenseCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...iosShadow,
    },
    expenseIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    expenseTitle: { fontWeight: '800', color: colors.text, fontSize: 15 },
    expenseMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    expenseNotes: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 16 },
    expenseTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    tagPot: {
      backgroundColor: '#ecfdf5',
      borderRadius: radii.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    tagPotText: { color: colors.success, fontSize: 11, fontWeight: '800' },
    tagWallet: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    tagWalletText: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
    expenseAmt: { fontWeight: '800', color: colors.primaryDark, fontSize: 15 },
    reportCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...iosShadow,
    },
    splitCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...iosShadow,
    },
    splitAvatars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    splitAvatar: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    splitAvatarText: { fontWeight: '800', fontSize: 12 },
    modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,31,26,0.4)' },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      maxHeight: '88%',
      zIndex: 2,
    },
    sheetTitle: {
      fontSize: typography.subtitle,
      fontWeight: '800',
      color: colors.primaryDark,
      marginBottom: spacing.md,
    },
    preview: { color: colors.primaryDark, fontWeight: '700', marginBottom: spacing.md },
    label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6, marginTop: 4 },
    seg: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
    segBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      paddingVertical: 10,
      alignItems: 'center',
    },
    segBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    segText: { fontWeight: '700', color: colors.textSecondary },
    segTextOn: { color: colors.white },
  })
}

