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
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiErrorMessage, budgetsApi } from '@/src/api/client'
import type { BudgetPayload, BudgetRow } from '@/src/api/types'
import { AmountEyeToggle } from '@/src/components/AmountEyeToggle'
import { BouncyPressable, Reveal } from '@/src/components/motion'
import { ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { getCategoryMeta } from '@/src/constants/categories'
import { useOffline } from '@/src/offline'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { iosShadow, radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { toMoney } from '@/src/utils/format'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function barColor(status: string, colors: ColorTokens): string {
  if (status === 'over') return colors.danger
  if (status === 'warning') return '#f59e0b'
  if (status === 'ok') return colors.success
  return colors.border
}

export default function BudgetsScreen() {
  const now = new Date()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const money = useMaskedMoney()
  const { online } = useOffline()

  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<BudgetPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState<BudgetRow | null>(null)
  const [limitInput, setLimitInput] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true)
    setError('')
    try {
      const res = await budgetsApi.get(year, month)
      setData(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load budgets.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [year, month])

  useEffect(() => {
    void load()
  }, [load])

  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (isCurrent) return
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else setMonth((m) => m + 1)
  }

  const visibleRows = useMemo(() => {
    if (!data?.rows?.length) return []
    const [allRow, ...rest] = data.rows
    const body = showAll ? rest : rest.filter((r) => r.has_limit || toMoney(r.spent) > 0)
    return allRow ? [allRow, ...body] : body
  }, [data, showAll])

  const summaryPct = data?.total_limit
    ? Math.min(100, Math.round((toMoney(data.total_spent) / toMoney(data.total_limit)) * 100))
    : null

  const openEdit = (row: BudgetRow) => {
    setEditing(row)
    setLimitInput(row.has_limit && row.limit != null ? String(row.limit) : '')
    setError('')
  }

  const saveLimit = async () => {
    if (!editing || !online) {
      setError(online ? '' : 'Go online to save budgets.')
      return
    }
    const raw = limitInput.trim()
    const amount = raw === '' ? null : Number(raw)
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      setError('Enter a valid PKR amount.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await budgetsApi.upsert({
        year,
        month,
        category: editing.category,
        limit_amount: amount != null && amount > 0 ? amount : null,
      })
      setData(res.data)
      setEditing(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save budget.'))
    } finally {
      setSaving(false)
    }
  }

  const clearLimit = async () => {
    if (!editing || !online) return
    setSaving(true)
    setError('')
    try {
      const res = editing.id
        ? await budgetsApi.remove(editing.id, year, month)
        : await budgetsApi.upsert({
            year, month, category: editing.category, limit_amount: null,
          })
      setData(res.data)
      setEditing(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not clear budget.'))
    } finally {
      setSaving(false)
    }
  }

  const copyPrevious = async () => {
    if (!online) {
      setError('Go online to copy budgets.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await budgetsApi.copyFromPrevious(year, month)
      setData(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not copy previous month.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 110 }]}
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
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.title}>Budgets</Text>
          <AmountEyeToggle />
        </View>

        <View style={styles.monthRow}>
          <Pressable onPress={prevMonth} hitSlop={10} style={styles.monthBtn}>
            <FontAwesome name="chevron-left" size={12} color={colors.primaryDark} />
          </Pressable>
          <Pressable
            onPress={() => {
              setYear(now.getFullYear())
              setMonth(now.getMonth() + 1)
            }}
            style={styles.monthPill}
          >
            <Text style={styles.monthPillText}>
              {isCurrent ? 'This month' : `${MONTH_NAMES[month - 1]} ${year}`}
            </Text>
          </Pressable>
          <Pressable onPress={nextMonth} hitSlop={10} style={[styles.monthBtn, isCurrent && { opacity: 0.35 }]} disabled={isCurrent}>
            <FontAwesome name="chevron-right" size={12} color={colors.primaryDark} />
          </Pressable>
        </View>

        <ErrorBanner message={error && !editing ? error : ''} />

        {loading && !data ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {data ? (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLab}>{data.period_label}</Text>
              <Text style={[styles.summaryAmt, money.amountStyle]}>
                {money.fmt(data.total_spent)}
                <Text style={styles.summaryAmtMuted}>
                  {data.total_limit != null ? ` / ${money.fmt(data.total_limit)}` : ' spent'}
                </Text>
              </Text>
              <Text style={styles.summaryMeta}>
                {data.total_limit != null
                  ? `${summaryPct}% of budget used`
                  : 'Set limits per category — or an overall cap on All expenses'}
              </Text>
              {data.total_limit != null ? (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${summaryPct ?? 0}%`,
                        backgroundColor:
                          (summaryPct ?? 0) > 100
                            ? colors.danger
                            : (summaryPct ?? 0) > 80
                              ? '#f59e0b'
                              : colors.success,
                      },
                    ]}
                  />
                </View>
              ) : null}
              <View style={styles.summaryActions}>
                <BouncyPressable style={styles.secondaryChip} onPress={() => void copyPrevious()}>
                  <Text style={styles.secondaryChipText}>Copy last month</Text>
                </BouncyPressable>
                <BouncyPressable style={styles.secondaryChip} onPress={() => setShowAll((v) => !v)}>
                  <Text style={styles.secondaryChipText}>{showAll ? 'Hide empty' : 'Show all'}</Text>
                </BouncyPressable>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Set a budget</Text>

            {visibleRows.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No spending yet</Text>
                <Text style={styles.emptyBody}>Add expenses this month, then set category limits.</Text>
              </View>
            ) : (
              visibleRows.map((row, i) => {
                const isAll = row.category === '__all__'
                const meta = isAll
                  ? { icon: 'pie-chart' as const, color: colors.primary, label: 'All expenses' }
                  : getCategoryMeta(row.category)
                const pctW = row.has_limit && row.percent != null
                  ? Math.min(100, Math.max(3, row.percent))
                  : 0
                return (
                  <Reveal index={i} key={row.category}>
                    <View style={styles.rowCard}>
                      <View style={[styles.catIcon, { backgroundColor: `${meta.color}22` }]}>
                        <FontAwesome
                          name={isAll ? 'pie-chart' : meta.icon}
                          size={15}
                          color={meta.color}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.rowTop}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {isAll ? 'All expenses' : meta.label}
                          </Text>
                          <Text style={[styles.rowSpent, money.amountStyle]}>
                            {money.fmt(row.spent)}
                            {row.has_limit ? (
                              <Text style={styles.rowLimit}> / {money.fmt(row.limit!)}</Text>
                            ) : null}
                          </Text>
                        </View>
                        {row.has_limit ? (
                          <>
                            <View style={styles.progressTrackSm}>
                              <View
                                style={[
                                  styles.progressFill,
                                  { width: `${pctW}%`, backgroundColor: barColor(row.status, colors) },
                                ]}
                              />
                            </View>
                            <Text style={[styles.rowHint, { color: barColor(row.status, colors) }]}>
                              {row.status === 'over'
                                ? `Over by ${money.fmt(row.over ?? 0)}`
                                : row.status === 'warning'
                                  ? `${row.percent}% used — almost there`
                                  : `${money.fmt(row.remaining ?? 0)} left`}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.rowHint}>No limit set</Text>
                        )}
                      </View>
                      <BouncyPressable
                        style={row.has_limit ? styles.editChip : styles.setChip}
                        onPress={() => openEdit(row)}
                      >
                        <Text style={row.has_limit ? styles.editChipText : styles.setChipText}>
                          {row.has_limit ? 'Edit' : 'Set'}
                        </Text>
                      </BouncyPressable>
                    </View>
                  </Reveal>
                )
              })
            )}

            <Text style={styles.footnote}>
              Bank transfers and people lend/borrow are excluded. Limits are PKR per calendar month.
            </Text>
          </>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(editing)} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => !saving && setEditing(null)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Text style={styles.sheetTitle}>
              {editing?.category === '__all__'
                ? 'Overall monthly budget'
                : `Budget · ${editing?.label || ''}`}
            </Text>
            <Text style={styles.sheetHint}>
              Spent this month: {money.fmt(editing?.spent ?? 0)}
            </Text>
            <ErrorBanner message={error} />
            <Field
              label="Monthly limit (PKR)"
              value={limitInput}
              onChangeText={setLimitInput}
              keyboardType="decimal-pad"
              placeholder="e.g. 15000"
            />
            <PrimaryButton title={saving ? 'Saving…' : 'Save'} onPress={() => void saveLimit()} loading={saving} />
            {editing?.has_limit ? (
              <Pressable onPress={() => void clearLimit()} style={{ marginTop: 14, alignItems: 'center' }}>
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Clear limit</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    pad: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    title: { fontSize: typography.title, fontWeight: '800', color: colors.text },
    monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
    monthBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    monthPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 9,
      borderRadius: radii.full,
      backgroundColor: colors.primarySoft + '33',
    },
    monthPillText: { fontWeight: '800', color: colors.primaryDark, fontSize: 13 },
    loadingBox: { paddingVertical: 48, alignItems: 'center' },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...iosShadow,
      gap: 6,
    },
    summaryLab: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    summaryAmt: { fontSize: 26, fontWeight: '800', color: colors.text },
    summaryAmtMuted: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
    summaryMeta: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    summaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    secondaryChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.full,
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    secondaryChipText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
    progressTrack: {
      height: 8,
      borderRadius: 99,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginTop: 4,
    },
    progressTrackSm: {
      height: 6,
      borderRadius: 99,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginTop: 6,
    },
    progressFill: { height: '100%', borderRadius: 99 },
    sectionTitle: {
      marginTop: spacing.sm,
      marginBottom: 2,
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
    },
    rowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    catIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' },
    rowTitle: { fontWeight: '700', fontSize: 14, color: colors.text, flex: 1 },
    rowSpent: { fontWeight: '800', fontSize: 13, color: colors.text },
    rowLimit: { fontWeight: '600', fontSize: 11, color: colors.textMuted },
    rowHint: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
    setChip: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radii.full,
    },
    setChipText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    editChip: {
      backgroundColor: colors.primarySoft + '44',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.full,
    },
    editChipText: { color: colors.primaryDark, fontWeight: '800', fontSize: 12 },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
    },
    emptyTitle: { fontWeight: '800', fontSize: 15, color: colors.text },
    emptyBody: { color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
    footnote: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    sheetTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    sheetHint: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  })
}
