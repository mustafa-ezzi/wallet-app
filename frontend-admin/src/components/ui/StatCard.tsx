import { Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Skeleton } from './Skeleton'
import { Sparkline } from './Sparkline'

const numberFormat = new Intl.NumberFormat('en-US')

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function StatCard({
  label,
  value,
  previous,
  hint,
  icon: Icon,
  sparkline,
  lowerIsBetter = false,
  loading = false,
  className,
}: {
  label: ReactNode
  value: number | string | null | undefined
  /** Value for the previous period; shows a % change badge when both are numbers. */
  previous?: number | null
  hint?: ReactNode
  icon?: LucideIcon
  sparkline?: number[]
  /** For metrics like "inactive users" where going up is bad. */
  lowerIsBetter?: boolean
  loading?: boolean
  className?: string
}) {
  const change =
    typeof value === 'number' && typeof previous === 'number' ? percentChange(value, previous) : undefined

  let tone = 'bg-surface-3 text-muted'
  let DeltaIcon = Minus
  if (change !== undefined && change !== null && Math.abs(change) >= 0.05) {
    const good = lowerIsBetter ? change < 0 : change > 0
    tone = good ? 'bg-primary-soft text-primary-soft-fg' : 'bg-danger-soft text-danger-soft-fg'
    DeltaIcon = change > 0 ? TrendingUp : TrendingDown
  }

  return (
    <div className={cn('flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-card', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {Icon ? (
          <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <span className="font-display text-[28px] leading-none font-bold tracking-tight text-fg tabular">
            {typeof value === 'number' ? numberFormat.format(value) : (value ?? '—')}
          </span>
          {change !== undefined ? (
            <span
              className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular', tone)}
              title="Change vs previous period"
            >
              <DeltaIcon className="size-3" aria-hidden />
              {change === null ? 'new' : `${change > 0 ? '+' : ''}${change.toFixed(Math.abs(change) >= 10 ? 0 : 1)}%`}
            </span>
          ) : null}
        </div>
      )}

      {hint ? <p className="mt-1.5 text-xs text-subtle">{hint}</p> : null}
      {sparkline && sparkline.length > 1 && !loading ? (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparkline} />
        </div>
      ) : null}
    </div>
  )
}
