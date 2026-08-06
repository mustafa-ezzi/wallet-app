import React, { useMemo } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useRemoteConfig } from '@/src/config/RemoteConfigContext'
import { useColors } from '@/src/theme/ThemeContext'

/**
 * Banner respects Ops remote config + premium gate.
 * Renders AdMob only when `react-native-google-mobile-ads` is installed in a native build.
 * Until then (Expo Go / missing SDK), shows nothing in production paths.
 */
export function AdBanner() {
  const { shouldShowAds, config } = useRemoteConfig()
  const colors = useColors()

  const NativeBanner = useMemo(() => {
    if (Platform.OS === 'web') return null
    try {
      // Optional peer — EAS build after: npx expo install react-native-google-mobile-ads
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ads = require('react-native-google-mobile-ads') as {
        BannerAd: React.ComponentType<{ unitId: string; size: string; requestOptions?: object }>
        BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: string }
      }
      return ads
    } catch {
      return null
    }
  }, [])

  if (!shouldShowAds) return null

  const unitId = config.ads.units.android_banner

  if (!NativeBanner) {
    if (__DEV__) {
      return (
        <View style={[styles.devPlaceholder, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.devText, { color: colors.textMuted }]}>
            Ads on (config) · install react-native-google-mobile-ads + rebuild to show
          </Text>
        </View>
      )
    }
    return null
  }

  const { BannerAd, BannerAdSize } = NativeBanner
  return (
    <View style={styles.wrap}>
      <BannerAd unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width: '100%',
  },
  devPlaceholder: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
  },
  devText: {
    fontSize: 12,
    textAlign: 'center',
  },
})
