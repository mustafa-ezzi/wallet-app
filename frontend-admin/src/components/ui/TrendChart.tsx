import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type TrendSeries = { key: string; label: string; color: string }

type TooltipEntry = { dataKey?: unknown; name?: unknown; value?: unknown; color?: string }

function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
}: {
  active?: boolean
  payload?: readonly TooltipEntry[]
  label?: unknown
  formatLabel: (value: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-semibold text-fg">{formatLabel(String(label))}</div>
      {payload.map((item) => (
        <div key={String(item.dataKey)} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: item.color }} aria-hidden />
          <span>{String(item.name)}</span>
          <span className="ml-auto pl-3 font-semibold text-fg tabular">{Number(item.value).toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  )
}

/** Multi-series area chart over dates, themed from CSS tokens. */
export function TrendChart({
  data,
  xKey,
  series,
  formatX = (v) => v,
  height = 260,
  label,
}: {
  data: object[]
  xKey: string
  series: readonly TrendSeries[]
  formatX?: (value: string) => string
  height?: number
  /** Accessible name for the chart image. */
  label: string
}) {
  const id = useId().replace(/:/g, '')
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v) => formatX(String(v))}
            tick={{ fill: 'var(--text-subtle)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--text-subtle)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as readonly TooltipEntry[] | undefined}
                label={props.label}
                formatLabel={formatX}
              />
            )}
            cursor={{ stroke: 'var(--border-strong)' }}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#${id}-${s.key})`}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
