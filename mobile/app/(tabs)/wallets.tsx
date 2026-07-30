import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
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
import { accountsApi, apiErrorMessage, asList } from '@/src/api/client'
import type { Account } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { BouncyPressable, Reveal } from '@/src/components/motion'
import { ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { toMoney } from '@/src/utils/format'

function sumBalances(list: Account[]) {
  return list.reduce((s, a) => s + toMoney(a.current_balance), 0)
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
  const [formError, setFormError] = useState('')

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      const { data } = await accountsApi.list()
      setAccounts(asList<Account>(data))
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

  const create = async () => {
    setFormError('')
    if (!name.trim()) {
      setFormError('Name is required.')
      return
    }
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
      setSaving(false)
    }
  }

  const total = sumBalances(accounts)
  const banks = accounts.filter((a) => a.type !== 'cash')
  const cash = accounts.filter((a) => a.type === 'cash')
  const maxAbsBalance = Math.max(1, ...accounts.map((a) => Math.abs(toMoney(a.current_balance))))

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
            <Text style={styles.sub}>Manage your bank and cash wallets.</Text>
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
          </>
        )}
      </ScrollView>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalRoot}>
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
        </View>
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
    sectionTitle: { fontWeight: '800', color: colors.text, fontSize: typography.body },
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
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,31,26,0.45)' },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
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
