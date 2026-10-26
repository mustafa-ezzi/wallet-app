import { ChartColumn, Table2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Card, CardHeader } from './Card'

type View = 'chart' | 'table'

/** Card for a chart with a "view as table" toggle so the numbers are readable without the graphic. */
export function ChartCard({
  title,
  description,
  actions,
  chart,
  table,
  className,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  chart: ReactNode
  table?: ReactNode
  className?: string
}) {
  const [view, setView] = useState<View>('chart')
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title={title}
        description={description}
        actions={
          <>
            {actions}
            {table ? (
              <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5" role="group" aria-label={`${title} view`}>
                {(
                  [
                    ['chart', ChartColumn, 'Chart'],
                    ['table', Table2, 'Table'],
                  ] as const
                ).map(([value, Icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={view === value}
                    onClick={() => setView(value)}
                    className={cn(
                      'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-semibold text-muted',
                      view === value && 'bg-surface text-fg shadow-card',
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        }
      />
      <div className="flex-1 p-5 pt-4">
        {view === 'table' && table ? <div className="max-h-80 overflow-auto">{table}</div> : chart}
      </div>
    </Card>
  )
}

/** Plain numeric table used as the accessible alternative to a chart. */
export function MiniTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs font-semibold text-muted uppercase">
          {columns.map((c, i) => (
            <th key={c} scope="col" className={cn('py-2 pr-3', i > 0 && 'text-right')}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="border-b border-border last:border-0">
            {row.map((cell, i) => (
              <td key={i} className={cn('py-1.5 pr-3 text-fg', i > 0 && 'text-right tabular')}>
                {typeof cell === 'number' ? cell.toLocaleString('en-US') : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
