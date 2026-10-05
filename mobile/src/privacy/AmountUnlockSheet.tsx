import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { AppSheet } from '@/src/components/AppSheet'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography } from '@/src/theme/colors'

/** Centered dialog: biometric / PIN to reveal amounts (page stays visible underneath). */
export function AmountUnlockSheet() {
  const colors = useColors()
  const {
    unlockSheetOpen,
    closeUnlockSheet,
    biometricsAvailable,
    hasPin,
    unlockWithBiometrics,
    unlockWithPin,
  } = usePrivacyLock()

  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPin, setShowPin] = useState(false)

  useEffect(() => {
    if (!unlockSheetOpen) {
      setPin('')
      setError('')
      setBusy(false)
      setShowPin(false)
      return
    }
    // Auto-prompt biometrics when sheet opens
    if (biometricsAvailable) {
      void (async () => {
        setBusy(true)
        try {
          await unlockWithBiometrics()
        } finally {
          setBusy(false)
        }
      })()
    } else if (hasPin) {
      setShowPin(true)
    }
  }, [unlockSheetOpen, biometricsAvailable, hasPin, unlockWithBiometrics])

  const onBiometric = async () => {
    setError('')
    setBusy(true)
    try {
      const ok = await unlockWithBiometrics()
      if (!ok) setError('Unlock cancelled or failed. Try again or use your WalletTrails PIN.')
    } finally {
      setBusy(false)
    }
  }

  const onPin = async () => {
    setError('')
    if (pin.length < 4) {
      setError('Enter your 4–6 digit PIN.')
      return
    }
    setBusy(true)
    try {
      const ok = await unlockWithPin(pin)
      if (!ok) {
        setError('Incorrect PIN.')
        setPin('')
      } else {
        setPin('')
        setShowPin(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppSheet
      visible={unlockSheetOpen}
      onClose={closeUnlockSheet}
      title="Reveal amounts"
      subtitle="Confirm with biometrics or your WalletTrails PIN. Labels and the rest of the screen stay visible."
      placement="center"
    >
      {busy ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null}
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {biometricsAvailable ? (
        <Pressable
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
          ]}
          onPress={() => void onBiometric()}
          disabled={busy}
        >
          <Text style={styles.primaryText}>Use biometrics</Text>
        </Pressable>
      ) : null}

      {hasPin ? (
        <>
          {!showPin ? (
            <Pressable
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: colors.border, backgroundColor: colors.background },
                pressed && styles.pressed,
              ]}
              onPress={() => setShowPin(true)}
              disabled={busy}
            >
              <Text style={[styles.secondaryText, { color: colors.primaryDark }]}>Use WalletTrails PIN</Text>
            </Pressable>
          ) : (
            <View style={styles.pinBox}>
              <TextInput
                value={pin}
                onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.pinInput,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                maxLength={6}
                autoFocus
              />
              <Pressable
                style={({ pressed }) => [
                  styles.primary,
                  { backgroundColor: colors.primary },
                  pressed && styles.pressed,
                ]}
                onPress={() => void onPin()}
                disabled={busy}
              >
                <Text style={styles.primaryText}>Unlock</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : !biometricsAvailable ? (
        <Text style={[styles.warn, { color: colors.warning }]}>
          Open Settings and set a WalletTrails PIN to reveal amounts.
        </Text>
      ) : null}

      <Pressable onPress={closeUnlockSheet} style={styles.cancel}>
        <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
      </Pressable>
    </AppSheet>
  )
}

const styles = StyleSheet.create({
  error: {
    textAlign: 'center',
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  warn: {
    textAlign: 'center',
    marginTop: spacing.md,
    fontSize: typography.caption,
  },
  primary: {
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: typography.body },
  secondary: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  secondaryText: { fontWeight: '800' },
  pressed: { opacity: 0.9 },
  pinBox: { marginTop: spacing.sm },
  pinInput: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { fontWeight: '700' },
})
