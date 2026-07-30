import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Pressable, StyleSheet } from 'react-native'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'
import { colors } from '@/src/theme/colors'

type Props = {
  /** Light icon for dark hero cards */
  tone?: 'light' | 'dark'
  size?: number
}

/** Eye control: hide amounts or open biometric/PIN sheet to reveal. */
export function AmountEyeToggle({ tone = 'dark', size = 20 }: Props) {
  const { enabled, amountsHidden, openUnlockSheet, lockNow } = usePrivacyLock()

  if (!enabled) return null

  const color = tone === 'light' ? 'rgba(255,255,255,0.9)' : colors.primaryDark

  return (
    <Pressable
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={amountsHidden ? 'Reveal amounts' : 'Hide amounts'}
      onPress={() => {
        if (amountsHidden) openUnlockSheet()
        else lockNow()
      }}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
    >
      <FontAwesome name={amountsHidden ? 'eye-slash' : 'eye'} size={size} color={color} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
