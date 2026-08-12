import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { accountsApi, apiErrorMessage, asList, peopleApi } from '@/src/api/client'
import type { Account, PeopleInvitation, PeopleLink, PeopleProposal } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { BouncyPressable, Reveal } from '@/src/components/motion'
import { ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { InvitePersonSheet } from '@/src/people/InvitePersonSheet'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { fmtBalance, toMoney } from '@/src/utils/format'

function sumBalances(list: Account[]) {
  return list.reduce((s, a) => s + toMoney(a.current_balance), 0)
}

function proposalAcceptHint(action: string) {
  switch (action) {
    case 'lend':
      return 'Pick wallet where you received the money'
    case 'borrow':
      return 'Pick wallet the money came from'
    case 'pay':
      return 'Pick wallet where you received repayment'
    case 'receive':
      return 'Pick wallet you paid from'
    default:
      return 'Pick wallet to post into'
  }
}

export default function WalletsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { refreshKey, bumpRefresh } = useMoneyUi()
  const money = useMaskedMoney()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'bank' | 'cash'>('bank')
  const [opening, setOpening] = useState('0')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [formError, setFormError] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [incomingInvites, setIncomingInvites] = useState<PeopleInvitation[]>([])
  const [outgoingInvites, setOutgoingInvites] = useState<PeopleInvitation[]>([])
  const [incomingProposals, setIncomingProposals] = useState<PeopleProposal[]>([])
  const [links, setLinks] = useState<PeopleLink[]>([])
  const [inviteBusyId, setInviteBusyId] = useState<number | null>(null)
  const [proposalBusyId, setProposalBusyId] = useState<number | null>(null)
  const [acceptWalletId, setAcceptWalletId] = useState('')

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      const { data } = await accountsApi.list()
      const list = asList<Account>(data)
      setAccounts(list)
      const walletsOnly = list.filter((a) => a.type === 'bank' || a.type === 'cash')
      setAcceptWalletId((prev) => {
        if (prev && walletsOnly.some((w) => String(w.id) === prev)) return prev
        return walletsOnly[0] ? String(walletsOnly[0].id) : ''
      })
      try {
        const [invRes, linkRes, propRes] = await Promise.all([
          peopleApi.pendingInvites(),
          peopleApi.links(),
          peopleApi.pendingProposals(),
        ])
        setIncomingInvites(invRes.data?.incoming || [])
        setOutgoingInvites(invRes.data?.outgoing || [])
        setLinks(asList<PeopleLink>(linkRes.data))
        setIncomingProposals((propRes.data?.incoming || []) as PeopleProposal[])
      } catch {
        setIncomingInvites([])
        setOutgoingInvites([])
        setLinks([])
        setIncomingProposals([])
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load wallets.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const linkedPersonIds = useMemo(() => {
    const ids = new Set<number>()
    for (const link of links) {
      if (link.my_person?.id) ids.add(link.my_person.id)
    }
    return ids
  }, [links])

  const respondInvite = async (id: number, action: 'accept' | 'decline') => {
    setInviteBusyId(id)
    try {
      if (action === 'accept') await peopleApi.acceptInvite(id)
      else await peopleApi.declineInvite(id)
      bumpRefresh()
      await load(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update invitation.'))
    } finally {
      setInviteBusyId(null)
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
      setError(apiErrorMessage(err, 'Could not update money request.'))
    } finally {
      setProposalBusyId(null)
    }
  }

  const create = async () => {
    if (savingRef.current) return
    setFormError('')
    if (!name.trim()) {
      setFormError('Name is required.')
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      await accountsApi.create({
        name: name.trim(),
        type,
        opening_balance: toMoney(opening),
      })
      setCreateOpen(false)
      setName('')
      setOpening('0')
      bumpRefresh()
      await load(true)
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Could not create wallet.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const walletAccounts = accounts.filter((a) => a.type === 'bank' || a.type === 'cash')
  const total = sumBalances(walletAccounts)
  const banks = accounts.filter((a) => a.type === 'bank')
  const cash = accounts.filter((a) => a.type === 'cash')
  const people = accounts.filter((a) => a.type === 'person')
  const maxAbsBalance = Math.max(
    1,
    ...walletAccounts.map((a) => Math.abs(toMoney(a.current_balance))),
    ...people.map((a) => Math.abs(toMoney(a.current_balance))),
  )

  const renderWallet = (a: Account, index: number) => {
    const bal = toMoney(a.current_balance)
    const pct = Math.max(bal > 0 ? 3 : 0, Math.min(100, Math.round((Math.abs(bal) / maxAbsBalance) * 100)))
    const isCash = a.type === 'cash'
    return (
      <Reveal index={index} key={a.id}>
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={[styles.icon, isCash ? styles.iconCash : styles.iconBank]}>
              <FontAwesome name={isCash ? 'money' : 'university'} size={16} color={isCash ? colors.success : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{a.name}</Text>
              <Text style={styles.cardType}>Opening: {money.fmtBalance(a.opening_balance ?? 0)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.cardBal, money.amountStyle]}>{money.fmtBalance(bal)}</Text>
              <Text style={styles.cardType}>{isCash ? 'Cash / Wallet' : 'Bank Account'}</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${pct}%`, backgroundColor: isCash ? colors.success : colors.primary },
              ]}
            />
          </View>

          <View style={styles.cardActions}>
            <BouncyPressable
              style={styles.actionBtn}
              onPress={() => router.push({ pathname: '/(tabs)/reports', params: { wallet: String(a.id) } })}
            >
              <Text style={styles.actionText}>Transactions</Text>
            </BouncyPressable>
            <BouncyPressable style={styles.actionBtn}>
              <Text style={styles.actionText}>Edit</Text>
            </BouncyPressable>
            <BouncyPressable style={[styles.actionBtn, styles.actionBtnDanger]}>
              <Text style={styles.actionTextDanger}>Delete</Text>
            </BouncyPressable>
          </View>
        </View>
      </Reveal>
    )
  }

  const deletePerson = (a: Account) => {
    const bal = toMoney(a.current_balance)
    if (Math.abs(bal) >= 0.01) {
      setError('Settle this person to zero before deleting.')
      return
    }
    Alert.alert(
      'Delete person?',
      `Remove “${a.name}” from People? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await peopleApi.remove(a.id)
                bumpRefresh()
                await load(true)
              } catch (err) {
                setError(apiErrorMessage(err, 'Could not delete person. Settle to zero first.'))
              }
            })()
          },
        },
      ],
    )
  }

  const renderPerson = (a: Account, index: number) => {
    const bal = toMoney(a.current_balance)
    const status =
      Math.abs(bal) < 0.01 ? 'Settled' : bal > 0 ? 'They owe you' : 'You owe them'
    const isLinked = linkedPersonIds.has(a.id)
    const settled = Math.abs(bal) < 0.01
    return (
      <Reveal index={index} key={a.id}>
        <View style={styles.card}>
          <BouncyPressable
            onPress={() =>
              router.push({ pathname: '/people/[id]', params: { id: String(a.id), name: a.name } })
            }
          >
            <View style={styles.cardTop}>
              <View style={[styles.icon, styles.iconPerson]}>
                <FontAwesome name="user" size={16} color="#8b5cf6" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.cardName}>{a.name}</Text>
                  {isLinked ? (
                    <View style={styles.linkedBadge}>
                      <Text style={styles.linkedBadgeText}>Linked</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardType}>{status}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={[
                    styles.cardBal,
                    money.amountStyle,
                    { color: Math.abs(bal) < 0.01 ? colors.text : bal > 0 ? colors.success : colors.danger },
                  ]}
                >
                  {money.fmtBalance(bal)}
                </Text>
                <Text style={styles.cardType}>{isLinked ? 'CashTrail user' : 'Local'}</Text>
              </View>
            </View>
          </BouncyPressable>
          <View style={styles.cardActions}>
            <BouncyPressable
              style={styles.actionBtn}
              onPress={() =>
                router.push({ pathname: '/people/[id]', params: { id: String(a.id), name: a.name } })
              }
            >
              <Text style={styles.actionText}>History</Text>
            </BouncyPressable>
            {settled ? (
              <BouncyPressable
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={() => deletePerson(a)}
              >
                <Text style={styles.actionTextDanger}>Delete</Text>
              </BouncyPressable>
            ) : null}
          </View>
        </View>
      </Reveal>
    )
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
              void load(true)
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Wallets</Text>
              <AmountEyeToggle />
            </View>
            <Text style={styles.sub}>Manage bank, cash, and people balances.</Text>
          </View>
          <BouncyPressable style={styles.addBtn} onPress={() => setCreateOpen(true)}>
            <Text style={styles.addBtnText}>+ Create Wallet</Text>
          </BouncyPressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && accounts.length === 0 ? (
          <ActivityIndicator color={colors.primary} />
        ) : accounts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No wallets yet</Text>
            <Text style={styles.emptyBody}>Add a bank or cash wallet to start tracking.</Text>
          </View>
        ) : (
          <>
            <Reveal index={0}>
              <View style={styles.combinedCard}>
                <Text style={styles.combinedLabel}>Combined Balance</Text>
                <Text style={[styles.combinedValue, money.amountStyle]}>{money.fmtBalance(total)}</Text>
              </View>
            </Reveal>

            {banks.length > 0 ? (
              <>
                <View style={styles.sectionHead}>
                  <FontAwesome name="university" size={13} color={colors.text} />
                  <Text style={styles.sectionTitle}>Bank Wallets</Text>
                </View>
                {banks.map((a, i) => renderWallet(a, i))}
              </>
            ) : null}

            {cash.length > 0 ? (
              <>
                <View style={styles.sectionHead}>
                  <FontAwesome name="money" size={13} color={colors.text} />
                  <Text style={styles.sectionTitle}>Cash & Wallets</Text>
                </View>
                {cash.map((a, i) => renderWallet(a, banks.length + i))}
              </>
            ) : null}

            <View style={styles.sectionHead}>
              <FontAwesome name="users" size={13} color={colors.text} />
              <Text style={styles.sectionTitle}>People</Text>
              <BouncyPressable style={styles.peopleAddBtn} onPress={() => setInviteOpen(true)}>
                <Text style={styles.peopleAddText}>+ Add</Text>
              </BouncyPressable>
            </View>

            {incomingInvites.length > 0 ? (
              <View style={styles.inviteBox}>
                <Text style={styles.inviteTitle}>Link requests</Text>
                {incomingInvites.map((inv) => (
                  <View key={inv.id} style={styles.inviteRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{inv.from_user_name || inv.from_user_email}</Text>
                      <Text style={styles.cardType}>Wants to link for lend/borrow</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <BouncyPressable
                        style={[styles.inviteBtn, styles.inviteDecline]}
                        onPress={() => void respondInvite(inv.id, 'decline')}
                        disabled={inviteBusyId === inv.id}
                      >
                        <Text style={styles.inviteDeclineText}>Decline</Text>
                      </BouncyPressable>
                      <BouncyPressable
                        style={[styles.inviteBtn, styles.inviteAccept]}
                        onPress={() => void respondInvite(inv.id, 'accept')}
                        disabled={inviteBusyId === inv.id}
                      >
                        {inviteBusyId === inv.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.inviteAcceptText}>Accept</Text>
                        )}
                      </BouncyPressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {incomingProposals.length > 0 ? (
              <View style={[styles.inviteBox, { marginTop: spacing.sm }]}>
                <Text style={styles.inviteTitle}>Waiting for you</Text>
                <Text style={[styles.cardType, { marginBottom: 8 }]}>
                  Accept to post the matching entry — pick the wallet first.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
                  {walletAccounts.map((w) => {
                    const active = acceptWalletId === String(w.id)
                    return (
                      <Pressable
                        key={w.id}
                        onPress={() => setAcceptWalletId(String(w.id))}
                        style={[
                          styles.walletPickChip,
                          {
                            backgroundColor: active ? colors.primary : colors.surfaceMuted,
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>
                          {w.name}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
                {incomingProposals.map((p) => (
                  <View key={p.id} style={styles.inviteRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>
                        {p.proposer_name || 'Someone'} · {(p.action || '').replace(/^./, (c) => c.toUpperCase())}{' '}
                        {money.fmtBalance(p.amount)}
                      </Text>
                      <Text style={styles.cardType}>{proposalAcceptHint(p.action)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <BouncyPressable
                        style={[styles.inviteBtn, styles.inviteDecline]}
                        onPress={() => void respondProposal(p.id, 'decline')}
                        disabled={proposalBusyId === p.id}
                      >
                        <Text style={styles.inviteDeclineText}>Decline</Text>
                      </BouncyPressable>
                      <BouncyPressable
                        style={[styles.inviteBtn, styles.inviteAccept]}
                        onPress={() => void respondProposal(p.id, 'accept')}
                        disabled={proposalBusyId === p.id}
                      >
                        {proposalBusyId === p.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.inviteAcceptText}>Accept</Text>
                        )}
                      </BouncyPressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {outgoingInvites.length > 0 ? (
              <View style={[styles.inviteBox, { marginTop: spacing.sm }]}>
                <Text style={styles.inviteTitle}>Waiting for them</Text>
                {outgoingInvites.map((inv) => (
                  <View key={inv.id} style={styles.inviteRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{inv.display_name || inv.to_user_name || inv.to_user_email}</Text>
                      <Text style={styles.cardType}>Link request pending</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {people.length === 0 && incomingInvites.length === 0 ? (
              <View style={styles.emptyPeople}>
                <Text style={styles.emptyBody}>
                  No people yet. Tap + Add for a local person or invite a CashTrail user.
                </Text>
              </View>
            ) : (
              people.map((a, i) => renderPerson(a, banks.length + cash.length + i))
            )}
          </>
        )}
      </ScrollView>

      <InvitePersonSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onDone={() => {
          bumpRefresh()
          void load(true)
        }}
      />

      <Modal visible={createOpen} animationType="fade" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
          <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text style={styles.sheetTitle}>New wallet</Text>
            <ErrorBanner message={formError} />
            <Field label="Name" value={name} onChangeText={setName} placeholder="Meezan / Cash" autoCapitalize="words" />
            <Text style={styles.label}>Type</Text>
            <View style={styles.seg}>
              {(['bank', 'cash'] as const).map((t) => (
                <Pressable key={t} onPress={() => setType(t)} style={[styles.segBtn, type === t && styles.segBtnOn]}>
                  <Text style={[styles.segText, type === t && styles.segTextOn]}>{t === 'bank' ? 'Bank' : 'Cash'}</Text>
                </Pressable>
              ))}
            </View>
            <Field
              label="Opening balance"
              value={opening}
              onChangeText={setOpening}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <PrimaryButton title="Create wallet" onPress={() => void create()} loading={saving} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg, gap: spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: typography.title, fontWeight: '800', color: colors.text },
    sub: { color: colors.textMuted, fontWeight: '600', marginTop: 2, fontSize: typography.caption },
    addBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: radii.sm,
    },
    addBtnText: { color: colors.white, fontWeight: '800', fontSize: 13 },
    error: { color: colors.danger, marginBottom: spacing.md },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyTitle: { fontWeight: '800', color: colors.text },
    emptyBody: { color: colors.textMuted, marginTop: 4, fontSize: typography.caption },
    combinedCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    combinedLabel: { color: colors.textMuted, fontWeight: '700', fontSize: typography.caption },
    combinedValue: { color: colors.primary, fontWeight: '800', fontSize: typography.title },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: spacing.sm,
      marginTop: spacing.xs,
    },
    sectionTitle: { fontWeight: '800', color: colors.text, fontSize: typography.body, flex: 1 },
    peopleAddBtn: {
      backgroundColor: '#8b5cf6',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radii.sm,
    },
    peopleAddText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    linkedBadge: {
      backgroundColor: '#8b5cf622',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    linkedBadgeText: { color: '#8b5cf6', fontWeight: '800', fontSize: 10 },
    inviteBox: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    inviteTitle: { fontWeight: '800', color: colors.text, marginBottom: spacing.sm, fontSize: 13 },
    inviteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: spacing.sm,
    },
    inviteBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.sm,
      minWidth: 72,
      alignItems: 'center',
    },
    inviteAccept: { backgroundColor: colors.primary },
    inviteAcceptText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    inviteDecline: { borderWidth: 1, borderColor: colors.border },
    inviteDeclineText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
    walletPickChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.sm,
      borderWidth: 1,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBank: { backgroundColor: colors.primarySoft + '26' },
    iconCash: { backgroundColor: '#dcfce7' },
    iconPerson: { backgroundColor: '#8b5cf618' },
    emptyPeople: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardName: { fontWeight: '800', color: colors.text, fontSize: typography.body },
    cardType: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    cardBal: { fontWeight: '800', color: colors.text, fontSize: typography.body },
    progressTrack: {
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.surfaceMuted,
      marginTop: spacing.md,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 3 },
    cardActions: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
    actionBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    actionText: { fontWeight: '700', fontSize: 12, color: colors.textSecondary },
    actionBtnDanger: { borderColor: '#fecaca' },
    actionTextDanger: { fontWeight: '700', fontSize: 12, color: colors.danger },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,31,26,0.45)' },
    modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      maxHeight: '88%',
      zIndex: 2,
    },
    sheetTitle: { fontSize: typography.title, fontWeight: '800', color: colors.primaryDark, marginBottom: spacing.md },
    label: {
      fontSize: typography.label,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      textTransform: 'uppercase',
    },
    seg: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
    segBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    segBtnOn: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
    segText: { fontWeight: '700', color: colors.textSecondary },
    segTextOn: { color: colors.white },
  })
}
