import { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { authApi, apiErrorMessage, wakeServer } from '@/src/api/client'
import { ErrorBanner } from '@/src/components/ui'
import { useAuth } from '@/src/context/AuthContext'
import {
  clearOnboardingDraft,
  getOnboardingDraft,
  patchOnboardingDraft,
} from '@/src/onboarding/draft'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'

type UserType = 'student' | 'professional' | 'self_employed' | 'retired'

const USER_TYPES: {
  id: UserType
  label: string
  icon: React.ComponentProps<typeof FontAwesome>['name']
  color: string
}[] = [
  { id: 'student', label: 'Student', icon: 'graduation-cap', color: '#38bdf8' },
  { id: 'professional', label: 'Professional', icon: 'briefcase', color: '#6366f1' },
  { id: 'self_employed', label: 'Self Employed', icon: 'laptop', color: '#22c55e' },
  { id: 'retired', label: 'Retired', icon: 'home', color: '#f59e0b' },
]

const COUNTRIES = [
  'Pakistan',
  'India',
  'United Arab Emirates',
  'Saudi Arabia',
  'United Kingdom',
  'United States',
  'Canada',
  'Australia',
  'Germany',
  'Other',
]

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

export default function UserTypeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { user, refreshUser } = useAuth()

  const draft = getOnboardingDraft()
  const [userType, setUserType] = useState<UserType | ''>(
    draft.user_type || (user?.user_type as UserType) || '',
  )
  const [country, setCountry] = useState(draft.country || user?.country || 'Pakistan')
  const [countryOpen, setCountryOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void wakeServer(true)
  }, [])

  const finish = async () => {
    setError('')
    if (!userType) {
      setError('Please select what kind of user you are.')
      return
    }
    if (!country) {
      setError('Please pick your country.')
      return
    }

    const about = getOnboardingDraft()
    if (!about.name.trim() || !about.date_of_birth || !about.gender) {
      setError('Please go back and complete your name, birthday, and gender.')
      return
    }

    patchOnboardingDraft({ user_type: userType, country })
    setLoading(true)

    const parts = about.name.trim().split(/\s+/)
    const first_name = parts[0] || ''
    const last_name = parts.slice(1).join(' ')
    const payload = {
      first_name,
      last_name,
      date_of_birth: about.date_of_birth,
      gender: about.gender,
      user_type: userType,
      country,
      onboarding_complete: true,
    }

    try {
      // Wake Railway, then retry the profile save a few times for cold starts.
      await wakeServer(true)
      let lastErr: unknown = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await authApi.updateMe(payload)
          lastErr = null
          break
        } catch (err) {
          lastErr = err
          await wakeServer(true)
          await sleep(1500 * (attempt + 1))
        }
      }
      if (lastErr) throw lastErr

      try {
        await refreshUser()
      } catch {
        /* profile saved — continue even if refresh flakes */
      }
      clearOnboardingDraft()
      router.replace('/(tabs)')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not finish setup. Wait a few seconds and try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 110 }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityLabel="Back">
          <FontAwesome name="chevron-left" size={18} color={colors.text} />
          <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
        </Pressable>

        <Text style={styles.title}>What kind of user are you?</Text>
        <ErrorBanner message={error} />

        <View style={styles.grid}>
          {USER_TYPES.map((t) => {
            const active = userType === t.id
            return (
              <Pressable key={t.id} onPress={() => setUserType(t.id)} style={styles.gridItem}>
                <View
                  style={[
                    styles.circle,
                    {
                      backgroundColor: active ? t.color : `${t.color}22`,
                      borderColor: active ? t.color : 'transparent',
                    },
                  ]}
                >
                  <FontAwesome name={t.icon} size={28} color={active ? '#fff' : t.color} />
                </View>
                <Text style={[styles.gridLabel, { color: active ? colors.primaryDark : colors.text }]}>
                  {t.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Pressable style={styles.countryRow} onPress={() => setCountryOpen(true)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.countryTitle}>Default Country</Text>
            <Text style={[styles.countrySub, { color: colors.textMuted }]}>
              Used for formatting and defaults
            </Text>
          </View>
          <Text style={[styles.countryValue, { color: colors.primaryDark }]}>{country}</Text>
          <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border }]}>
        <Pressable
          onPress={() => void finish()}
          disabled={loading}
          style={[styles.continueBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
        >
          <Text style={styles.continueText}>{loading ? 'Finishing…' : 'Continue'}</Text>
        </Pressable>
      </View>

      <Modal visible={countryOpen} transparent animationType="fade" onRequestClose={() => setCountryOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setCountryOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sheetTitle, { color: colors.primaryDark }]}>Select country</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {COUNTRIES.map((c) => {
                const active = c === country
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setCountry(c)
                      setCountryOpen(false)
                    }}
                    style={[
                      styles.option,
                      { borderBottomColor: colors.border },
                      active && { backgroundColor: `${colors.primary}14` },
                    ]}
                  >
                    <Text style={{ fontWeight: '700', color: active ? colors.primaryDark : colors.text }}>{c}</Text>
                    {active ? <FontAwesome name="check" size={14} color={colors.primary} /> : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    back: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.md,
      alignSelf: 'flex-start',
      paddingVertical: 4,
    },
    backText: { fontWeight: '700', fontSize: typography.body },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.xl,
      letterSpacing: -0.3,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: spacing.xl,
      marginBottom: spacing.xxl,
      paddingHorizontal: spacing.md,
    },
    gridItem: { width: '48%', alignItems: 'center' },
    circle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      marginBottom: spacing.sm,
    },
    gridLabel: { fontWeight: '700', fontSize: typography.body, textAlign: 'center' },
    countryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
    },
    countryTitle: { fontWeight: '800', color: colors.text, fontSize: typography.body },
    countrySub: { fontSize: typography.caption, marginTop: 2 },
    countryValue: { fontWeight: '800', marginRight: 4 },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: colors.background,
    },
    continueBtn: {
      borderRadius: radii.sm,
      paddingVertical: 15,
      alignItems: 'center',
    },
    continueText: { color: '#fff', fontWeight: '800', fontSize: typography.subtitle },
    modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)' },
    sheet: {
      borderRadius: radii.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      zIndex: 2,
    },
    sheetTitle: {
      fontSize: typography.subtitle,
      fontWeight: '800',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
  })
}
