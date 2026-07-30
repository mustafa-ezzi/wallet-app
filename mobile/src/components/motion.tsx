import type { ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable)

type BouncyPressableProps = Omit<PressableProps, 'style'> & {
  scaleTo?: number
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}

/** Pressable with a soft spring scale-down on press — tactile, "alive" feedback. */
export function BouncyPressable({
  scaleTo = 0.95,
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: BouncyPressableProps) {
  const scale = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <AnimatedPressableBase
      style={[style as object, animStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, { damping: 16, stiffness: 280 })
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 12, stiffness: 220 })
        onPressOut?.(e)
      }}
      {...rest}
    >
      {children}
    </AnimatedPressableBase>
  )
}

/** Staggered fade + slide-up entrance — use to wrap list rows/cards for a lively load-in. */
export function Reveal({
  index = 0,
  delayStep = 45,
  maxDelay = 420,
  children,
  style,
}: {
  index?: number
  delayStep?: number
  maxDelay?: number
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const delay = Math.min(index * delayStep, maxDelay)
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(420).springify().damping(17).mass(0.55)}
      style={style as object}
    >
      {children}
    </Animated.View>
  )
}

/** Simple fade-in for hero/summary blocks that appear once per screen. */
export function FadeUp({
  delay = 0,
  children,
  style,
}: {
  delay?: number
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(480).springify().damping(18)} style={style as object}>
      {children}
    </Animated.View>
  )
}

export { FadeIn }
