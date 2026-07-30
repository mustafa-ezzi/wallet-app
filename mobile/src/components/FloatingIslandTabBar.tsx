import { useEffect, useState } from 'react'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing } from '@/src/theme/colors'

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient)

/** Must match styles.row.paddingHorizontal below. */
const ROW_H_PADDING = 8

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

/** Floating liquid-glass pill island tab bar with a spring-sliding active indicator. */
export function FloatingIslandTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const [rowWidth, setRowWidth] = useState(0)

  const HIDDEN_TABS = new Set(['household', 'settings'])

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

  // `row` has paddingHorizontal: ROW_H_PADDING, so its flex content (the tab
  // items) starts inset from the measured layout width. Absolutely positioned
  // children are placed relative to the padding edge, so we must subtract the
  // padding before dividing into equal slots and re-add it as a left offset —
  // otherwise the pill drifts further from the real icon on each tab to the
  // right, eventually leaving the (white) active label with no pill behind it.
  const contentWidth = Math.max(0, rowWidth - ROW_H_PADDING * 2)
  const itemWidth = visibleRoutes.length > 0 ? contentWidth / visibleRoutes.length : 0
  const translateX = useSharedValue(0)
  const pillWidth = useSharedValue(0)

  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    setRowWidth(w)
  }

  useEffect(() => {
    if (rowWidth <= 0) return
    const target = ROW_H_PADDING + focusedVisibleIndex * itemWidth + 6
    const targetWidth = Math.max(0, itemWidth - 12)
    translateX.value = withSpring(target, { damping: 18, stiffness: 180, mass: 0.7 })
    pillWidth.value = withSpring(targetWidth, { damping: 18, stiffness: 180, mass: 0.7 })
  }, [rowWidth, itemWidth, focusedVisibleIndex, translateX, pillWidth])

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: pillWidth.value,
  }))

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View style={styles.islandShadow}>
        <View style={[styles.island, { borderColor: colors.glassBorder }]}>
          {Platform.OS === 'web' ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.96)' }]} />
          ) : (
            <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(255,255,255,0.88)', 'rgba(255,255,255,0.72)', 'rgba(255,255,255,0.84)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.sheen, { backgroundColor: colors.glassHighlight }]} pointerEvents="none" />

          <View style={styles.row} onLayout={onRowLayout}>
            {rowWidth > 0 ? (
              <AnimatedLinearGradient
                colors={[colors.primary, colors.primarySoft]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.slidingPill, pillStyle]}
                pointerEvents="none"
              />
            ) : null}

            {visibleRoutes.map((route) => {
              const index = state.routes.findIndex((r) => r.key === route.key)
              const focused = state.index === index
              const { options } = descriptors[route.key]
              const label =
                typeof options.tabBarLabel === 'string'
                  ? options.tabBarLabel
                  : options.title ?? route.name
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
                  onPress={onPress}
                  style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
                >
                  {focused ? (
                    <View style={styles.activeContent}>
                      <FontAwesome name={icon} size={15} color={colors.white} />
                      <Text style={styles.activeLabel} numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.idle}>
                      <FontAwesome name={icon} size={18} color={colors.tabInactive} />
                    </View>
                  )}
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
    maxWidth: 420,
    borderRadius: radii.full,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  island: {
    borderRadius: radii.full,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 62,
    justifyContent: 'center',
    // Solid enough that list content never bleeds through the glass
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: '8%',
    right: '8%',
    height: 1.5,
    opacity: 0.7,
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  slidingPill: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: 0,
    borderRadius: radii.full,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  activeLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    maxWidth: 64,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  idle: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
  },
})
