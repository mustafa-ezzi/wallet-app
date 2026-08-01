import { useEffect, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Screen, PrimaryButton, ErrorBanner } from '@/src/components/ui'
import { useAuth } from '@/src/context/AuthContext'
import { useOffline } from '@/src/offline'
import { useReminders } from '@/src/notifications'
import { registerDeviceToken } from '@/src/notifications/pushRegistration'
import { requestReminderPermission } from '@/src/notifications/schedule'
import api from '@/src/api/client'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'
import type { PrivacyTimeout } from '@/src/privacy/storage'
import { useTheme } from '@/src/theme/ThemeContext'
import { radii, spacing, typography } from '@/src/theme/colors'

const TIMEOUTS: { id: PrivacyTimeout; label: string }[] = [
  { id: 'immediate', label: 'Immediate' },
  { id: '1m', label: '1 minute' },
  { id: '5m', label: '5 minutes' },
]

export default function SettingsScreen() {
  const { user, logout } = useAuth()
  const { clearLocal, online, pending, syncNow, syncing } = useOffline()
  const reminders = useReminders()
  const privacy = usePrivacyLock()
  const { themeId, themes, setThemeAnimated, colors } = useTheme()
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email

  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinSaved, setPinSaved] = useState(false)
  const [enableError, setEnableError] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [marketingEnabled, setMarketingEnabled] = useState(true)
  const [marketingBusy, setMarketingBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void api.get('/notification-preferences/').then((res) => {
      if (cancelled) return
      const v = res.data?.marketing_enabled
      if (typeof v === 'boolean') setMarketingEnabled(v)
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [user])

  const savePin = async () => {
    setPinError('')
    setPinSaved(false)
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      setPinError('PIN must be 4–6 digits.')
      return
    }
    if (pin !== pinConfirm) {
      setPinError('PINs do not match.')
      return
    }
    await privacy.setAppPin(pin)
    setPin('')
    setPinConfirm('')
    setPinSaved(true)
  }

  const onTogglePrivacy = async (on: boolean) => {
    setEnableError('')
    if (on && !privacy.hasPin && !privacy.biometricsAvailable) {
      setEnableError('Set a CashTrail PIN below before enabling privacy lock (required on web / devices without biometrics).')
      return
    }
    if (on && !privacy.hasPin) {
      // Allow enable with biometrics only, but warn to set PIN as fallback
      setEnableError('Tip: set a PIN below as a backup if biometrics fail.')
    }
    await privacy.setEnabled(on)
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Signed in as</Text>
          <Text style={[styles.value, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{user?.email}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>Currency: {user?.currency || 'PKR'}</Text>
        </View>

        <Text style={[styles.section, { color: colors.primaryDark }]}>Theme</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.swatchRow}>
            {themes.map((t) => {
              const selected = themeId === t.id
              return (
                <Pressable
                  key={t.id}
                  onPress={(e) => {
                    const { pageX, pageY } = e.nativeEvent
                    setThemeAnimated(t.id, pageX, pageY)
                  }}
                  style={styles.swatchWrap}
                >
                  <View
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: t.swatch,
                        borderColor: selected ? t.swatchEdge : 'transparent',
                        transform: [{ scale: selected ? 1.08 : 1 }],
                      },
                    ]}
                  >
                    {selected ? <Text style={styles.swatchCheck}>✓</Text> : null}
                  </View>
                  <Text
                    style={[
                      styles.swatchLabel,
                      { color: selected ? colors.primaryDark : colors.textMuted },
                    ]}
                  >
                    {t.name}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <Text style={[styles.section, { color: colors.primaryDark }]}>Privacy lock</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Hide amounts</Text>
              <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                Amounts show as PKR ••••. Tap the eye on the balance card to reveal with biometrics or PIN.
              </Text>
            </View>
            <Switch
              value={privacy.enabled}
              onValueChange={(v) => void onTogglePrivacy(v)}
              trackColor={{ false: colors.border, true: '#86efac' }}
              thumbColor={privacy.enabled ? colors.primary : '#f4f4f5'}
            />
          </View>

          {enableError ? <Text style={styles.tip}>{enableError}</Text> : null}

          <Text style={[styles.rowTitle, { marginTop: spacing.lg, color: colors.text }]}>Hide amounts after background</Text>
          <View style={styles.seg}>
            {TIMEOUTS.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => void privacy.setTimeoutPref(t.id)}
                style={[
                  styles.segBtn,
                  { borderColor: colors.border },
                  privacy.timeout === t.id && { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
                ]}
              >
                <Text style={[styles.segText, { color: colors.textSecondary }, privacy.timeout === t.id && styles.segTextOn]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.row, { marginTop: spacing.lg }]}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Block screenshots</Text>
              <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                Stop others from capturing your balances on this device.
              </Text>
            </View>
            <Switch
              value={privacy.blockScreenshots}
              onValueChange={(v) => void privacy.setScreenshotBlock(v)}
              trackColor={{ false: colors.border, true: '#86efac' }}
              thumbColor={privacy.blockScreenshots ? colors.primary : '#f4f4f5'}
            />
          </View>

          {privacy.enabled ? (
          <Pressable style={[styles.lockBtn, { backgroundColor: colors.surfaceMuted }]} onPress={privacy.lockNow}>
            <Text style={[styles.lockBtnText, { color: colors.primaryDark }]}>Hide amounts now</Text>
          </Pressable>
          ) : null}
        </View>

        <Text style={[styles.section, { color: colors.primaryDark }]}>CashTrail PIN</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.rowHint, { color: colors.textMuted }]}>
            {privacy.hasPin ? 'PIN is set. Enter a new one to change it.' : 'Create a 4–6 digit PIN fallback.'}
          </Text>
          <ErrorBanner message={pinError} />
          {pinSaved ? <Text style={styles.ok}>PIN saved.</Text> : null}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>New PIN</Text>
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
            placeholder="••••"
            placeholderTextColor={colors.textMuted}
            maxLength={6}
          />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Confirm PIN</Text>
          <TextInput
            value={pinConfirm}
            onChangeText={(t) => setPinConfirm(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
            placeholder="••••"
            placeholderTextColor={colors.textMuted}
            maxLength={6}
          />
          <PrimaryButton title={privacy.hasPin ? 'Update PIN' : 'Save PIN'} onPress={() => void savePin()} />
        </View>

        <Text style={[styles.section, { color: colors.primaryDark }]}>Due reminders</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.rowHint, { color: colors.textMuted }]}>
            Get notified before loans and money owed are due.
          </Text>
          <View style={[styles.row, { marginTop: spacing.md }]}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Enable reminders</Text>
              {reminders.permission === 'denied' ? (
                <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                  Notifications are blocked — enable them in system settings.
                </Text>
              ) : reminders.lastScheduled > 0 ? (
                <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                  {reminders.lastScheduled} reminder{reminders.lastScheduled === 1 ? '' : 's'} scheduled
                </Text>
              ) : null}
            </View>
            <Switch
              value={reminders.prefs.enabled && reminders.permission === 'granted'}
              onValueChange={(v) => {
                void (async () => {
                  if (v) {
                    const ok = await reminders.enableWithPermission()
                    if (!ok) return
                  } else {
                    await reminders.updatePrefs({ enabled: false })
                  }
                })()
              }}
              trackColor={{ false: colors.border, true: '#86efac' }}
              thumbColor={reminders.prefs.enabled ? colors.primary : '#f4f4f5'}
            />
          </View>

          <Text style={[styles.rowTitle, { marginTop: spacing.lg, color: colors.text }]}>Remind me</Text>
          {(
            [
              { key: 'lead3' as const, label: '3 days before' },
              { key: 'lead1' as const, label: '1 day before' },
              { key: 'leadDue' as const, label: 'On due day' },
            ]
          ).map((row) => (
            <View key={row.key} style={[styles.row, { marginTop: spacing.sm }]}>
              <Text style={{ flex: 1, fontWeight: '600', color: colors.text }}>{row.label}</Text>
              <Switch
                value={reminders.prefs[row.key]}
                onValueChange={(v) => void reminders.updatePrefs({ [row.key]: v })}
                trackColor={{ false: colors.border, true: '#86efac' }}
                thumbColor={reminders.prefs[row.key] ? colors.primary : '#f4f4f5'}
              />
            </View>
          ))}

          <Pressable
            style={[
              styles.lockBtn,
              { backgroundColor: colors.surfaceMuted, opacity: testBusy ? 0.55 : 1, marginTop: spacing.lg },
            ]}
            disabled={testBusy}
            onPress={() => {
              void (async () => {
                setTestBusy(true)
                setTestMsg('')
                const ok = await reminders.sendTest()
                setTestMsg(
                  ok
                    ? 'Test notification coming in ~3 seconds. You can leave this screen.'
                    : 'Could not send — allow notifications for CashTrail first.',
                )
                setTestBusy(false)
              })()
            }}
          >
            <Text style={[styles.lockBtnText, { color: colors.primaryDark }]}>
              {testBusy ? 'Sending…' : 'Send test notification'}
            </Text>
          </Pressable>
          {testMsg ? <Text style={[styles.rowHint, { color: colors.textMuted, marginTop: spacing.sm }]}>{testMsg}</Text> : null}
        </View>

        <Text style={[styles.section, { color: colors.primaryDark }]}>Product updates</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>App news & tips</Text>
              <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                Occasional CashTrail updates. Separate from due-date reminders.
              </Text>
            </View>
            <Switch
              value={marketingEnabled}
              disabled={marketingBusy}
              onValueChange={(v) => {
                void (async () => {
                  setMarketingBusy(true)
                  try {
                    if (v) {
                      const ok = await requestReminderPermission()
                      if (ok) await registerDeviceToken()
                    }
                    await api.patch('/notification-preferences/', { marketing_enabled: v })
                    setMarketingEnabled(v)
                  } catch {
                    /* keep previous */
                  } finally {
                    setMarketingBusy(false)
                  }
                })()
              }}
              trackColor={{ false: colors.border, true: '#86efac' }}
              thumbColor={marketingEnabled ? colors.primary : '#f4f4f5'}
            />
          </View>
        </View>

        <Text style={[styles.section, { color: colors.primaryDark }]}>Offline</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.rowHint, { color: colors.textMuted }]}>
            Status: {online ? 'Online' : 'Offline'}
            {pending > 0 ? ` · ${pending} pending` : ''}
          </Text>
          <Pressable
            style={[styles.lockBtn, { backgroundColor: colors.surfaceMuted, opacity: !online || syncing || pending === 0 ? 0.5 : 1 }]}
            onPress={() => void syncNow()}
            disabled={!online || syncing || pending === 0}
          >
            <Text style={[styles.lockBtnText, { color: colors.primaryDark }]}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
          </Pressable>
        </View>

        <PrimaryButton
          title="Log out"
          onPress={() => {
            void (async () => {
              await clearLocal()
              await logout()
            })()
          }}
        />
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, paddingBottom: spacing.xxl + 80 },
  title: { fontSize: typography.title, fontWeight: '800', marginBottom: spacing.lg, color: '#122a20' },
  section: {
    fontSize: typography.subtitle,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    color: '#047857',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  swatchWrap: { alignItems: 'center', flex: 1 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchCheck: { color: '#fff', fontWeight: '900', fontSize: 14 },
  swatchLabel: { fontSize: 10, fontWeight: '700', marginTop: 6 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#5f7569' },
  value: { fontSize: typography.subtitle, fontWeight: '800', marginTop: 4, color: '#122a20' },
  meta: { marginTop: 4, fontSize: typography.caption, color: '#3f6153' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontWeight: '800', fontSize: typography.body, color: '#122a20' },
  rowHint: { fontSize: typography.caption, marginTop: 4, lineHeight: 18, color: '#5f7569' },
  tip: { marginTop: spacing.sm, fontSize: typography.caption, lineHeight: 18, color: '#c2410c' },
  ok: { fontWeight: '700', marginVertical: spacing.sm, color: '#059669' },
  seg: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    borderColor: '#e5e7eb',
  },
  segBtnOn: { backgroundColor: '#047857', borderColor: '#047857' },
  segText: { fontWeight: '700', fontSize: 12, color: '#3f6153' },
  segTextOn: { color: '#fff' },
  lockBtn: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.sm,
    backgroundColor: '#f3f4f6',
  },
  lockBtnText: { fontWeight: '800', color: '#047857' },
  fieldLabel: {
    fontSize: typography.label,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    color: '#3f6153',
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: typography.body,
    letterSpacing: 4,
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    color: '#122a20',
  },
})
