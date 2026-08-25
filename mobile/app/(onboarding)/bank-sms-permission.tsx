import { useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BANK_SMS_UX } from '@cashtrail/bank-sms-parser'
import { PrimaryButton } from '@/src/components/ui'
import { useBankSms } from '@/src/bankSms'
import { useColors } from '@/src/theme/ThemeContext'
import { spacing, typography, type ColorTokens } from '@/src/theme/colors'

/**
 * Android-only onboarding step after profile setup.
 * iOS/web should skip this route.
 */
export default function BankSmsPermissionScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { requestPermissionAndEnable, markPromptSeen, nativeAvailable } = useBankSms()
  const [busy, setBusy] = useState(false)

  const finish = async (allow: boolean) => {
    setBusy(true)
    try {
      if (allow && Platform.OS === 'android') {
        await requestPermissionAndEnable()
      } else {
        await markPromptSeen()
      }
    } finally {
      setBusy(false)
      router.replace('/(tabs)')
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl, backgroundColor: colors.background }]}>
      <View style={styles.body}>
        <Text style={[styles.kicker, { color: colors.primary }]}>Almost done</Text>
        <Text style={[styles.title, { color: colors.text }]}>{BANK_SMS_UX.permissionTitle}</Text>
        <Text style={[styles.copy, { color: colors.textSecondary }]}>
          {BANK_SMS_UX.permissionBody}
        </Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          {nativeAvailable
            ? 'Android can detect bank SMS in the background. Nothing is posted until you Approve.'
            : 'This device build does not include SMS reading yet. You can still paste alerts anytime in Settings.'}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton
          title={BANK_SMS_UX.permissionAllow}
          onPress={() => void finish(true)}
          disabled={busy}
          loading={busy}
        />
        <Pressable onPress={() => void finish(false)} style={styles.skip} disabled={busy}>
          <Text style={{ color: colors.textMuted, fontWeight: '700', textAlign: 'center' }}>
            {BANK_SMS_UX.permissionNotNow}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function makeStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1, paddingHorizontal: spacing.xl },
    body: { flex: 1, justifyContent: 'center' },
    kicker: { fontWeight: '800', fontSize: 13, marginBottom: 8, textTransform: 'uppercase' },
    title: { ...typography.title, fontSize: 26, marginBottom: 12 },
    copy: { fontSize: 16, lineHeight: 24, marginBottom: 16 },
    note: { fontSize: 13, lineHeight: 20 },
    footer: { gap: 14 },
    skip: { paddingVertical: 10 },
  })
}
