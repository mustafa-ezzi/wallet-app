import { useEffect, useState } from 'react'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing } from '@/src/theme/colors'

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient)

/** Must match styles.row.paddingHorizontal below. */
const ROW_H_PADDING = 10
const PILL_INSET = 5

type IconName = React.ComponentProps<typeof FontAwesome>['name']

type TabBarProps = {
  state: {
    index: number
    routes: { key: string; name: string; params?: object }[]
  }
  descriptors: Record<
    string,
    {
      options: {
        title?: string
        tabBarLabel?: string
        href?: string | null
      }
    }
  >
  navigation: {
    emit: (e: object) => { defaultPrevented: boolean }
    navigate: (name: string, params?: object) => void
  }
}

const ICONS: Record<string, IconName> = {
  index: 'home',
  wallets: 'credit-card',
  income: 'briefcase',
  bills: 'file-text-o',
  reports: 'bar-chart',
  household: 'users',
  settings: 'cog',
}

function TabIcon({
  focused,
  icon,
  activeColor,
  idleColor,
}: {
  focused: boolean
  icon: IconName
  activeColor: string
  idleColor: string
}) {
  const scale = useSharedValue(focused ? 1 : 0.92)
  const glow = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    scale.value = withSpring(focused ? 1.08 : 0.94, { damping: 14, stiffness: 220, mass: 0.55 })
    glow.value = withTiming(focused ? 1 : 0, { duration: 220 })
  }, [focused, scale, glow])

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(glow.value, [0, 1], [0.72, 1]),
  }))

  return (
    <Animated.View style={[styles.iconSlot, anim]}>
      <FontAwesome name={icon} size={focused ? 17 : 16} color={focused ? activeColor : idleColor} />
    </Animated.View>
  )
}

/** Floating liquid-crystal glass pill — icons only, shiny active indicator. */
export function FloatingIslandTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const [rowWidth, setRowWidth] = useState(0)

  const HIDDEN_TABS = new Set(['reports', 'settings', 'household'])

  const visibleRoutes = state.routes.filter((route) => {
    if (HIDDEN_TABS.has(route.name)) return false
    const opts = descriptors[route.key]?.options
    if (opts && 'href' in opts && opts.href === null) return false
    return true
  })

  const focusedVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex((r) => state.routes.findIndex((rr) => rr.key === r.key) === state.index),
  )

  const contentWidth = Math.max(0, rowWidth - ROW_H_PADDING * 2)
  const itemWidth = visibleRoutes.length > 0 ? contentWidth / visibleRoutes.length : 0
  const translateX = useSharedValue(0)
  const pillWidth = useSharedValue(0)
  const shineX = useSharedValue(-0.4)

  const onRowLayout = (e: LayoutChangeEvent) => {
    setRowWidth(e.nativeEvent.layout.width)
  }

  useEffect(() => {
    if (rowWidth <= 0) return
    const target = ROW_H_PADDING + focusedVisibleIndex * itemWidth + PILL_INSET
    const targetWidth = Math.max(0, itemWidth - PILL_INSET * 2)
    translateX.value = withSpring(target, { damping: 16, stiffness: 200, mass: 0.65 })
    pillWidth.value = withSpring(targetWidth, { damping: 16, stiffness: 200, mass: 0.65 })
  }, [rowWidth, itemWidth, focusedVisibleIndex, translateX, pillWidth])

  // Soft specular sweep across the glass island
  useEffect(() => {
    shineX.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
        withDelay(1600, withTiming(-0.4, { duration: 0 })),
      ),
      -1,
      false,
    )
  }, [shineX])

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: pillWidth.value,
  }))

  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shineX.value * Math.max(rowWidth, 1) }, { skewX: '-18deg' }],
  }))

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View style={styles.islandShadow}>
        <View style={[styles.island, { borderColor: colors.glassBorder }]}>
          {Platform.OS === 'web' ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.94)' }]} />
          ) : (
            <BlurView
              intensity={Platform.OS === 'ios' ? 64 : 48}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* Crystal fill */}
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.78)',
              'rgba(255,255,255,0.42)',
              'rgba(255,255,255,0.62)',
            ]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Top glass rim */}
          <LinearGradient
            colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.topRim}
            pointerEvents="none"
          />

          {/* Moving specular shine */}
          <Animated.View style={[styles.shineBand, shineStyle]} pointerEvents="none">
            <LinearGradient
              colors={[
                'rgba(255,255,255,0)',
                'rgba(255,255,255,0.55)',
                'rgba(255,255,255,0)',
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <View style={styles.row} onLayout={onRowLayout}>
            {rowWidth > 0 ? (
              <AnimatedLinearGradient
                colors={[colors.primary, colors.primarySoft, colors.primary]}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.slidingPill, pillStyle]}
                pointerEvents="none"
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.pillSheen}
                  pointerEvents="none"
                />
              </AnimatedLinearGradient>
            ) : null}

            {visibleRoutes.map((route) => {
              const index = state.routes.findIndex((r) => r.key === route.key)
              const focused = state.index === index
              const icon = ICONS[route.name] ?? 'circle'

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                })
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params)
                }
              }

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={focused ? { selected: true } : {}}
                  accessibilityLabel={descriptors[route.key]?.options?.title ?? route.name}
                  onPress={onPress}
                  style={({ pressed }) => [styles.item, pressed && { opacity: 0.82 }]}
                >
                  <TabIcon
                    focused={focused}
                    icon={icon}
                    activeColor={colors.white}
                    idleColor={colors.tabInactive}
                  />
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  islandShadow: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.full,
    // iOS-style layered shadow
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  island: {
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    minHeight: 56,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  topRim: {
    position: 'absolute',
    top: 0,
    left: '6%',
    right: '6%',
    height: 14,
    opacity: 0.9,
  },
  shineBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 54,
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ROW_H_PADDING,
    paddingVertical: 6,
  },
  slidingPill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    borderRadius: radii.full,
    overflow: 'hidden',
    // Soft glow under the active crystal pill
    shadowColor: '#059669',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  pillSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
  },
  iconSlot: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
  },
})
