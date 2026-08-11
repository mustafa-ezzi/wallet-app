import { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ErrorBanner } from '@/src/components/ui'
import { DateField } from '@/src/components/SelectFields'
import { useAuth } from '@/src/context/AuthContext'
import { getOnboardingDraft, patchOnboardingDraft } from '@/src/onboarding/draft'
import { wakeServer } from '@/src/api/client'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'

type Gender = 'male' | 'female'

export default function AboutYouScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { user, logout } = useAuth()

  const draft = getOnboardingDraft()
  const prefill =
    draft.name
    || [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()

  const [name, setName] = useState(prefill)
  const [dob, setDob] = useState(draft.date_of_birth || user?.date_of_birth || '2000-01-01')
  const [gender, setGender] = useState<Gender | ''>(draft.gender || (user?.gender as Gender) || '')
  const [error, setError] = useState('')

  // Warm Railway while the user fills the form so the final save is ready.
  useEffect(() => {
    void wakeServer(true)
  }, [])

  const goBack = async () => {
    await logout()
    router.replace('/(auth)/login')
  }

  const continueNext = () => {
    setError('')
    if (!name.trim()) {
      setError('Please enter your name.')
      return
    }
    if (!dob) {
      setError('Please pick your date of birth.')
      return
    }
    if (!gender) {
      setError('Please select your gender.')
      return
    }
    // Local only — no network call here (avoids Railway cold-start failures mid-form).
    patchOnboardingDraft({ name: name.trim(), date_of_birth: dob, gender })
    router.push('/(onboarding)/user-type')
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => void goBack()} hitSlop={10} style={styles.back} accessibilityLabel="Back">
          <FontAwesome name="chevron-left" size={18} color={colors.text} />
          <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Help us know you</Text>
        <ErrorBanner message={error} />

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your full name"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          style={[
            styles.input,
            { borderColor: name ? colors.primary : colors.border, color: colors.text },
          ]}
        />

        <DateField label="Date of birth" value={dob} onChange={setDob} />

        <Text style={styles.label}>What is your Gender?</Text>
        <View style={styles.genderRow}>
          {([
            { id: 'male' as const, label: 'Male', icon: 'male' as const },
            { id: 'female' as const, label: 'Female', icon: 'female' as const },
          ]).map((g) => {
            const active = gender === g.id
            return (
              <Pressable
                key={g.id}
                onPress={() => setGender(g.id)}
                style={[
                  styles.genderBtn,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? `${colors.primary}14` : colors.surface,
                  },
                ]}
              >
                <FontAwesome name={g.icon} size={16} color={active ? colors.primary : colors.textMuted} />
                <Text style={[styles.genderText, { color: active ? colors.primaryDark : colors.text }]}>
                  {g.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border }]}>
        <Pressable
          onPress={continueNext}
          style={[styles.continueBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
      </View>
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
      fontSize: 26,
      fontWeight: '800',
      color: colors.text,
      marginBottom: spacing.xl,
      letterSpacing: -0.4,
    },
    label: {
      fontSize: typography.subtitle,
      fontWeight: '800',
      color: colors.text,
      marginBottom: spacing.sm,
      marginTop: spacing.md,
    },
    input: {
      borderWidth: 1.5,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      fontSize: typography.body,
      fontWeight: '600',
      backgroundColor: colors.surface,
    },
    genderRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
    genderBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderRadius: radii.sm,
      paddingVertical: 16,
    },
    genderText: { fontWeight: '800', fontSize: typography.body },
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
  })
}
