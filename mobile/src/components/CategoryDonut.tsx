import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import Svg, { Circle, G, Line } from 'react-native-svg'
import Animated, { FadeIn } from 'react-native-reanimated'
import { getCategoryMeta } from '@/src/constants/categories'
import { useColors } from '@/src/theme/ThemeContext'
import { spacing, typography } from '@/src/theme/colors'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'

export type DonutDatum = { category: string; amount: number }

type Slice = {
  category: string
  amount: number
  color: string
  colorSoft: string
  icon: React.ComponentProps<typeof FontAwesome>['name']
  fraction: number
  midDeg: number
  dashLen: number
  dashOffset: number
}

const SIZE = 268
const CX = SIZE / 2
const CY = SIZE / 2
const R = 68
const STROKE = 30
const CIRC = 2 * Math.PI * R
const LINE_R0 = R + STROKE / 2 + 3
const LINE_R1 = R + STROKE / 2 + 22
const LABEL_R = R + STROKE / 2 + 40

function lighten(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amt)
  return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function CategoryDonut({
  data,
  title = 'This month you spent',
  emptyText = 'No spending recorded this month yet.',
  detailsLabel,
  onDetailsPress,
}: {
  data: DonutDatum[]
  title?: string
  emptyText?: string
  detailsLabel?: string
  onDetailsPress?: () => void
}) {
  const colors = useColors()
  const money = useMaskedMoney()

  const { slices, total, labels } = useMemo(() => {
    const merged = new Map<string, number>()
    for (const d of data) {
      if (!d.amount) continue
      merged.set(d.category, (merged.get(d.category) ?? 0) + d.amount)
    }
    const rows = Array.from(merged.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
    const totalAmt = rows.reduce((s, r) => s + r.amount, 0)

    const MAX = 6
    let display = rows
    if (rows.length > MAX) {
      const head = rows.slice(0, MAX - 1)
      const tail = rows.slice(MAX - 1)
      display = [...head, { category: 'Other', amount: tail.reduce((s, r) => s + r.amount, 0) }]
    }

    const gapFrac = display.length > 1 ? 2.4 / 360 : 0
    let acc = 0
    const built: Slice[] = display.map((r) => {
      const meta = getCategoryMeta(r.category)
      const fraction = totalAmt ? r.amount / totalAmt : 0
      const midDeg = (acc + fraction / 2) * 360
      const dashLen = Math.max(0, (fraction - gapFrac) * CIRC)
      const dashOffset = -acc * CIRC
      acc += fraction
      return {
        category: r.category,
        amount: r.amount,
        color: meta.color,
        colorSoft: lighten(meta.color, 0.28),
        icon: meta.icon,
        fraction,
        midDeg,
        dashLen,
        dashOffset,
      }
    })

    const pts = built.map((s) => ({ ...polar(LABEL_R, s.midDeg), slice: s }))
    const show = built.map((s) => s.fraction >= 0.045)
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (!show[i] || !show[j]) continue
        if (dist(pts[i], pts[j]) < 42) {
          if (built[i].fraction <= built[j].fraction) show[i] = false
          else show[j] = false
        }
      }
    }

    const labs = built.flatMap((s, i) => {
      if (!show[i]) return []
      const a = polar(LINE_R0, s.midDeg)
      const b = polar(LINE_R1, s.midDeg)
      const c = polar(LABEL_R, s.midDeg)
      const pct = Math.round(s.fraction * 100)
      if (pct < 1) return []
      return [{ key: s.category, a, b, c, pct, icon: s.icon, color: s.color }]
    })

    return { slices: built, total: totalAmt, labels: labs }
  }, [data])

  if (total <= 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyRing, { borderColor: colors.border }]}>
          <FontAwesome name="pie-chart" size={22} color={colors.textMuted} />
        </View>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyText}</Text>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeIn.duration(280)} style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={colors.surfaceMuted}
            strokeWidth={STROKE}
          />
          <G rotation={-90} originX={CX} originY={CY}>
            {slices.map((s) => (
              <Circle
                key={s.category}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={s.colorSoft}
                strokeWidth={STROKE}
                strokeDasharray={`${s.dashLen} ${CIRC}`}
                strokeDashoffset={s.dashOffset}
                strokeLinecap="butt"
              />
            ))}
          </G>
          {labels.map((l) => (
            <Line
              key={`ln-${l.key}`}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke={colors.border}
              strokeWidth={1}
            />
          ))}
        </Svg>
        {labels.map((l) => (
          <View
            key={`lb-${l.key}`}
            pointerEvents="none"
            style={[
              styles.labelCluster,
              { left: l.c.x - 22, top: l.c.y - 20 },
            ]}
          >
            <Text style={[styles.pct, { color: colors.textMuted }]}>{l.pct}%</Text>
            <View style={[styles.iconDot, { borderColor: colors.surface, backgroundColor: colors.surface }]}>
              <FontAwesome name={l.icon} size={11} color={l.color} />
            </View>
          </View>
        ))}
      </Animated.View>

      <Text style={[styles.spentLine, { color: colors.text }]}>
        {title}{' '}
        <Text style={[styles.spentAmt, money.amountStyle, { color: colors.text }]}>
          {money.fmt(total)}
        </Text>
      </Text>
      {detailsLabel && onDetailsPress ? (
        <Pressable onPress={onDetailsPress} hitSlop={8} style={styles.detailsBtn}>
          <Text style={[styles.details, { color: colors.textMuted }]}>{detailsLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 4 },
  labelCluster: {
    position: 'absolute',
    width: 44,
    alignItems: 'center',
    gap: 3,
  },
  pct: { fontSize: 10, fontWeight: '700' },
  iconDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...({
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    } as const),
  },
  spentLine: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  spentAmt: { fontWeight: '800' },
  detailsBtn: { marginTop: 6, paddingVertical: 2 },
  details: { fontSize: 13, fontWeight: '600' },
  emptyWrap: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.md },
  emptyRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: typography.caption },
})
