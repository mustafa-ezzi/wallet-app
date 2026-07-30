import { Link } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiErrorMessage, useAuth } from '@/src/context/AuthContext'
import { BrandMark, ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { colors, spacing, typography } from '@/src/theme/colors'

export default function SignupScreen() {
  const { register, login } = useAuth()
  const insets = useSafeAreaInsets()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async () => {
    setError('')
    if (!firstName.trim() || !email.trim() || password.length < 6) {
      setError('First name, email, and password (min 6) are required.')
      return
    }
    setLoading(true)
    try {
      const trimmedEmail = email.trim()
      await register({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: trimmedEmail,
        password,
        currency: 'PKR',
      })
      await login(trimmedEmail, password)
    } catch (err) {
      setError(apiErrorMessage(err, 'Registration failed.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <BrandMark size="lg" />
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.sub}>Start tracking every rupee</Text>

          <View style={styles.card}>
            <ErrorBanner message={error} />
            <Field label="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" placeholder="Ali" />
            <Field label="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" placeholder="Khan" />
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Min 6 characters" />
            <PrimaryButton title="Create Account" onPress={onSubmit} loading={loading} />
          </View>

          <Text style={styles.footer}>
            Already have an account?{' '}
            <Link href="/(auth)/login" style={styles.link}>
              Sign in
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  sub: {
    fontSize: typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  footer: {
    marginTop: spacing.xl,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: typography.caption,
  },
  link: {
    color: colors.primary,
    fontWeight: '700',
  },
})
