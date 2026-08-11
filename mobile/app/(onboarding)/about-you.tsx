import { useMemo, useState } from 'react'
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
import { authApi, apiErrorMessage } from '@/src/api/client'
import { DateField } from '@/src/components/SelectFields'
import { ErrorBanner } from '@/src/components/ui'
import { useAuth } from '@/src/context/AuthContext'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'

type Gender = 'male' | 'female'

export default function AboutYouScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { user, refreshUser } = useAuth()

  const prefill = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
  const [name, setName] = useState(prefill)
  const [dob, setDob] = useState(user?.date_of_birth || '2000-01-01')
  const [gender, setGender] = useState<Gender | ''>((user?.gender as Gender) || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const continueNext = async () => {
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
    setLoading(true)
    try {
      const parts = name.trim().split(/\s+/)
      const first_name = parts[0] || ''
      const last_name = parts.slice(1).join(' ')
      await authApi.updateMe({ first_name, last_name, date_of_birth: dob, gender })
      await refreshUser()
      router.push('/(onboarding)/user-type')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save your profile.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
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

        <DateField
          label="Date of birth"
          value={dob}
          onChange={(iso) => setDob(iso)}
        />

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
          onPress={() => void continueNext()}
          disabled={loading}
          style={[styles.continueBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
        >
          <Text style={styles.continueText}>{loading ? 'Saving…' : 'Continue'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
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
