import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Two-column label/value grid for record details. */
export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: ReactNode }[]
  columns?: 1 | 2 | 3
  className?: string
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-semibold tracking-wide text-subtle uppercase">{item.label}</dt>
          <dd className="mt-1 text-sm break-words text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
