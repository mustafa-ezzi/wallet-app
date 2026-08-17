import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { getCategoryMeta } from '@/src/constants/categories'
import { useColors } from '@/src/theme/ThemeContext'
import { spacing, typography } from '@/src/theme/colors'
import { useMaskedMoney } from '@/src/privacy/useMaskedMoney'

const AnimatedPath = Animated.createAnimatedComponent(Path)

export type DonutDatum = { category: string; amount: number }

type Petal = {
  category: string
  amount: number
  color: string
  colorLight: string
  icon: React.ComponentProps<typeof FontAwesome>['name']
  fraction: number
  a0: number
  a1: number
  rTarget: number
}

const SIZE = 220
const CX = SIZE / 2
const CY = SIZE / 2
const R0 = 46 // inner hole radius (keeps room for the centre label)
const R_BASE = 62 // smallest petal reaches this
const R_MAX = 106 // biggest petal reaches this
const GAP_DEG = 2 // gap between petals

function lighten(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amt)
  return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

function PetalArc({
  petal,
  gradId,
  progress,
}: {
  petal: Petal
  gradId: string
  progress: SharedValue<number>
}) {
  const { a0, a1, rTarget } = petal
  const animatedProps = useAnimatedProps(() => {
    'worklet'
    const p = progress.value
    const r1 = R0 + (rTarget - R0) * p
    const s = a0 + GAP_DEG
    const e = a1 - GAP_DEG
    const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180
    const as = toRad(s)
    const ae = toRad(e)
    const x0o = CX + r1 * Math.cos(as)
    const y0o = CY + r1 * Math.sin(as)
    const x1o = CX + r1 * Math.cos(ae)
    const y1o = CY + r1 * Math.sin(ae)
    const x1i = CX + R0 * Math.cos(ae)
    const y1i = CY + R0 * Math.sin(ae)
    const x0i = CX + R0 * Math.cos(as)
    const y0i = CY + R0 * Math.sin(as)
    const large = e - s > 180 ? 1 : 0
    const d = `M ${x0o} ${y0o} A ${r1} ${r1} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${R0} ${R0} 0 ${large} 0 ${x0i} ${y0i} Z`
    return { d, opacity: 0.35 + 0.65 * p }
  })
  return (
    <AnimatedPath
      animatedProps={animatedProps}
      fill={`url(#${gradId})`}
      stroke={petal.colorLight}
      strokeWidth={0.5}
      strokeLinejoin="round"
    />
  )
}

export function CategoryDonut({
  data,
  title = 'This month you spent',
  emptyText = 'No spending recorded this month yet.',
}: {
  data: DonutDatum[]
  title?: string
  emptyText?: string
}) {
  const colors = useColors()
  const money = useMaskedMoney()
  const progress = useSharedValue(0)

  const { petals, total } = useMemo(() => {
    const merged = new Map<string, number>()
    for (const d of data) {
      if (!d.amount) continue
      merged.set(d.category, (merged.get(d.category) ?? 0) + d.amount)
    }
    const rows = Array.from(merged.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
    const totalAmt = rows.reduce((s, r) => s + r.amount, 0)

    const MAX = 7
    let display = rows
    if (rows.length > MAX) {
      const head = rows.slice(0, MAX - 1)
      const tail = rows.slice(MAX - 1)
      const otherAmt = tail.reduce((s, r) => s + r.amount, 0)
      display = [...head, { category: 'Other', amount: otherAmt }]
    }

    const maxAmt = display.reduce((m, r) => Math.max(m, r.amount), 0) || 1
    let acc = 0
    const built: Petal[] = display.map((r) => {
      const meta = getCategoryMeta(r.category)
      const fraction = totalAmt ? r.amount / totalAmt : 0
      const norm = r.amount / maxAmt
      const a0 = acc * 360
      acc += fraction
      const a1 = acc * 360
      return {
        category: r.category,
        amount: r.amount,
        color: meta.color,
        colorLight: lighten(meta.color, 0.35),
        icon: meta.icon,
        fraction,
        a0,
        a1,
        rTarget: R_BASE + norm * (R_MAX - R_BASE),
      }
    })
    return { petals: built, total: totalAmt }
  }, [data])

  useEffect(() => {
    progress.value = 0
    progress.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })
  }, [progress, petals])

  if (total <= 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyRing, { borderColor: colors.surfaceMuted }]}>
          <FontAwesome name="pie-chart" size={22} color={colors.textMuted} />
        </View>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          {emptyText}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.totalBanner}>
        <Text style={[styles.totalLabel, { color: colors.textMuted }]}>{title}</Text>
        <Text style={[styles.totalValue, money.amountStyle, { color: colors.primaryDark }]}>
          {money.fmt(total)}
        </Text>
      </View>

      <Animated.View entering={FadeIn.duration(300)} style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            {petals.map((p, i) => (
              <LinearGradient key={p.category} id={`petal-${i}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={p.colorLight} />
                <Stop offset="1" stopColor={p.color} />
              </LinearGradient>
            ))}
          </Defs>
          <Circle cx={CX} cy={CY} r={R0 - 4} fill={colors.surfaceMuted} opacity={0.5} />
          {petals.map((p, i) => (
            <PetalArc key={p.category} petal={p} gradId={`petal-${i}`} progress={progress} />
          ))}
        </Svg>
      </Animated.View>

      <View style={styles.legend}>
        {petals.map((p) => {
          const pctVal = Math.round(p.fraction * 100)
          return (
            <View key={p.category} style={styles.legendRow}>
              <View style={[styles.legendIcon, { backgroundColor: p.color }]}>
                <FontAwesome name={p.icon} size={12} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.legendTopLine}>
                  <Text style={[styles.legendLabel, { color: colors.text }]} numberOfLines={1}>
                    {p.category}
                  </Text>
                  <Text style={[styles.legendAmt, money.amountStyle, { color: colors.textSecondary }]}>
                    {money.fmt(p.amount)}
                  </Text>
                </View>
                <View style={[styles.legendTrack, { backgroundColor: colors.surfaceMuted }]}>
                  <View
                    style={[
                      styles.legendFill,
                      { width: `${Math.max(pctVal, 3)}%`, backgroundColor: p.color },
                    ]}
                  />
                </View>
              </View>
              <View style={[styles.legendPctPill, { backgroundColor: `${p.color}1f` }]}>
                <Text style={[styles.legendPct, { color: p.color }]}>{pctVal}%</Text>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  totalBanner: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: 2,
  },
  totalLabel: {
    fontSize: typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  legend: { width: '100%', marginTop: spacing.md, gap: spacing.md },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  legendLabel: { flex: 1, fontWeight: '700', fontSize: typography.body },
  legendAmt: { fontWeight: '800', fontSize: typography.caption, marginLeft: 8 },
  legendTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  legendFill: { height: '100%', borderRadius: 999 },
  legendPctPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, minWidth: 42, alignItems: 'center' },
  legendPct: { fontSize: 11, fontWeight: '800' },
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
