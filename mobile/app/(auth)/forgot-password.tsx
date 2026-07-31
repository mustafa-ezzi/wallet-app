import { Link, useRouter } from 'expo-router'
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
import { apiErrorMessage, authApi } from '@/src/api/client'
import { BrandMark, ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { colors, spacing, typography } from '@/src/theme/colors'

type Step = 'email' | 'otp' | 'password'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const sendCode = async () => {
    setError('')
    setInfo('')
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      const { data } = await authApi.forgotPassword(email.trim())
      setInfo(data?.detail || 'If an account exists, a code has been sent.')
      if (data?.debug_code) {
        setInfo(`${data.detail}\nDebug code: ${data.debug_code}`)
        setCode(String(data.debug_code))
      }
      setStep('otp')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send reset code.'))
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async () => {
    setError('')
    if (!code.trim()) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setLoading(true)
    try {
      const { data } = await authApi.verifyResetOtp(email.trim(), code.trim())
      setResetToken(data.reset_token)
      setInfo('Code verified. Choose a new password.')
      setStep('password')
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid or expired code.'))
    } finally {
      setLoading(false)
    }
  }

  const savePassword = async () => {
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(resetToken, password)
      router.replace({ pathname: '/(auth)/login', params: { reset: '1' } } as never)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update password.'))
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
          <Text style={styles.title}>Forgot password</Text>
          <Text style={styles.sub}>
            {step === 'email' && 'We’ll email you a 6-digit code to reset your password.'}
            {step === 'otp' && `Enter the code sent to ${email.trim()}.`}
            {step === 'password' && 'Create a new password for your account.'}
          </Text>

          <View style={styles.card}>
            <ErrorBanner message={error} />
            {info ? <Text style={styles.info}>{info}</Text> : null}

            {step === 'email' ? (
              <>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
                <PrimaryButton title="Send code" onPress={() => void sendCode()} loading={loading} />
              </>
            ) : null}

            {step === 'otp' ? (
              <>
                <Field
                  label="6-digit code"
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  placeholder="123456"
                  maxLength={6}
                />
                <PrimaryButton title="Verify code" onPress={() => void verifyCode()} loading={loading} />
                <PrimaryButton
                  title="Resend code"
                  onPress={() => void sendCode()}
                  loading={loading}
                  color={colors.primarySoft}
                />
              </>
            ) : null}

            {step === 'password' ? (
              <>
                <Field
                  label="New password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
                <Field
                  label="Confirm password"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
                <PrimaryButton title="Update password" onPress={() => void savePassword()} loading={loading} />
              </>
            ) : null}
          </View>

          <Text style={styles.footer}>
            Remembered it?{' '}
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
  content: { paddingHorizontal: spacing.lg },
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
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  info: {
    color: colors.primaryDark,
    fontWeight: '600',
    fontSize: typography.caption,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  footer: {
    marginTop: spacing.xl,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: typography.caption,
  },
  link: { color: colors.primary, fontWeight: '700' },
})
