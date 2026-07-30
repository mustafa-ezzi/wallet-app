import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/src/components/ui'
import { colors, spacing, typography } from '@/src/theme/colors'

export default function ReportsScreen() {
  return (
    <Screen>
      <View style={styles.pad}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.body}>Coming in Phase 7 — forecast and ledger reports.</Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg },
  title: { fontSize: typography.title, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  body: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22 },
})
