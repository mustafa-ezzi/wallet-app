import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { apiErrorMessage, slipsApi } from '@/src/api/client'
import { AppSheet } from '@/src/components/AppSheet'
import { ErrorBanner, Field, PrimaryButton } from '@/src/components/ui'
import { useRemoteConfig } from '@/src/config/RemoteConfigContext'
import { useAuth } from '@/src/context/AuthContext'
import { homeCurrencySymbol } from '@/src/currency/homeCurrency'
import { track } from '@/src/lib/analytics'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography } from '@/src/theme/colors'
import { SLIP_LOGO_DATA_URI } from './logo'
import { getAskSlipAfterPayment, setAskSlipAfterPayment } from './promptPrefs'
import { shareOrCopySlipMessage } from './shareMessage'
import { shareSlipPdf } from './shareSlipPdf'
import { buildSlipData } from './slipData'
import { slipDate, slipLabels } from './templates/shared'
import type { SlipData, SlipHistoryResponse, SlipKind } from './types'

export type SlipTarget = {
  kind: SlipKind
  id: number
  name: string
  /** Payment to highlight as "This payment" (set after recording one). */
  highlightTransactionId?: number | null
}

const NAME_KEY = 'wallettrails_slip_prepared_by'

async function loadSavedName(): Promise<string> {
  try {
    if (Platform.OS === 'web') return (typeof localStorage !== 'undefined' && localStorage.getItem(NAME_KEY)) || ''
    return (await SecureStore.getItemAsync(NAME_KEY)) || ''
  } catch {
    return ''
  }
}

async function saveName(name: string) {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(NAME_KEY, name)
      return
    }
    await SecureStore.setItemAsync(NAME_KEY, name)
  } catch {
    /* ignore */
  }
}

function isProRequired(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { code?: string } } })?.response
  return res?.status === 403 && res?.data?.code === 'pro_required'
}

function fetchHistory(target: SlipTarget) {
  if (target.kind === 'payable') return slipsApi.payable(target.id)
  if (target.kind === 'receivable') return slipsApi.receivable(target.id)
  return slipsApi.project(target.id)
}

/**
 * Opens payment slips with the Pro and Hide-amounts checks in front.
 * Render `slipSheets` once on the screen and call `openSlip` from any card.
 * After saving a payment, call `offerAfterPayment` to ask about generating a slip.
 */
export function useSlipLauncher() {
  const { premium, flag } = useRemoteConfig()
  const { amountsHidden, unlockSheetOpen, openUnlockSheet } = usePrivacyLock()
  const [target, setTarget] = useState<SlipTarget | null>(null)
  const [proOpen, setProOpen] = useState(false)
  const [prompt, setPrompt] = useState<SlipTarget | null>(null)
  const pendingRef = useRef<SlipTarget | null>(null)
  const offeringRef = useRef(false)

  const proOnly = flag('enforce_pro_slips') === true && !premium.is_premium

  const openSlip = useCallback(
    (next: SlipTarget) => {
      track('slip_opened', { kind: next.kind })
      if (proOnly) {
        track('slip_pro_required', { kind: next.kind })
        setProOpen(true)
        return
      }
      if (amountsHidden) {
        pendingRef.current = next
        openUnlockSheet()
        return
      }
      setTarget(next)
    },
    [proOnly, amountsHidden, openUnlockSheet],
  )

  /** After a successful Save payment / Save receipt (not monthly costs). */
  const offerAfterPayment = useCallback(async (next: SlipTarget) => {
    if (offeringRef.current) return
    offeringRef.current = true
    try {
      if (!(await getAskSlipAfterPayment())) return
      setPrompt(next)
    } finally {
      offeringRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!pendingRef.current) return
    if (!amountsHidden) {
      setTarget(pendingRef.current)
      pendingRef.current = null
    } else if (!unlockSheetOpen) {
      pendingRef.current = null
    }
  }, [amountsHidden, unlockSheetOpen])

  // Close the slip if the app re-locks while it is open.
  useEffect(() => {
    if (amountsHidden) setTarget(null)
  }, [amountsHidden])

  const slipSheets = (
    <>
      <SlipPromptSheet
        target={prompt}
        onClose={() => setPrompt(null)}
        onGenerate={(t) => {
          setPrompt(null)
          track('slip_prompt_accepted', { kind: t.kind })
          openSlip(t)
        }}
        onDismiss={(dontAskAgain) => {
          const kind = prompt?.kind
          setPrompt(null)
          track('slip_prompt_dismissed', { kind, dont_ask_again: dontAskAgain })
          if (dontAskAgain) void setAskSlipAfterPayment(false)
        }}
      />
      <SlipSheet
        target={target}
        onClose={() => setTarget(null)}
        onProRequired={() => {
          setTarget(null)
          setProOpen(true)
        }}
      />
      <ProSlipSheet visible={proOpen} onClose={() => setProOpen(false)} />
    </>
  )

  return { openSlip, offerAfterPayment, slipSheets }
}

function SlipPromptSheet({
  target,
  onClose,
  onGenerate,
  onDismiss,
}: {
  target: SlipTarget | null
  onClose: () => void
  onGenerate: (target: SlipTarget) => void
  onDismiss: (dontAskAgain: boolean) => void
}) {
  const colors = useColors()
  const [dontAsk, setDontAsk] = useState(false)

  useEffect(() => {
    if (!target) setDontAsk(false)
  }, [target])

  return (
    <AppSheet
      visible={target != null}
      onClose={onClose}
      title="Payment saved"
      subtitle={target?.name}
      placement="center"
    >
      <Text style={[styles.proBody, { color: colors.textSecondary }]}>
        Generate a slip for this payment?
      </Text>
      <PrimaryButton title="Generate slip" onPress={() => target && onGenerate(target)} />
      <Pressable
        onPress={() => onDismiss(dontAsk)}
        style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border }, pressed && { opacity: 0.85 }]}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Not now</Text>
      </Pressable>
      <Pressable
        onPress={() => setDontAsk((v) => !v)}
        style={styles.dontAskRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: dontAsk }}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: colors.border, backgroundColor: dontAsk ? colors.primary : colors.surface },
          ]}
        >
          {dontAsk ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <Text style={[styles.dontAskText, { color: colors.textMuted }]}>
          Don't ask again (you can turn this back on in Settings)
        </Text>
      </Pressable>
    </AppSheet>
  )
}

function ProSlipSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors()
  return (
    <AppSheet visible={visible} onClose={onClose} title="WalletTrails Pro" placement="center">
      <Text style={[styles.proBody, { color: colors.textSecondary }]}>
        Payment slips are part of WalletTrails Pro. Share a clean PDF record of every payment on a loan or
        installment plan, with the remaining amount at the end.
      </Text>
      <PrimaryButton title="OK" onPress={onClose} />
    </AppSheet>
  )
}

function SlipSheet({
  target,
  onClose,
  onProRequired,
}: {
  target: SlipTarget | null
  onClose: () => void
  onProRequired: () => void
}) {
  const colors = useColors()
  const money = useMaskedMoney()
  const { user } = useAuth()
  const { config } = useRemoteConfig()
  const [history, setHistory] = useState<SlipHistoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [sharing, setSharing] = useState(false)
  const [messageBusy, setMessageBusy] = useState(false)
  const [messageHint, setMessageHint] = useState('')

  const load = useCallback(async () => {
    if (!target) return
    setLoading(true)
    setError('')
    try {
      const { data } = await fetchHistory(target)
      setHistory(data)
    } catch (err) {
      if (isProRequired(err)) {
        onProRequired()
        return
      }
      setError(apiErrorMessage(err, 'Could not load the payment history.'))
    } finally {
      setLoading(false)
    }
  }, [target, onProRequired])

  useEffect(() => {
    if (!target) {
      setHistory(null)
      setError('')
      setSharing(false)
      setMessageBusy(false)
      setMessageHint('')
      return
    }
    void load()
    void loadSavedName().then((saved) => {
      const profileName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
      setName(saved || profileName || user?.username || '')
    })
    // Reload only when a different record is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, target?.id])

  const slipFromHistory = (): SlipData | null => {
    if (!history || !target) return null
    return buildSlipData(history, {
      preparedBy: name.trim(),
      currencySymbol: homeCurrencySymbol(),
      logoDataUri: SLIP_LOGO_DATA_URI,
      storeUrl: config.store_url,
      highlightTransactionId: target.highlightTransactionId ?? null,
    })
  }

  const onShare = async () => {
    if (!history || !target) return
    setSharing(true)
    setError('')
    setMessageHint('')
    try {
      const data = slipFromHistory()
      if (!data) return
      track('slip_generated', { kind: target.kind, rows: data.payments.length })
      await shareSlipPdf(data)
      if (data.preparedBy && data.preparedBy !== 'WalletTrails user') void saveName(data.preparedBy)
      track('slip_shared', { kind: target.kind, rows: data.payments.length })
      if (Platform.OS !== 'web') {
        setMessageHint('PDF ready. Tip: tap Share message to send the Play Store link with it.')
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create the slip PDF.'))
    } finally {
      setSharing(false)
    }
  }

  const onShareMessage = async () => {
    if (!history || !target) return
    setMessageBusy(true)
    setError('')
    setMessageHint('')
    try {
      const data = slipFromHistory()
      if (!data) return
      const result = await shareOrCopySlipMessage(data)
      if (result === 'copied') {
        setMessageHint('Share message copied. Paste it with the PDF.')
        track('slip_message_copied', { kind: target.kind })
      } else if (result === 'shared') {
        track('slip_message_shared', { kind: target.kind })
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not share the message.'))
    } finally {
      setMessageBusy(false)
    }
  }

  const labels = history ? slipLabels(history.direction, history.kind) : null

  return (
    <AppSheet
      visible={target != null}
      onClose={onClose}
      title="Payment slip"
      subtitle={target?.name}
      scroll
    >
      {loading && !history ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
      <ErrorBanner message={error} />
      {error && !history ? <PrimaryButton title="Try again" onPress={() => void load()} /> : null}

      {history && labels ? (
        <>
          <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
            <SummaryRow label="Total amount" value={money.fmt(history.total_amount)} style={money.amountStyle} />
            <SummaryRow label={labels.totalPaidLabel} value={money.fmt(history.total_paid)} style={money.amountStyle} />
            <SummaryRow
              label={labels.remainingLabel}
              value={money.fmt(history.remaining_amount)}
              style={money.amountStyle}
              strong
            />
          </View>
          {history.paid_in_full ? (
            <Text style={[styles.note, { color: colors.success }]}>
              ✓ {history.direction === 'owe' ? 'Paid in full' : 'Received in full'}
            </Text>
          ) : null}
          {history.closed_without_full_payment ? (
            <Text style={[styles.note, { color: colors.warning }]}>
              This record was closed without full payment.
            </Text>
          ) : null}

          <View style={[styles.table, { borderColor: colors.border }]}>
            <View style={[styles.row, styles.headRow, { backgroundColor: colors.primaryDark }]}>
              <Text style={[styles.sno, styles.headText]}>S.No</Text>
              <Text style={[styles.date, styles.headText]}>Payment date</Text>
              <Text style={[styles.amt, styles.headText]}>{labels.paymentColumn}</Text>
            </View>
            {history.payments.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>{labels.emptyText}</Text>
            ) : (
              history.payments.map((p) => {
                const hl = target?.highlightTransactionId != null && p.transaction_id === target.highlightTransactionId
                return (
                  <View
                    key={`${p.index}-${p.transaction_id ?? 'adv'}`}
                    style={[styles.row, { borderTopColor: colors.border }, hl && { backgroundColor: colors.surfaceMuted }]}
                  >
                    <Text style={[styles.sno, { color: colors.textMuted }]}>{p.index}</Text>
                    <Text style={[styles.date, { color: colors.text }]}>
                      {slipDate(p.date)}
                      {p.is_advance ? <Text style={{ color: colors.infoText }}>  · Advance</Text> : null}
                    </Text>
                    <Text style={[styles.amt, money.amountStyle, { color: colors.text }]}>{money.fmt(p.amount)}</Text>
                  </View>
                )
              })
            )}
          </View>

          <Field
            label="Your name (shown on the slip)"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
            maxLength={60}
          />
          <PrimaryButton
            title={Platform.OS === 'web' ? 'Save as PDF' : 'Generate & share PDF'}
            onPress={() => void onShare()}
            loading={sharing}
            disabled={sharing || messageBusy}
          />
          <Pressable
            onPress={() => void onShareMessage()}
            disabled={sharing || messageBusy}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border },
              (pressed || messageBusy) && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.primaryDark }]}>
              {Platform.OS === 'web' ? 'Copy share message' : 'Share message'}
            </Text>
          </Pressable>
          {messageHint ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>{messageHint}</Text>
          ) : null}
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Close</Text>
          </Pressable>
        </>
      ) : null}
    </AppSheet>
  )
}

function SummaryRow({
  label,
  value,
  style,
  strong,
}: {
  label: string
  value: string
  style?: object
  strong?: boolean
}) {
  const colors = useColors()
  return (
    <View style={styles.sumRow}>
      <Text style={[styles.sumLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.sumValue, style, { color: strong ? colors.primaryDark : colors.text }, strong && styles.sumStrong]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  proBody: { fontSize: typography.body, lineHeight: 20, marginBottom: spacing.lg },
  summary: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  sumLabel: { fontSize: typography.body },
  sumValue: { fontSize: typography.body, fontWeight: '700' },
  sumStrong: { fontSize: typography.subtitle, fontWeight: '800' },
  note: { fontSize: typography.caption, fontWeight: '700', marginBottom: spacing.sm },
  table: { borderWidth: 1, borderRadius: radii.md, overflow: 'hidden', marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  headRow: { borderTopWidth: 0 },
  headText: { color: '#fff', fontSize: typography.label, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  sno: { width: 44, fontSize: typography.caption },
  date: { flex: 1, fontSize: typography.body },
  amt: { fontSize: typography.body, fontWeight: '700', textAlign: 'right' },
  empty: { textAlign: 'center', paddingVertical: spacing.lg },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  secondaryBtnText: { fontWeight: '800', fontSize: typography.body },
  dontAskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  dontAskText: { flex: 1, fontSize: typography.caption, lineHeight: 18 },
  hint: { fontSize: typography.caption, lineHeight: 18, marginTop: spacing.sm, textAlign: 'center' },
})
