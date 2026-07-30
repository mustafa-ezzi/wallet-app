import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useAuth } from '@/src/context/AuthContext'

const BLACK = '#000000'
const GREEN = '#22c55e'
const GREEN_SOFT = '#4ade80'
const WHITE = '#ffffff'
const MUTED = 'rgba(255,255,255,0.45)'

const MIN_HOLD_MS = 2400
const EXIT_MS = 480

const logoSource = require('../../assets/images/splash-logo.png')
const trisiteSource = require('../../assets/images/splash-trisite.png')
const textureSource = require('../../assets/images/splash-texture.png')

/**
 * Professional black splash — compact assets + reliable FadeIn entrances
 * so logos never stay stuck at opacity 0.
 */
export function AnimatedSplashScreen() {
  const { loading } = useAuth()
  const insets = useSafeAreaInsets()
  const [visible, setVisible] = useState(true)
  const [minElapsed, setMinElapsed] = useState(false)

  const rootOpacity = useSharedValue(1)

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_HOLD_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!minElapsed || loading) return
    rootOpacity.value = withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
      'worklet'
      if (finished) runOnJS(setVisible)(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minElapsed, loading])

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOpacity.value }))

  if (!visible) return null

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents="auto">
      <View style={styles.blackFill} />
      <Image source={textureSource} style={styles.texture} resizeMode="cover" fadeDuration={0} />

      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(650).delay(80)}>
          <Image source={logoSource} style={styles.logo} resizeMode="contain" fadeDuration={0} />
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(600).delay(320)} style={styles.nameBlock}>
          <Text style={styles.name}>
            <Text style={styles.nameCash}>Cash</Text>
            <Text style={styles.nameTrail}>Trail</Text>
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(500).delay(560)} style={styles.hairline} />
      </View>

      <Animated.View
        entering={FadeInUp.duration(550).delay(720)}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
      >
        <Text style={styles.poweredBy}>powered by</Text>
        <View style={styles.footerRow}>
          <Image source={trisiteSource} style={styles.trisiteIcon} resizeMode="contain" fadeDuration={0} />
          <Text style={styles.trisiteName}>TrisiteSolutions</Text>
        </View>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    zIndex: 99999,
    elevation: 99999,
    backgroundColor: BLACK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blackFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BLACK,
  },
  texture: {
    ...StyleSheet.absoluteFill,
    opacity: 0.5,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: 148,
    height: 148,
  },
  nameBlock: {
    alignItems: 'center',
    marginTop: 28,
  },
  name: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  nameCash: {
    color: WHITE,
  },
  nameTrail: {
    color: GREEN_SOFT,
  },
  hairline: {
    marginTop: 28,
    width: 48,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  poweredBy: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trisiteIcon: {
    width: 22,
    height: 22,
  },
  trisiteName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: GREEN,
  },
})
