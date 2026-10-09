import React from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
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
 * Shared popup shell — bottom sheet by default with handle, header,
 * safe-area padding, and a soft elevated card.
 * Tap outside (dimmed backdrop) dismisses unless dismissOnBackdrop={false}.
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
  const bottom = Math.max(insets.bottom, spacing.md)
  const isBottom = placement === 'bottom'
  const handleColor = colors.borderStrong ?? colors.border

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.bodyPad, contentStyle]}
      style={styles.scroll}
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
        <KeyboardAvoidingView
          style={[styles.kav, isBottom ? styles.rootBottom : styles.rootCenter]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.sheet,
              isBottom ? styles.sheetBottom : styles.sheetCenter,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                maxHeight: `${Math.round(maxHeightRatio * 100)}%` as DimensionValue,
                paddingBottom: isBottom ? bottom : spacing.lg,
              },
              iosShadow,
              sheetStyle,
            ]}
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
            {body}
          </View>
        </KeyboardAvoidingView>
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
  scroll: { flexGrow: 0 },
  bodyPad: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
})
