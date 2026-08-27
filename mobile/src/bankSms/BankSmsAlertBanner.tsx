import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { LinearGradient } from 'expo-linear-gradient'
import { useColors } from '@/src/theme/ThemeContext'
import { iosShadow, radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'

type Props = {
  count: number
  onPress: () => void
}

/** Eye-catching Home banner when pending bank SMS drafts need review. */
export function BankSmsAlertBanner({ count, onPress }: Props) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  if (count < 1) return null

  const label = count === 1 ? '1 alert waiting' : `${count} alerts waiting`

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${count} bank alert${count === 1 ? '' : 's'} to review`}
    >
      <LinearGradient
        colors={['#ecfdf5', '#d1fae5', '#ffffff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.accentBar} />
        <View style={styles.iconWrap}>
          <FontAwesome name="bell" size={18} color="#fff" />
        </View>
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.kicker}>Bank alerts</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count}</Text>
            </View>
          </View>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.sub}>
            Tap to approve or reject — your books stay unchanged until you decide.
          </Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Review</Text>
          <FontAwesome name="chevron-right" size={11} color="#fff" />
        </View>
      </LinearGradient>
    </Pressable>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    wrap: {
      marginBottom: spacing.md,
      borderRadius: radii.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primarySoft + '55',
      ...iosShadow,
    },
    pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
    gradient: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingRight: spacing.md,
      paddingLeft: spacing.sm,
      gap: spacing.sm,
    },
    accentBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      backgroundColor: colors.primary,
      borderTopLeftRadius: radii.lg,
      borderBottomLeftRadius: radii.lg,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
    },
    copy: { flex: 1, paddingRight: 4 },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    kicker: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      color: colors.primaryDark,
    },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#fef3c7',
      borderWidth: 1,
      borderColor: '#f59e0b',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#92400e',
    },
    title: {
      fontSize: typography.subtitle,
      fontWeight: '800',
      color: colors.primaryDark,
      letterSpacing: -0.2,
    },
    sub: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textMuted,
      marginTop: 4,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radii.full,
    },
    ctaText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 12,
    },
  })
}
