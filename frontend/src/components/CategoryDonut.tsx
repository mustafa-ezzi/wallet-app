import { useMemo } from 'react'
import { getCategoryMeta } from '../constants/categories'
import { fmt } from '../utils/format'

export type DonutDatum = { category: string; amount: number }

type Petal = {
  category: string
  amount: number
  color: string
  colorLight: string
  Icon: ReturnType<typeof getCategoryMeta>['icon']
  fraction: number
  a0: number
  a1: number
  rTarget: number
}

const SIZE = 220
const CX = SIZE / 2
const CY = SIZE / 2
const R0 = 46
const R_BASE = 62
const R_MAX = 106
const GAP_DEG = 2

function lighten(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amt)
  return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

function petalPath(a0: number, a1: number, r1: number): string {
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
  return `M ${x0o} ${y0o} A ${r1} ${r1} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${R0} ${R0} 0 ${large} 0 ${x0i} ${y0i} Z`
}

export function CategoryDonut({ data }: { data: DonutDatum[] }) {
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
        Icon: meta.icon,
        fraction,
        a0,
        a1,
        rTarget: R_BASE + norm * (R_MAX - R_BASE),
      }
    })
    return { petals: built, total: totalAmt }
  }, [data])

  if (total <= 0) {
    return (
      <div className="donut-empty">
        <p className="text-muted">No spending recorded this month yet.</p>
      </div>
    )
  }

  return (
    <div className="donut-wrap">
      <div className="donut-total">
        <span className="donut-total-label">This month you spent</span>
        <span className="donut-total-value">{fmt(total)}</span>
      </div>

      <svg
        className="donut-svg"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden
      >
        <defs>
          {petals.map((p, i) => (
            <linearGradient key={p.category} id={`web-petal-${i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={p.colorLight} />
              <stop offset="100%" stopColor={p.color} />
            </linearGradient>
          ))}
        </defs>
        <circle cx={CX} cy={CY} r={R0 - 4} fill="var(--surface-2)" opacity={0.7} />
        {petals.map((p, i) => (
          <path
            key={p.category}
            className="donut-petal"
            style={{ animationDelay: `${i * 60}ms` }}
            d={petalPath(p.a0, p.a1, p.rTarget)}
            fill={`url(#web-petal-${i})`}
            stroke={p.colorLight}
            strokeWidth={0.5}
          />
        ))}
      </svg>

      <div className="donut-legend">
        {petals.map((p) => {
          const pctVal = Math.round(p.fraction * 100)
          const Icon = p.Icon
          return (
            <div key={p.category} className="donut-legend-row">
              <div className="donut-legend-icon" style={{ background: p.color }}>
                <Icon size={12} color="#fff" strokeWidth={2.25} />
              </div>
              <div className="donut-legend-mid">
                <div className="donut-legend-top">
                  <span className="donut-legend-label">{p.category}</span>
                  <span className="donut-legend-amt">{fmt(p.amount)}</span>
                </div>
                <div className="donut-legend-track">
                  <div
                    className="donut-legend-fill"
                    style={{ width: `${Math.max(pctVal, 3)}%`, background: p.color }}
                  />
                </div>
              </div>
              <span className="donut-legend-pct" style={{ color: p.color, background: `${p.color}1f` }}>
                {pctVal}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
