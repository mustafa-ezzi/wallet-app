import { useEffect } from 'react'
import { StyleSheet, Text } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { BouncyPressable } from '@/src/components/motion'

/** Floating + button with a soft idle bounce so it feels alive. */
export function BouncingFab({
  onPress,
  color,
  bottom,
}: {
  onPress: () => void
  color: string
  bottom: number
}) {
  const bob = useSharedValue(0)
  const pulse = useSharedValue(1)

  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
    pulse.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    )
  }, [bob, pulse])

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }, { scale: pulse.value }],
  }))

  return (
    <Animated.View style={[styles.wrap, { bottom }, bobStyle]}>
      <BouncyPressable
        onPress={onPress}
        scaleTo={0.86}
        style={[styles.fab, { backgroundColor: color }]}
      >
        <Text style={styles.plus}>+</Text>
      </BouncyPressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    zIndex: 40,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  plus: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    marginTop: -2,
  },
})
