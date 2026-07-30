import { useState } from 'react'
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
import { API_ROOT } from '@/src/api/client'
import { useOffline } from '@/src/offline'
import { useReminders } from '@/src/notifications'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'
import type { PrivacyTimeout } from '@/src/privacy/storage'
import { colors, radii, spacing, typography } from '@/src/theme/colors'

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
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email

  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinSaved, setPinSaved] = useState(false)
  const [enableError, setEnableError] = useState('')

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
        <Text style={styles.title}>Settings</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>{name}</Text>
          <Text style={styles.meta}>{user?.email}</Text>
          <Text style={styles.meta}>Currency: {user?.currency || 'PKR'}</Text>
          <Text style={styles.meta}>API: {API_ROOT || '(not set)'}</Text>
        </View>

        <Text style={styles.section}>Privacy lock</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.rowTitle}>Hide amounts</Text>
              <Text style={styles.rowHint}>
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

          <Text style={[styles.rowTitle, { marginTop: spacing.lg }]}>Hide amounts after background</Text>
          <View style={styles.seg}>
            {TIMEOUTS.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => void privacy.setTimeoutPref(t.id)}
                style={[styles.segBtn, privacy.timeout === t.id && styles.segBtnOn]}
              >
                <Text style={[styles.segText, privacy.timeout === t.id && styles.segTextOn]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.row, { marginTop: spacing.lg }]}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.rowTitle}>Block screenshots</Text>
              <Text style={styles.rowHint}>Uses FLAG_SECURE on Android when privacy is on.</Text>
            </View>
            <Switch
              value={privacy.blockScreenshots}
              onValueChange={(v) => void privacy.setScreenshotBlock(v)}
              trackColor={{ false: colors.border, true: '#86efac' }}
              thumbColor={privacy.blockScreenshots ? colors.primary : '#f4f4f5'}
            />
          </View>

          <Text style={styles.meta}>
            Biometrics: {privacy.biometricsAvailable ? 'available' : 'not available (use PIN)'}
          </Text>
          {privacy.enabled ? (
          <Pressable style={styles.lockBtn} onPress={privacy.lockNow}>
            <Text style={styles.lockBtnText}>Hide amounts now</Text>
          </Pressable>
          ) : null}
        </View>

        <Text style={styles.section}>CashTrail PIN</Text>
        <View style={styles.card}>
          <Text style={styles.rowHint}>
            {privacy.hasPin ? 'PIN is set. Enter a new one to change it.' : 'Create a 4–6 digit PIN fallback.'}
          </Text>
          <ErrorBanner message={pinError} />
          {pinSaved ? <Text style={styles.ok}>PIN saved.</Text> : null}
          <Text style={styles.fieldLabel}>New PIN</Text>
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            style={styles.input}
            placeholder="••••"
            placeholderTextColor={colors.textMuted}
            maxLength={6}
          />
          <Text style={styles.fieldLabel}>Confirm PIN</Text>
          <TextInput
            value={pinConfirm}
            onChangeText={(t) => setPinConfirm(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            style={styles.input}
            placeholder="••••"
            placeholderTextColor={colors.textMuted}
            maxLength={6}
          />
          <PrimaryButton title={privacy.hasPin ? 'Update PIN' : 'Save PIN'} onPress={() => void savePin()} />
        </View>

        <Text style={styles.section}>Due reminders</Text>
        <View style={styles.card}>
          <Text style={styles.rowHint}>
            Local notifications + server push for loans and money owed (Asia/Karachi).
          </Text>
          <View style={[styles.row, { marginTop: spacing.md }]}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.rowTitle}>Enable reminders</Text>
              <Text style={styles.rowHint}>
                Permission: {reminders.permission}
                {reminders.lastScheduled > 0 ? ` · ${reminders.lastScheduled} scheduled` : ''}
              </Text>
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

          <Text style={[styles.rowTitle, { marginTop: spacing.lg }]}>Remind me</Text>
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
        </View>

        <Text style={styles.section}>Offline</Text>
        <View style={styles.card}>
          <Text style={styles.rowHint}>
            Status: {online ? 'Online' : 'Offline'}
            {pending > 0 ? ` · ${pending} pending` : ''}
          </Text>
          <Pressable
            style={[styles.lockBtn, { opacity: !online || syncing || pending === 0 ? 0.5 : 1 }]}
            onPress={() => void syncNow()}
            disabled={!online || syncing || pending === 0}
          >
            <Text style={styles.lockBtnText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
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
        <Text style={styles.hint}>Push works when the app is closed (Phase 6).</Text>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: typography.title, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  section: {
    fontSize: typography.subtitle,
    fontWeight: '800',
    color: colors.primaryDark,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  value: { fontSize: typography.subtitle, fontWeight: '800', color: colors.text, marginTop: 4 },
  meta: { color: colors.textSecondary, marginTop: 4, fontSize: typography.caption },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontWeight: '800', color: colors.text, fontSize: typography.body },
  rowHint: { color: colors.textMuted, fontSize: typography.caption, marginTop: 4, lineHeight: 18 },
  tip: { color: colors.warning, marginTop: spacing.sm, fontSize: typography.caption, lineHeight: 18 },
  ok: { color: colors.success, fontWeight: '700', marginVertical: spacing.sm },
  seg: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  segBtnOn: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  segText: { fontWeight: '700', fontSize: 12, color: colors.textSecondary },
  segTextOn: { color: colors.white },
  lockBtn: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  lockBtnText: { fontWeight: '800', color: colors.primaryDark },
  fieldLabel: {
    fontSize: typography.label,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: typography.body,
    color: colors.text,
    letterSpacing: 4,
  },
  hint: { marginTop: spacing.lg, color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 },
})
