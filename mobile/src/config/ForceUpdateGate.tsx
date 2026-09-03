import React from 'react'
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRemoteConfig } from '@/src/config/RemoteConfigContext'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography } from '@/src/theme/colors'

/** Blocks the app when Ops sets min_supported_version above this build. */
export function ForceUpdateGate() {
  const { needsForceUpdate, config } = useRemoteConfig()
  const colors = useColors()

  if (!needsForceUpdate) return null

  const store = (config.store_url || '').trim()
    || 'https://play.google.com/store/apps/details?id=com.wallettrails.app'

  return (
    <Modal visible animationType="fade" transparent={false}>
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.primaryDark }]}>Update required</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          This version of WalletTrails is no longer supported. Please update from the Play Store to continue.
        </Text>
        <Pressable
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void Linking.openURL(store)
          }}
        >
          <Text style={styles.btnText}>Open Play Store</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

/** Non-blocking banner when Ops sets maintenance_message. */
export function MaintenanceBanner() {
  const { config, needsForceUpdate } = useRemoteConfig()
  const colors = useColors()
  const msg = (config.maintenance_message || '').trim()
  if (!msg || needsForceUpdate) return null

  return (
    <View style={[styles.banner, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}>
      <Text style={[styles.bannerText, { color: '#92400e' }]}>{msg}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: typography.body,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  btn: {
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: typography.body,
  },
  banner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  bannerText: {
    fontSize: typography.caption,
    fontWeight: '600',
    lineHeight: 18,
  },
})
