import { useMemo } from 'react'
import { getCategoryMeta } from '../constants/categories'
import { fmt } from '../utils/format'

export type DonutDatum = { category: string; amount: number }

type Slice = {
  category: string
  amount: number
  color: string
  colorSoft: string
  Icon: ReturnType<typeof getCategoryMeta>['icon']
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
        Icon: meta.icon,
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
      return [{ key: s.category, a, b, c, pct, Icon: s.Icon, color: s.color }]
    })

    return { slices: built, total: totalAmt, labels: labs }
  }, [data])

  if (total <= 0) {
    return (
      <div className="donut-empty">
        <p className="text-muted">{emptyText}</p>
      </div>
    )
  }

  return (
    <div className="donut-wrap">
      <div className="donut-stage" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={STROKE}
          />
          {slices.map((s) => (
            <circle
              key={s.category}
              className="donut-arc"
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={s.colorSoft}
              strokeWidth={STROKE}
              strokeDasharray={`${s.dashLen} ${CIRC}`}
              strokeDashoffset={s.dashOffset}
              transform={`rotate(-90 ${CX} ${CY})`}
            />
          ))}
          {labels.map((l) => (
            <line
              key={`ln-${l.key}`}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke="var(--border-2)"
              strokeWidth={1}
            />
          ))}
        </svg>
        {labels.map((l) => {
          const Icon = l.Icon
          return (
            <div
              key={`lb-${l.key}`}
              className="donut-callout"
              style={{ left: l.c.x, top: l.c.y }}
            >
              <span className="donut-callout-pct">{l.pct}%</span>
              <span className="donut-callout-icon">
                <Icon size={11} color={l.color} strokeWidth={2.25} />
              </span>
            </div>
          )
        })}
      </div>
      <p className="donut-spent">
        {title} <strong>{fmt(total)}</strong>
      </p>
      {detailsLabel && onDetailsPress ? (
        <button type="button" className="donut-details" onClick={onDetailsPress}>
          {detailsLabel}
        </button>
      ) : null}
    </div>
  )
}
