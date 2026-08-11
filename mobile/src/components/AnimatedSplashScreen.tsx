import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useAuth } from '@/src/context/AuthContext'

const BLACK = '#000000'
const GREEN = '#22c55e'
const GREEN_SOFT = '#4ade80'
const WHITE = '#ffffff'
const MUTED = 'rgba(255,255,255,0.4)'

const MIN_HOLD_MS = 2200
const EXIT_MS = 480

const logoSource = require('../../assets/images/splash-logo.png')
const trisiteSource = require('../../assets/images/splash-trisite.png')

/**
 * Professional black splash — clean mark, wordmark, quiet footer.
 */
export function AnimatedSplashScreen() {
  const { loading } = useAuth()
  const insets = useSafeAreaInsets()
  const [visible, setVisible] = useState(true)
  const [minElapsed, setMinElapsed] = useState(false)
  const [exiting, setExiting] = useState(false)

  const rootOpacity = useSharedValue(1)
  const pulse = useSharedValue(0)
  const markScale = useSharedValue(0.9)

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_HOLD_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    markScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })
    pulse.value = withDelay(
      500,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    )
  }, [markScale, pulse])

  useEffect(() => {
    if (!minElapsed || loading) return
    // Stop blocking touches immediately while fading out — opacity alone left an invisible mask.
    setExiting(true)
    rootOpacity.value = withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
      'worklet'
      if (finished) runOnJS(setVisible)(false)
    })
    // Safety: always unmount even if the timing callback is cancelled.
    const forceHide = setTimeout(() => setVisible(false), EXIT_MS + 80)
    return () => clearTimeout(forceHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minElapsed, loading])

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOpacity.value }))

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.12, 0.28]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.06]) }],
  }))

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: markScale.value }],
  }))

  if (!visible) return null

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, rootStyle]}
      pointerEvents={exiting ? 'none' : 'auto'}
    >
      <View style={styles.blackFill} />

      <View style={styles.center}>
        <Animated.View style={[styles.glowRing, glowStyle]} pointerEvents="none" />

        <Animated.View entering={FadeIn.duration(650).delay(60)} style={markStyle}>
          <View style={styles.logoFrame}>
            <Image source={logoSource} style={styles.logo} resizeMode="cover" fadeDuration={0} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(580).delay(280)} style={styles.nameBlock}>
          <Text style={styles.name}>
            <Text style={styles.nameCash}>Cash</Text>
            <Text style={styles.nameTrail}>Trail</Text>
          </Text>
          <Text style={styles.tagline}>Follow every rupee</Text>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(450).delay(500)} style={styles.hairline} />
      </View>

      <Animated.View
        entering={FadeInUp.duration(500).delay(640)}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BLACK,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  glowRing: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 40,
    backgroundColor: 'rgba(34,197,94,0.18)',
  },
  logoFrame: {
    width: 112,
    height: 112,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  logo: {
    width: 112,
    height: 112,
  },
  nameBlock: {
    alignItems: 'center',
    marginTop: 28,
  },
  name: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  nameCash: {
    color: WHITE,
  },
  nameTrail: {
    color: GREEN_SOFT,
  },
  tagline: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
    color: MUTED,
  },
  hairline: {
    marginTop: 26,
    width: 32,
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
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trisiteIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
  },
  trisiteName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: GREEN,
  },
})
