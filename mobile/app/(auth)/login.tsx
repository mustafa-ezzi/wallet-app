import { Link } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiErrorMessage, useAuth } from '@/src/context/AuthContext'
import { getGoogleIdToken, googleSignInErrorMessage } from '@/src/auth/googleSignIn'
import { BrandMark, ErrorBanner, Field, PrimaryButton, Screen } from '@/src/components/ui'
import { GoogleSignInButton } from '@/src/components/GoogleSignInButton'
import { colors, spacing, typography } from '@/src/theme/colors'

export default function LoginScreen() {
  const { login, loginWithGoogle, addingAccount, cancelAddAccount, savedAccounts } = useAuth()
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)

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

  const onGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      const idToken = await getGoogleIdToken()
      await loginWithGoogle(idToken)
    } catch (err) {
      const msg = googleSignInErrorMessage(err, apiErrorMessage(err, 'Google sign-in failed.'))
      if (msg) setError(msg)
    } finally {
      setGoogleLoading(false)
    }
  }

  const onCancelAdd = async () => {
    setCancelBusy(true)
    try {
      await cancelAddAccount()
    } finally {
      setCancelBusy(false)
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
          {addingAccount ? (
            <Pressable onPress={() => void onCancelAdd()} disabled={cancelBusy} style={styles.cancelAdd}>
              <Text style={styles.cancelAddText}>{cancelBusy ? 'Restoring…' : '← Back to accounts'}</Text>
            </Pressable>
          ) : null}

          <BrandMark size="lg" />
          <Text style={styles.title}>{addingAccount ? 'Add account' : 'Welcome back'}</Text>
          <Text style={styles.sub}>
            {addingAccount
              ? 'Sign in to another WalletTrails account. Your other accounts stay saved on this device.'
              : 'Sign in to your WalletTrails account'}
          </Text>

          {addingAccount && savedAccounts.length > 0 ? (
            <Text style={styles.savedHint}>
              {savedAccounts.length} account{savedAccounts.length === 1 ? '' : 's'} already saved on this device
            </Text>
          ) : null}

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
            {!addingAccount ? (
              <Link href="/(auth)/forgot-password" style={styles.forgot}>
                Forgot password?
              </Link>
            ) : (
              <View style={{ height: spacing.sm }} />
            )}
            <PrimaryButton
              title={addingAccount ? 'Add & switch' : 'Sign In'}
              onPress={onSubmit}
              loading={loading}
            />
            {(Platform.OS === 'android' || Platform.OS === 'web') ? (
              <>
                <Text style={styles.or}>or</Text>
                <GoogleSignInButton onPress={() => void onGoogle()} loading={googleLoading} disabled={loading} />
              </>
            ) : null}
          </View>

          {!addingAccount ? (
            <Text style={styles.footer}>
              Don&apos;t have an account?{' '}
              <Link href="/(auth)/signup" style={styles.link}>
                Create one
              </Link>
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
  },
  cancelAdd: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
    paddingVertical: 4,
  },
  cancelAddText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: typography.body,
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
    marginBottom: spacing.md,
    marginTop: 4,
    lineHeight: 18,
  },
  savedHint: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: typography.caption,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  forgot: {
    alignSelf: 'flex-end',
    color: colors.primary,
    fontWeight: '700',
    fontSize: typography.caption,
    marginBottom: spacing.sm,
    marginTop: -4,
  },
  or: {
    textAlign: 'center',
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.md,
    fontSize: typography.caption,
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
