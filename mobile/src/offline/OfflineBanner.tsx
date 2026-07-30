import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useOfflineOptional } from './OfflineProvider'
import { colors, radii, spacing } from '@/src/theme/colors'

/** Compact status chip: offline and/or pending outbox count. */
export function OfflineBanner() {
  const offline = useOfflineOptional()
  if (!offline?.ready) return null

  const showOffline = !offline.online
  const showPending = offline.pending > 0
  if (!showOffline && !showPending) return null

  return (
    <View style={styles.wrap}>
      {showOffline ? (
        <View style={[styles.chip, styles.offline]}>
          <Text style={styles.chipText}>Offline — changes queue locally</Text>
        </View>
      ) : null}
      {showPending ? (
        <Pressable
          style={[styles.chip, styles.pending]}
          onPress={() => void offline.syncNow()}
          disabled={offline.syncing || !offline.online}
        >
          <Text style={styles.chipText}>
            {offline.syncing
              ? 'Syncing…'
              : `${offline.pending} pending${offline.online ? ' · tap to sync' : ''}`}
          </Text>
        </Pressable>
      ) : null}
      {offline.lastError ? <Text style={styles.err}>{offline.lastError}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: 6,
  },
  chip: {
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  offline: {
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  pending: {
    backgroundColor: colors.infoBg,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  err: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
})
