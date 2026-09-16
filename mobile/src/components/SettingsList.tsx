import type { ComponentProps } from 'react'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { useColors } from '@/src/theme/ThemeContext'
import { spacing } from '@/src/theme/colors'

export function SettingsGroup({ children }: { children: React.ReactNode }) {
  const colors = useColors()
  return (
    <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  )
}

export function SettingsRow({
  icon,
  title,
  value,
  onPress,
  switchValue,
  onSwitch,
  last,
  disabled,
}: {
  icon: ComponentProps<typeof FontAwesome>['name']
  title: string
  value?: string
  onPress?: () => void
  switchValue?: boolean
  onSwitch?: (value: boolean) => void
  last?: boolean
  disabled?: boolean
}) {
  const colors = useColors()
  const showSwitch = typeof switchValue === 'boolean' && onSwitch
  const chevron = Boolean(onPress) && !showSwitch

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        pressed && onPress ? { backgroundColor: colors.surfaceMuted } : null,
        disabled ? { opacity: 0.45 } : null,
      ]}
    >
      <View style={[styles.iconWell, { backgroundColor: colors.surfaceMuted }]}>
        <FontAwesome name={icon} size={15} color={colors.textSecondary} />
      </View>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {value ? (
        <Text style={[styles.value, { color: colors.textMuted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {showSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitch}
          trackColor={{ false: colors.border, true: '#86efac' }}
          thumbColor={switchValue ? colors.primary : '#f4f4f5'}
        />
      ) : null}
      {chevron ? <FontAwesome name="chevron-right" size={12} color={colors.textMuted} /> : null}
    </Pressable>
  )
}

export function SettingsLogoutRow({ onPress }: { onPress: () => void }) {
  const colors = useColors()
  return (
    <SettingsGroup>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          pressed ? { backgroundColor: colors.surfaceMuted } : null,
        ]}
      >
        <View style={[styles.iconWell, { backgroundColor: colors.surfaceMuted }]}>
          <FontAwesome name="sign-out" size={15} color={colors.danger} />
        </View>
        <Text style={[styles.title, { color: colors.danger }]}>Logout</Text>
      </Pressable>
    </SettingsGroup>
  )
}

const styles = StyleSheet.create({
  group: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  value: {
    fontSize: 15,
    fontWeight: '500',
    maxWidth: 120,
    textAlign: 'right',
  },
})
