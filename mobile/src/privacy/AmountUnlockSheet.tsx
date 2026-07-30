import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'
import { colors, radii, spacing, typography } from '@/src/theme/colors'

/** Bottom sheet: biometric / PIN to reveal amounts (page stays visible underneath). */
export function AmountUnlockSheet() {
  const insets = useSafeAreaInsets()
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
      if (!ok) setError('Unlock cancelled or failed. Try again or use your CashTrail PIN.')
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
    <Modal
      visible={unlockSheetOpen}
      transparent
      animationType="slide"
      onRequestClose={closeUnlockSheet}
    >
      <Pressable style={styles.backdrop} onPress={closeUnlockSheet} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Reveal amounts</Text>
        <Text style={styles.sub}>
          Confirm with biometrics or your CashTrail PIN. Labels and the rest of the screen stay visible.
        </Text>

        {busy ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {biometricsAvailable ? (
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
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
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                onPress={() => setShowPin(true)}
                disabled={busy}
              >
                <Text style={styles.secondaryText}>Use CashTrail PIN</Text>
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
                  style={styles.pinInput}
                  maxLength={6}
                  autoFocus
                />
                <Pressable
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  onPress={() => void onPin()}
                  disabled={busy}
                >
                  <Text style={styles.primaryText}>Unlock</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : !biometricsAvailable ? (
          <Text style={styles.warn}>
            Open Settings and set a CashTrail PIN to reveal amounts.
          </Text>
        ) : null}

        <Pressable onPress={closeUnlockSheet} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 31, 26, 0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    color: colors.primaryDark,
    textAlign: 'center',
  },
  sub: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: typography.caption,
    lineHeight: 20,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  warn: {
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.md,
    fontSize: typography.caption,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryText: { color: colors.white, fontWeight: '800', fontSize: typography.body },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  secondaryText: { color: colors.primaryDark, fontWeight: '800' },
  pressed: { opacity: 0.9 },
  pinBox: { marginTop: spacing.sm },
  pinInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.text,
    marginBottom: spacing.md,
  },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { color: colors.textMuted, fontWeight: '700' },
})
