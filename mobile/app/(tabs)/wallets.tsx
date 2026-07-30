import { useCallback, useEffect, useState } from 'react'
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { accountsApi, apiErrorMessage, asList } from '@/src/api/client'
import type { Account } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { useMoneyUi } from '@/src/context/MoneyUiContext'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { colors, radii, spacing, typography } from '@/src/theme/colors'
import { toMoney } from '@/src/utils/format'

function sumBalances(list: Account[]) {
  return list.reduce((s, a) => s + toMoney(a.current_balance), 0)
}

export default function WalletsScreen() {
  const insets = useSafeAreaInsets()
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
            <Text style={[styles.sub, money.amountStyle]}>{money.fmtBalance(total)} total</Text>
          </View>
          <Pressable style={styles.addBtn} onPress={() => setCreateOpen(true)}>
            <Text style={styles.addBtnText}>+ New</Text>
          </Pressable>
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
          accounts.map((a) => (
            <View key={a.id} style={styles.card}>
              <View style={[styles.icon, a.type === 'cash' ? styles.iconCash : styles.iconBank]}>
                <Text style={styles.iconLetter}>{a.type === 'cash' ? 'C' : 'B'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{a.name}</Text>
                <Text style={styles.cardType}>{a.type === 'cash' ? 'Cash' : 'Bank'}</Text>
              </View>
              <Text style={[styles.cardBal, money.amountStyle]}>{money.fmtBalance(a.current_balance)}</Text>
            </View>
          ))
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

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: typography.title, fontWeight: '800', color: colors.text },
  sub: { color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  addBtnText: { color: colors.white, fontWeight: '800' },
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
  card: {
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
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBank: { backgroundColor: colors.primaryDark },
  iconCash: { backgroundColor: '#0f766e' },
  iconLetter: { color: colors.white, fontWeight: '800', fontSize: 16 },
  cardName: { fontWeight: '800', color: colors.text, fontSize: typography.body },
  cardType: { color: colors.textMuted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  cardBal: { fontWeight: '800', color: colors.primaryDark },
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
