import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DateField, SelectField } from '@/src/components/SelectFields'
import { ErrorBanner, PrimaryButton } from '@/src/components/ui'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { todayISO } from '@/src/utils/format'
import {
  TRAVEL_CURRENCIES,
  countryForCurrency,
  formatRateLine,
} from '@/src/travel/currencies'
import { useTravelMode } from '@/src/travel/TravelModeContext'

export default function TravelModeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { travel, loading, saving, setTravel, fetchQuote, isActive, refresh } = useTravelMode()

  const [setupOpen, setSetupOpen] = useState(false)
  const [currency, setCurrency] = useState('AED')
  const [rate, setRate] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState('')
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [quoteNote, setQuoteNote] = useState('')

  useEffect(() => {
    if (travel.enabled && travel.travel_currency) {
      setCurrency(travel.travel_currency.toUpperCase())
      setRate(travel.rate != null ? String(Number(travel.rate)) : '')
      if (travel.start_date) setStartDate(travel.start_date)
      if (travel.end_date) setEndDate(travel.end_date)
      setSetupOpen(true)
    }
  }, [travel])

  const currencyOptions = useMemo(
    () => TRAVEL_CURRENCIES.map((c) => ({
      value: c.code,
      label: c.code,
      hint: c.country,
    })),
    [],
  )

  const loadLiveRate = useCallback(async (code: string, force = false) => {
    setQuoteBusy(true)
    setQuoteNote('')
    setError('')
    try {
      const q = await fetchQuote(code, force)
      setRate(String(Number(q.rate)))
      setQuoteNote(
        q.stale
          ? `Saved rate (${q.source}) — live feed unavailable`
          : `Live rate · ${q.source}`,
      )
    } catch (err) {
      setQuoteNote('Could not fetch live rate — type your booth rate.')
      setError(err instanceof Error ? err.message : 'FX quote failed')
    } finally {
      setQuoteBusy(false)
    }
  }, [fetchQuote])

  useEffect(() => {
    if (!setupOpen && !isActive) return
    if (rate) return
    void loadLiveRate(currency)
  }, [setupOpen, isActive, currency]) // eslint-disable-line react-hooks/exhaustive-deps

  const onCurrencyChange = (code: string) => {
    setCurrency(code)
    setRate('')
    void loadLiveRate(code)
  }

  const turnOn = () => {
    setSetupOpen(true)
    setError('')
    if (!rate) void loadLiveRate(currency)
  }

  const saveTrip = async () => {
    setError('')
    const r = parseFloat(rate)
    if (!Number.isFinite(r) || r <= 0) {
      setError('Enter a valid exchange rate (PKR per 1 foreign unit).')
      return
    }
    if (endDate && endDate < startDate) {
      setError('End date must be on or after start date.')
      return
    }
    try {
      await setTravel({
        enabled: true,
        travel_currency: currency,
        rate: r,
        rate_source: quoteNote.startsWith('Live') ? 'live' : 'manual',
        start_date: startDate,
        end_date: endDate || null,
      })
      if (router.canGoBack()) router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  const turnOff = async () => {
    setError('')
    try {
      await setTravel({ enabled: false })
      setSetupOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off.')
    }
  }

  const showSetup = setupOpen || isActive

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
            <FontAwesome name="chevron-left" size={18} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Travel Mode</Text>
          <View style={styles.headerToggle}>
            <Text style={styles.headerToggleLabel}>{isActive ? 'ON' : 'Off'}</Text>
            <Switch
              value={isActive}
              onValueChange={(on) => {
                if (on) turnOn()
                else void turnOff()
              }}
              trackColor={{ false: 'rgba(255,255,255,0.25)', true: '#fff' }}
              thumbColor={isActive ? colors.primaryDark : '#f4f4f5'}
            />
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <ErrorBanner message={error} />

          {!showSetup ? (
            <View style={styles.intro}>
              <View style={[styles.hero, { backgroundColor: colors.primarySoft + '33' }]}>
                <FontAwesome name="plane" size={48} color={colors.primary} />
              </View>
              <Text style={[styles.introTitle, { color: colors.primaryDark }]}>TRAVEL MODE</Text>
              <Text style={[styles.introBody, { color: colors.textSecondary }]}>
                Traveling outside Pakistan? Track expenses in the local currency. CashTrail
                converts to PKR using your trip rate so wallets stay accurate.
              </Text>
              <PrimaryButton title="TURN ON TRAVEL MODE" onPress={turnOn} />
            </View>
          ) : (
            <>
              <View style={[styles.pairCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.pairCol}>
                  <Text style={[styles.pairFromTo, { color: colors.text }]}>From PKR</Text>
                  <Text style={[styles.pairCountry, { color: colors.textMuted }]}>PAKISTAN</Text>
                </View>
                <FontAwesome name="exchange" size={16} color={colors.primary} />
                <View style={[styles.pairCol, { alignItems: 'flex-end' }]}>
                  <Text style={[styles.pairFromTo, { color: colors.text }]}>To {currency}</Text>
                  <Text style={[styles.pairCountry, { color: colors.textMuted }]}>
                    {countryForCurrency(currency).toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={[styles.rateLine, { color: colors.primaryDark }]}>
                {formatRateLine(currency, rate) || 'Set a rate below'}
              </Text>
              {quoteNote ? (
                <Text style={[styles.quoteNote, { color: colors.textMuted }]}>{quoteNote}</Text>
              ) : null}

              <SelectField
                label="Travel currency"
                value={currency}
                options={currencyOptions}
                onChange={onCurrencyChange}
              />

              <Text style={[styles.label, { color: colors.textMuted }]}>
                Rate (PKR per 1 {currency})
              </Text>
              <View style={styles.rateRow}>
                <TextInput
                  value={rate}
                  onChangeText={(t) => setRate(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="73.26"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.rateInput,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                  ]}
                />
                <Pressable
                  onPress={() => void loadLiveRate(currency, true)}
                  style={[styles.refreshBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                  disabled={quoteBusy}
                >
                  {quoteBusy
                    ? <ActivityIndicator color={colors.primary} />
                    : <FontAwesome name="refresh" size={16} color={colors.primary} />}
                </Pressable>
              </View>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Use the live mid-market rate, or type what your exchange booth gave you.
              </Text>

              <DateField label="Travel start date" value={startDate} onChange={setStartDate} />
              <DateField
                label="Travel end date"
                value={endDate || startDate}
                onChange={setEndDate}
              />
              {endDate ? (
                <Pressable onPress={() => setEndDate('')} style={{ marginBottom: spacing.sm }}>
                  <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 12 }}>
                    Clear end date
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  End date optional — leave as start date then clear if you want open-ended.
                </Text>
              )}

              <View style={{ height: spacing.md }} />
              <PrimaryButton
                title={isActive ? 'UPDATE TRAVEL MODE' : 'SET TRAVEL MODE'}
                onPress={() => void saveTrip()}
                loading={saving}
              />
              {isActive ? (
                <Pressable onPress={() => void turnOff()} style={styles.offLink}>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>Turn off Travel Mode</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => void refresh()} style={styles.offLink}>
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Refresh status</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    header: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      borderBottomLeftRadius: radii.lg,
      borderBottomRightRadius: radii.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: '#fff',
      fontWeight: '800',
      fontSize: typography.body,
    },
    headerToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerToggleLabel: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 12,
    },
    intro: {
      alignItems: 'center',
      paddingTop: spacing.lg,
      gap: spacing.md,
    },
    hero: {
      width: '100%',
      height: 160,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    introTitle: {
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: 1,
    },
    introBody: {
      textAlign: 'center',
      fontSize: typography.caption,
      lineHeight: 20,
      fontWeight: '600',
      marginBottom: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    pairCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    pairCol: { flex: 1 },
    pairFromTo: { fontWeight: '800', fontSize: 16 },
    pairCountry: { fontSize: 11, fontWeight: '700', marginTop: 4, letterSpacing: 0.4 },
    rateLine: {
      textAlign: 'center',
      fontWeight: '800',
      fontSize: 15,
      marginBottom: spacing.xs,
    },
    quoteNote: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      marginBottom: spacing.md,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 6,
      marginTop: spacing.sm,
    },
    rateRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    rateInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: radii.sm,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '700',
    },
    refreshBtn: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hint: {
      fontSize: 12,
      fontWeight: '600',
      marginTop: 6,
      marginBottom: spacing.sm,
    },
    offLink: {
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
  })
}
