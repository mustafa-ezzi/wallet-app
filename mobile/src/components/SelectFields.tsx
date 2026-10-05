import { createElement, useMemo, useState } from 'react'
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { AppSheet } from '@/src/components/AppSheet'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography } from '@/src/theme/colors'

export type SelectOption<T extends string = string> = {
  value: T
  label: string
  hint?: string
}

/** Dropdown-style single select — opens a bottom sheet of options. */
export function SelectField<T extends string = string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled,
}: {
  label: string
  value: T | ''
  options: SelectOption<T>[]
  onChange: (value: T) => void
  placeholder?: string
  disabled?: boolean
}) {
  const colors = useColors()
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.triggerText,
            { color: selected ? colors.text : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <FontAwesome name="chevron-down" size={12} color={colors.textMuted} />
      </Pressable>

      <AppSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label || 'Select'}
        maxHeightRatio={0.7}
        contentStyle={styles.pickerBody}
      >
        <FlatList
          data={options}
          keyExtractor={(item) => String(item.value)}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 360 }}
          renderItem={({ item }) => {
            const active = item.value === value
            return (
              <Pressable
                onPress={() => {
                  onChange(item.value)
                  setOpen(false)
                }}
                style={[
                  styles.option,
                  { borderBottomColor: colors.border },
                  active && { backgroundColor: colors.primarySoft + '22' },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, { color: active ? colors.primaryDark : colors.text }]}>
                    {item.label}
                  </Text>
                  {item.hint ? (
                    <Text style={[styles.optionHint, { color: colors.textMuted }]}>{item.hint}</Text>
                  ) : null}
                </View>
                {active ? <FontAwesome name="check" size={14} color={colors.primary} /> : null}
              </Pressable>
            )
          }}
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted, padding: spacing.lg, textAlign: 'center' }}>
              No options available.
            </Text>
          }
        />
      </AppSheet>
    </View>
  )
}

function parseISODate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

function formatDisplayDate(iso: string): string {
  try {
    return parseISODate(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

/** Date field that opens the native date picker. Value is YYYY-MM-DD. */
export function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (isoDate: string) => void
  disabled?: boolean
}) {
  const colors = useColors()
  const [open, setOpen] = useState(false)
  const date = useMemo(() => parseISODate(value), [value])

  const onPick = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === 'dismissed') {
      setOpen(false)
      return
    }
    if (selected) {
      onChange(toISODate(selected))
      if (Platform.OS === 'android') setOpen(false)
    }
  }

  const openPicker = () => {
    if (disabled) return
    // Android: imperative dialog is the reliable system calendar (declarative often fails to show).
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        display: 'calendar',
        onChange: onPick,
      })
      return
    }
    setOpen(true)
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <Pressable
        disabled={disabled}
        onPress={openPicker}
        style={[
          styles.trigger,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <Text style={[styles.triggerText, { color: colors.text }]}>{formatDisplayDate(value)}</Text>
        <FontAwesome name="calendar" size={14} color={colors.textMuted} />
      </Pressable>

      {/* iOS: spinner sheet. Web: native <input type="date"> (community picker is blank on web). */}
      {Platform.OS === 'ios' || Platform.OS === 'web' ? (
        <AppSheet
          visible={open}
          onClose={() => setOpen(false)}
          title={label || 'Date'}
          placement={Platform.OS === 'web' ? 'center' : 'bottom'}
          maxHeightRatio={0.55}
        >
          {Platform.OS === 'web' ? (
            <View style={styles.webDateWrap}>
              {createElement('input', {
                type: 'date',
                value: value || toISODate(new Date()),
                onChange: (e: { target: { value: string } }) => {
                  if (e.target.value) onChange(e.target.value)
                },
                style: {
                  width: '100%',
                  padding: 12,
                  fontSize: 18,
                  fontWeight: '600',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: colors.border,
                  borderRadius: 10,
                  color: colors.text,
                  backgroundColor: colors.surfaceMuted,
                  boxSizing: 'border-box',
                },
              })}
            </View>
          ) : (
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              onChange={onPick}
              style={styles.iosSpinner}
            />
          )}

          {Platform.OS === 'web' ? (
            <Pressable
              onPress={() => setOpen(false)}
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Done</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setOpen(false)}
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Done</Text>
            </Pressable>
          )}
        </AppSheet>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: typography.label,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  trigger: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  triggerText: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '600',
  },
  pickerBody: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLabel: { fontWeight: '700', fontSize: typography.body },
  optionHint: { marginTop: 2, fontSize: typography.caption },
  iosSpinner: {
    alignSelf: 'stretch',
    height: 216,
    width: '100%',
  },
  webDateWrap: {
    paddingVertical: spacing.sm,
  },
  doneBtn: {
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
})
