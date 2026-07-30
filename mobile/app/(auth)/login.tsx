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

export default function LoginScreen() {
  const { login } = useAuth()
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async () => {
    setError('')
    if (!email.trim() || !password) {
      setError('Enter email and password.')
      return
    }
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid email or password.'))
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
            { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <BrandMark size="lg" />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.sub}>Sign in to your CashTrail account</Text>

          <View style={styles.card}>
            <ErrorBanner message={error} />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="••••••••"
            />
            <PrimaryButton title="Sign In" onPress={onSubmit} loading={loading} />
          </View>

          <Text style={styles.footer}>
            Don&apos;t have an account?{' '}
            <Link href="/(auth)/signup" style={styles.link}>
              Create one
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
