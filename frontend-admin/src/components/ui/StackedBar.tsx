import { cn } from '../../lib/cn'

export type Segment = { label: string; value: number; color: string }

/** Single horizontal bar split into proportional segments, with a counted legend. */
export function StackedBar({ segments, label, className }: { segments: Segment[]; label: string; className?: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3" role="img" aria-label={label}>
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <div
                  key={s.label}
                  className="h-full border-r-2 border-surface last:border-r-0"
                  style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                  title={`${s.label}: ${s.value}`}
                />
              ))
          : null}
      </div>
      <ul className="mt-4 space-y-2.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="text-muted">{s.label}</span>
            <span className="ml-auto font-semibold text-fg tabular">{s.value.toLocaleString('en-US')}</span>
            <span className={cn('w-12 text-right text-xs text-subtle tabular')}>
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
