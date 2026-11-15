import React, { useEffect, useState } from 'react'
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type KeyboardEvent,
  type ViewStyle,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColors } from '@/src/theme/ThemeContext'
import { iosShadow, radii, spacing, typography } from '@/src/theme/colors'
import { BouncyPressable } from './motion'

type Placement = 'bottom' | 'center'

type Props = {
  visible: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  /** bottom = Android-style sheet (default); center = compact dialog */
  placement?: Placement
  /** Wrap body in ScrollView (forms with many fields). */
  scroll?: boolean
  /** Hide the X button (still dismiss via backdrop). */
  hideClose?: boolean
  /** When false, tapping the dimmed area does not close (default true). */
  dismissOnBackdrop?: boolean
  /** Extra style on the sheet card. */
  sheetStyle?: ViewStyle
  /** Extra style on the body wrapper (inside padding). */
  contentStyle?: ViewStyle
  /** Max height ratio for sheets (0–1). */
  maxHeightRatio?: number
}

/**
 * Full keyboard height. This sheet is a fullscreen modal, so Android does not
 * shrink it when the activity window resizes — the sheet has to move itself.
 */
function keyboardOverlap(e: KeyboardEvent): number {
  return Math.max(0, Math.round(e.endCoordinates.height))
}

function useKeyboardOverlap(active: boolean): number {
  const [lift, setLift] = useState(0)
  useEffect(() => {
    if (!active) {
      setLift(0)
      return
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (e) => setLift(keyboardOverlap(e)))
    const hide = Keyboard.addListener(hideEvent, () => setLift(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [active])
  return lift
}

/**
 * Shared popup shell — bottom sheet by default with handle, header,
 * safe-area padding, and a soft elevated card.
 * Tap outside (dimmed backdrop) dismisses unless dismissOnBackdrop={false}.
 * The sheet sits above the keyboard and the form scrolls so fields stay reachable.
 */
export function AppSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  placement = 'bottom',
  scroll = false,
  hideClose = false,
  dismissOnBackdrop = true,
  sheetStyle,
  contentStyle,
  maxHeightRatio = 0.92,
}: Props) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const keyboardLift = useKeyboardOverlap(visible)
  const [chromeHeight, setChromeHeight] = useState(0)
  const bottom = Math.max(insets.bottom, spacing.md)
  const isBottom = placement === 'bottom'
  const handleColor = colors.borderStrong ?? colors.border
  const topGap = Math.max(insets.top, spacing.md) + spacing.sm
  const sheetPadBottom = isBottom ? (keyboardLift > 0 ? spacing.sm : bottom) : spacing.lg
  const available = Math.max(220, windowHeight - keyboardLift - topGap)
  const sheetMax = Math.min(Math.round(windowHeight * maxHeightRatio), available)
  const bodyMax = Math.max(120, sheetMax - chromeHeight - sheetPadBottom)

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      contentContainerStyle={[styles.bodyPad, contentStyle]}
      style={[styles.scroll, { maxHeight: bodyMax }]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.bodyPad, contentStyle]}>{children}</View>
  )

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isBottom ? 'slide' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop sits behind KAV so Android taps on the dimmed area always dismiss. */}
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={dismissOnBackdrop ? onClose : undefined}
          accessible={dismissOnBackdrop}
          accessibilityRole={dismissOnBackdrop ? 'button' : undefined}
          accessibilityLabel={dismissOnBackdrop ? 'Dismiss' : undefined}
        />
        <View
          style={[
            styles.kav,
            isBottom ? styles.rootBottom : styles.rootCenter,
            !isBottom && keyboardLift > 0 ? { paddingBottom: keyboardLift } : null,
          ]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.sheet,
              isBottom ? styles.sheetBottom : styles.sheetCenter,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                maxHeight: sheetMax,
                marginBottom: isBottom ? keyboardLift : 0,
                paddingBottom: sheetPadBottom,
              },
              iosShadow,
              sheetStyle,
            ]}
          >
            <View
              onLayout={(e) => {
                const next = Math.round(e.nativeEvent.layout.height)
                setChromeHeight((prev) => (prev === next ? prev : next))
              }}
            >
              {isBottom ? (
                <View style={styles.handleRow}>
                  <View style={[styles.handle, { backgroundColor: handleColor }]} />
                </View>
              ) : null}

              <View style={styles.header}>
                <View style={styles.headerText}>
                  <Text style={[styles.title, { color: colors.primaryDark }]} numberOfLines={2}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={3}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {!hideClose ? (
                  <BouncyPressable
                    onPress={onClose}
                    style={[styles.closeBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                    accessibilityLabel="Close"
                  >
                    <FontAwesome name="times" size={14} color={colors.textSecondary} />
                  </BouncyPressable>
                ) : null}
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </View>
            {body}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  kav: { flex: 1, zIndex: 1 },
  rootBottom: { justifyContent: 'flex-end' },
  rootCenter: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  sheet: {
    zIndex: 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetBottom: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    width: '100%',
  },
  sheetCenter: {
    borderRadius: radii.xl,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    fontSize: typography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  bodyPad: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
})
