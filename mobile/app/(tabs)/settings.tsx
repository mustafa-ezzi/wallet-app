import { useEffect, useState } from 'react'
import {
  Alert,
  DeviceEventEmitter,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useRouter } from 'expo-router'
import { Screen, PrimaryButton, ErrorBanner } from '@/src/components/ui'
import { SettingsGroup, SettingsLogoutRow, SettingsRow } from '@/src/components/SettingsList'
import { useAuth } from '@/src/context/AuthContext'
import { useCategories } from '@/src/context/CategoriesContext'
import { getHomeCurrency, HOME_CURRENCIES, setHomeCurrency } from '@/src/currency/homeCurrency'
import { useOffline } from '@/src/offline'
import { useReminders } from '@/src/notifications'
import { useBankSms } from '@/src/bankSms'
import { FORCE_RATING_EVENT } from '@/src/rating'
import { registerDeviceTokenDetailed } from '@/src/notifications/pushRegistration'
import { requestReminderPermission } from '@/src/notifications/schedule'
import api, { accountsApi, apiErrorMessage, asList, authApi, probeApiConnection, API_ROOT } from '@/src/api/client'
import type { Account } from '@/src/api/types'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'
import type { PrivacyTimeout } from '@/src/privacy/storage'
import { useTheme } from '@/src/theme/ThemeContext'
import { useRemoteConfig } from '@/src/config/RemoteConfigContext'
import { radii, spacing, typography } from '@/src/theme/colors'
import { useTravelMode } from '@/src/travel/TravelModeContext'

const TIMEOUTS: { id: PrivacyTimeout; label: string }[] = [
  { id: 'immediate', label: 'Immediate' },
  { id: '1m', label: '1 minute' },
  { id: '5m', label: '5 minutes' },
]

type Panel = 'home' | 'appearance' | 'privacy' | 'notifications' | 'advanced' | 'categories'

export default function SettingsScreen() {
  const { user, logout, refreshUser } = useAuth()
  const router = useRouter()
  const { clearLocal, online, pending, syncNow, syncing } = useOffline()
  const reminders = useReminders()
  const privacy = usePrivacyLock()
  const { themeId, themes, setThemeAnimated, colors } = useTheme()
  const { premium, refresh: refreshConfig } = useRemoteConfig()
  const { isActive: travelOn } = useTravelMode()
  const { custom, create: createCategory, remove: removeCategory } = useCategories()
  const bankSms = useBankSms()
  const homeMeta = getHomeCurrency(user?.currency)
  const themeName = themes.find((t) => t.id === themeId)?.name ?? 'System'

  const [panel, setPanel] = useState<Panel>('home')
  const [walletCount, setWalletCount] = useState<number | null>(null)
  const [bankCount, setBankCount] = useState<number | null>(null)
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinSaved, setPinSaved] = useState(false)
  const [enableError, setEnableError] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [marketingEnabled, setMarketingEnabled] = useState(true)
  const [marketingBusy, setMarketingBusy] = useState(false)
  const [pushSyncMsg, setPushSyncMsg] = useState('')
  const [connMsg, setConnMsg] = useState('')
  const [connBusy, setConnBusy] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoBusy, setPromoBusy] = useState(false)
  const [promoMsg, setPromoMsg] = useState('')
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [currencyBusy, setCurrencyBusy] = useState(false)
  const [currencyError, setCurrencyError] = useState('')
  const [restoreMsg, setRestoreMsg] = useState('')
  const [catKind, setCatKind] = useState<'expense' | 'income'>('expense')
  const [catName, setCatName] = useState('')
  const [catError, setCatError] = useState('')
  const [catBusy, setCatBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void api.get('/notification-preferences/').then((res) => {
      if (cancelled) return
      const v = res.data?.marketing_enabled
      if (typeof v === 'boolean') setMarketingEnabled(v)
    }).catch(() => undefined)
    void accountsApi.list().then((res) => {
      if (cancelled) return
      const list = asList<Account>(res.data)
      const wallets = list.filter((a) => a.type === 'bank' || a.type === 'cash')
      setWalletCount(wallets.length)
      setBankCount(list.filter((a) => a.type === 'bank').length)
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
      setPanel('privacy')
      setEnableError('Set a PIN to enable passcode.')
      return
    }
    await privacy.setEnabled(on)
  }

  const onPickCurrency = async (code: string) => {
    setCurrencyError('')
    if (!code || code === user?.currency) {
      setCurrencyOpen(false)
      return
    }
    setCurrencyBusy(true)
    try {
      await authApi.updateMe({ currency: code })
      setHomeCurrency(code)
      await refreshUser()
      setCurrencyOpen(false)
    } catch (err) {
      setCurrencyError(apiErrorMessage(err, 'Could not update currency.'))
    } finally {
      setCurrencyBusy(false)
    }
  }

  const saveCategory = async () => {
    const name = catName.trim()
    if (!name) {
      setCatError('Enter a category name.')
      return
    }
    setCatBusy(true)
    setCatError('')
    try {
      await createCategory(catKind, name)
      setCatName('')
    } catch (err) {
      setCatError(apiErrorMessage(err, 'Could not create category.'))
    } finally {
      setCatBusy(false)
    }
  }

  const deleteCategory = (id: number, name: string) => {
    Alert.alert(
      'Delete category?',
      `“${name}” will be removed from your pickers. Existing transactions keep this name.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void removeCategory(id).catch((err) => {
              setCatError(apiErrorMessage(err, 'Could not delete category.'))
            })
          },
        },
      ],
    )
  }

  const panelTitle =
    panel === 'appearance' ? 'Appearance'
      : panel === 'privacy' ? 'Passcode'
        : panel === 'notifications' ? 'Reminders'
          : panel === 'advanced' ? 'Advanced'
            : panel === 'categories' ? 'Categories'
              : ''

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad}>
        {panel !== 'home' ? (
          <Pressable onPress={() => setPanel('home')} style={styles.back}>
            <FontAwesome name="chevron-left" size={14} color={colors.primaryDark} />
            <Text style={[styles.backText, { color: colors.primaryDark }]}>{panelTitle}</Text>
          </Pressable>
        ) : null}

        {panel === 'home' ? (
          <>
            <SettingsGroup>
              <SettingsRow
                icon="wallet"
                title="Wallets"
                value={walletCount == null ? '' : String(walletCount)}
                onPress={() => router.push('/(tabs)/wallets')}
              />
              <SettingsRow
                icon="university"
                title="Bank Accounts"
                value={bankCount ? String(bankCount) : 'Add'}
                onPress={() => router.push('/(tabs)/wallets')}
              />
              <SettingsRow
                icon="clock-o"
                title="Scheduled Transactions"
                value="Add"
                onPress={() => router.push('/(tabs)/bills')}
                last
              />
            </SettingsGroup>

            <SettingsGroup>
              <SettingsRow
                icon="money"
                title="Currency"
                value={homeMeta.code}
                onPress={() => setCurrencyOpen(true)}
              />
              <SettingsRow
                icon="tags"
                title="Categories"
                value={custom.length ? String(custom.length) : 'Add'}
                onPress={() => setPanel('categories')}
              />
              <SettingsRow
                icon="sun-o"
                title="Appearance"
                value={themeName}
                onPress={() => setPanel('appearance')}
              />
              <SettingsRow
                icon="download"
                title="Export"
                onPress={() => router.push('/(tabs)/reports')}
              />
              {Platform.OS === 'android' ? (
                <SettingsRow
                  icon="bell"
                  title="Bank alerts"
                  value={bankSms.enabled || bankSms.notifEnabled ? 'On' : 'Off'}
                  onPress={() => router.push('/bank-sms')}
                />
              ) : (
                <SettingsRow
                  icon="bell"
                  title="Bank alerts"
                  onPress={() => router.push('/bank-sms')}
                />
              )}
              <SettingsRow
                icon="plane"
                title="Travel Mode"
                value={travelOn ? 'On' : 'Off'}
                onPress={() => router.push('/travel-mode')}
              />
              <SettingsRow
                icon="lock"
                title="Passcode"
                value={privacy.hasPin ? 'On' : 'Off'}
                onPress={() => setPanel('privacy')}
              />
              <SettingsRow
                icon="eye-slash"
                title="Hide amounts"
                switchValue={privacy.enabled}
                onSwitch={(v) => void onTogglePrivacy(v)}
              />
              {privacy.biometricsAvailable ? (
                <SettingsRow
                  icon="user-circle"
                  title="Touch / Face ID"
                  switchValue={privacy.enabled}
                  onSwitch={(v) => void onTogglePrivacy(v)}
                />
              ) : null}
              <SettingsRow
                icon="bell-o"
                title="Reminders"
                value={reminders.prefs.enabled ? 'On' : 'Off'}
                onPress={() => setPanel('notifications')}
                last
              />
            </SettingsGroup>

            <SettingsGroup>
              <SettingsRow
                icon="question-circle"
                title="Help Center"
                onPress={() => router.push('/support' as never)}
              />
              <SettingsRow
                icon="commenting-o"
                title="Contact Support"
                onPress={() => router.push('/support' as never)}
              />
              <SettingsRow
                icon="cloud-download"
                title="Restore Purchase"
                value={premium.is_premium || user?.is_premium ? 'Premium' : restoreMsg || undefined}
                onPress={() => {
                  setRestoreMsg('…')
                  void refreshConfig().then(() => setRestoreMsg('Done'))
                }}
              />
              <SettingsRow
                icon="cog"
                title="Advanced"
                onPress={() => setPanel('advanced')}
                last
              />
            </SettingsGroup>

            <SettingsLogoutRow
              onPress={() => {
                void (async () => {
                  await clearLocal()
                  await logout()
                })()
              }}
            />
            {enableError ? <Text style={styles.tip}>{enableError}</Text> : null}
            {currencyError ? <Text style={styles.tip}>{currencyError}</Text> : null}
          </>
        ) : null}

        {panel === 'appearance' ? (
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
                    <Text style={[styles.swatchLabel, { color: selected ? colors.primaryDark : colors.textMuted }]}>
                      {t.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        {panel === 'categories' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.meta, { color: colors.textMuted, marginTop: 0, marginBottom: spacing.md }]}>
              Built-in categories stay available. Add your own for income or expenses.
            </Text>
            <View style={styles.seg}>
              {(['expense', 'income'] as const).map((kind) => {
                const on = catKind === kind
                return (
                  <Pressable
                    key={kind}
                    onPress={() => setCatKind(kind)}
                    style={[
                      styles.segBtn,
                      { borderColor: colors.border },
                      on && { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
                    ]}
                  >
                    <Text style={[styles.segText, { color: colors.textSecondary }, on && styles.segTextOn]}>
                      {kind === 'expense' ? 'Expense' : 'Income'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <ErrorBanner message={catError} />
            <TextInput
              value={catName}
              onChangeText={setCatName}
              style={[styles.catInput, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              placeholder={catKind === 'income' ? 'e.g. Freelance' : 'e.g. Pet care'}
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              autoCapitalize="words"
            />
            <PrimaryButton title={catBusy ? 'Adding…' : 'Add category'} onPress={() => void saveCategory()} disabled={catBusy} />
            {custom.filter((c) => c.kind === catKind).length === 0 ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>No custom {catKind} categories yet.</Text>
            ) : (
              custom.filter((c) => c.kind === catKind).map((c) => (
                <View key={c.id} style={styles.catRow}>
                  <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{c.name}</Text>
                  <Pressable onPress={() => deleteCategory(c.id, c.name)}>
                    <Text style={{ color: colors.danger, fontWeight: '700' }}>Delete</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        ) : null}

        {panel === 'privacy' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inlineRow}>
              <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Passcode</Text>
              <Switch
                value={privacy.enabled}
                onValueChange={(v) => void onTogglePrivacy(v)}
                trackColor={{ false: colors.border, true: '#86efac' }}
                thumbColor={privacy.enabled ? colors.primary : '#f4f4f5'}
              />
            </View>
            {enableError ? <Text style={styles.tip}>{enableError}</Text> : null}

            <Text style={[styles.rowTitle, { marginTop: spacing.lg, color: colors.text }]}>Lock after</Text>
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

            <View style={[styles.inlineRow, { marginTop: spacing.lg }]}>
              <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Block screenshots</Text>
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

            <Text style={[styles.rowTitle, { marginTop: spacing.xl, color: colors.text }]}>PIN</Text>
            <ErrorBanner message={pinError} />
            {pinSaved ? <Text style={styles.ok}>PIN saved.</Text> : null}
            <TextInput
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              placeholder="New PIN"
              placeholderTextColor={colors.textMuted}
              maxLength={6}
            />
            <TextInput
              value={pinConfirm}
              onChangeText={(t) => setPinConfirm(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text, marginTop: spacing.sm }]}
              placeholder="Confirm PIN"
              placeholderTextColor={colors.textMuted}
              maxLength={6}
            />
            <PrimaryButton title={privacy.hasPin ? 'Update PIN' : 'Save PIN'} onPress={() => void savePin()} />
          </View>
        ) : null}

        {panel === 'notifications' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inlineRow}>
              <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Enable reminders</Text>
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
            {([
              { key: 'lead3' as const, label: '3 days before' },
              { key: 'lead1' as const, label: '1 day before' },
              { key: 'leadDue' as const, label: 'On due day' },
            ]).map((row) => (
              <View key={row.key} style={[styles.inlineRow, { marginTop: spacing.md }]}>
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
              style={[styles.lockBtn, { backgroundColor: colors.surfaceMuted, opacity: testBusy ? 0.55 : 1 }]}
              disabled={testBusy}
              onPress={() => {
                void (async () => {
                  setTestBusy(true)
                  setTestMsg('')
                  const ok = await reminders.sendTest()
                  setTestMsg(ok ? 'Test sent.' : 'Allow notifications first.')
                  setTestBusy(false)
                })()
              }}
            >
              <Text style={[styles.lockBtnText, { color: colors.primaryDark }]}>
                {testBusy ? 'Sending…' : 'Send test'}
              </Text>
            </Pressable>
            {testMsg ? <Text style={[styles.meta, { color: colors.textMuted }]}>{testMsg}</Text> : null}
          </View>
        ) : null}

        {panel === 'advanced' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inlineRow}>
              <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>App news</Text>
              <Switch
                value={marketingEnabled}
                disabled={marketingBusy}
                onValueChange={(v) => {
                  void (async () => {
                    setMarketingBusy(true)
                    try {
                      if (v) {
                        const ok = await requestReminderPermission()
                        if (ok) await registerDeviceTokenDetailed()
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
            <Pressable
              style={[styles.lockBtn, { backgroundColor: colors.surfaceMuted }]}
              onPress={() => {
                void (async () => {
                  setMarketingBusy(true)
                  setPushSyncMsg('Linking…')
                  try {
                    const ok = await requestReminderPermission()
                    if (!ok) {
                      setPushSyncMsg('Allow notifications first.')
                      return
                    }
                    const result = await registerDeviceTokenDetailed()
                    if (!result.ok) {
                      setPushSyncMsg(result.error || 'Could not link push.')
                      return
                    }
                    await api.patch('/notification-preferences/', { marketing_enabled: true })
                    setMarketingEnabled(true)
                    setPushSyncMsg('Push linked.')
                  } catch (err) {
                    setPushSyncMsg(apiErrorMessage(err, 'Could not sync push.'))
                  } finally {
                    setMarketingBusy(false)
                  }
                })()
              }}
            >
              <Text style={[styles.lockBtnText, { color: colors.primaryDark }]}>Link this device</Text>
            </Pressable>
            {pushSyncMsg ? <Text style={[styles.meta, { color: colors.textMuted }]}>{pushSyncMsg}</Text> : null}

            <Text style={[styles.meta, { color: colors.textMuted, marginTop: spacing.lg }]}>
              {online ? 'Online' : 'Offline'}{pending > 0 ? ` · ${pending} pending` : ''}
            </Text>
            <Pressable
              style={[styles.lockBtn, { backgroundColor: colors.surfaceMuted, opacity: !online || syncing || pending === 0 ? 0.5 : 1 }]}
              onPress={() => void syncNow()}
              disabled={!online || syncing || pending === 0}
            >
              <Text style={[styles.lockBtnText, { color: colors.primaryDark }]}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
            </Pressable>

            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted, marginTop: spacing.lg, letterSpacing: 0 }]}
              placeholder="Promo code"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              value={promoCode}
              onChangeText={setPromoCode}
            />
            <Pressable
              style={[styles.lockBtn, { backgroundColor: colors.surfaceMuted, opacity: promoBusy ? 0.55 : 1 }]}
              disabled={promoBusy}
              onPress={() => {
                void (async () => {
                  if (!promoCode.trim()) {
                    setPromoMsg('Enter a code.')
                    return
                  }
                  setPromoBusy(true)
                  setPromoMsg('')
                  try {
                    await api.post('/premium/redeem/', { code: promoCode.trim() })
                    setPromoMsg('Promo applied.')
                    setPromoCode('')
                    await refreshConfig()
                  } catch (err: unknown) {
                    setPromoMsg(apiErrorMessage(err, 'Could not redeem code.'))
                  } finally {
                    setPromoBusy(false)
                  }
                })()
              }}
            >
              <Text style={[styles.lockBtnText, { color: colors.primaryDark }]}>{promoBusy ? 'Redeeming…' : 'Redeem'}</Text>
            </Pressable>
            {promoMsg ? <Text style={[styles.meta, { color: colors.textMuted }]}>{promoMsg}</Text> : null}

            <Pressable
              style={[styles.lockBtn, { backgroundColor: colors.surfaceMuted }]}
              onPress={() => DeviceEventEmitter.emit(FORCE_RATING_EVENT)}
            >
              <Text style={[styles.lockBtnText, { color: colors.primaryDark }]}>Preview rating</Text>
            </Pressable>

            <Pressable
              style={[styles.lockBtn, { backgroundColor: colors.surfaceMuted, opacity: connBusy ? 0.55 : 1 }]}
              disabled={connBusy}
              onPress={() => {
                void (async () => {
                  setConnBusy(true)
                  setConnMsg('Testing…')
                  const result = await probeApiConnection()
                  setConnMsg(result.ok ? `OK — ${result.detail}` : `Failed — ${result.detail}`)
                  setConnBusy(false)
                })()
              }}
            >
              <Text style={[styles.lockBtnText, { color: colors.primaryDark }]}>
                {connBusy ? 'Testing…' : 'Test server'}
              </Text>
            </Pressable>
            {connMsg ? <Text style={[styles.meta, { color: colors.textMuted }]}>{connMsg}</Text> : null}
            <Text style={[styles.meta, { color: colors.textMuted }]}>{API_ROOT || ''}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={currencyOpen} transparent animationType="fade" onRequestClose={() => setCurrencyOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)' }}
            onPress={() => !currencyBusy && setCurrencyOpen(false)}
          />
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, zIndex: 2, marginBottom: 0 }]}>
            <Text style={[styles.rowTitle, { color: colors.primaryDark }]}>Currency</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {HOME_CURRENCIES.map((c) => {
                const active = c.code === homeMeta.code
                return (
                  <Pressable
                    key={c.code}
                    disabled={currencyBusy}
                    onPress={() => void onPickCurrency(c.code)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 12,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                      opacity: currencyBusy ? 0.55 : 1,
                    }}
                  >
                    <Text style={{ fontWeight: '700', color: active ? colors.primaryDark : colors.text }}>
                      {c.symbol}  {c.code}
                    </Text>
                    {active ? <Text style={{ color: colors.primary, fontWeight: '800' }}>Selected</Text> : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, paddingBottom: spacing.xxl + 80 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  backText: { fontSize: 18, fontWeight: '800' },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  rowTitle: { fontWeight: '700', fontSize: typography.body },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  meta: { marginTop: 8, fontSize: typography.caption },
  tip: { marginTop: spacing.sm, fontSize: typography.caption, color: '#c2410c' },
  ok: { fontWeight: '700', marginVertical: spacing.sm, color: '#059669' },
  seg: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  segText: { fontWeight: '700', fontSize: 12 },
  segTextOn: { color: '#fff' },
  lockBtn: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  lockBtnText: { fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: typography.body,
    letterSpacing: 4,
  },
  catInput: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: typography.body,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: spacing.md,
  },
})
