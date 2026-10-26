import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

const tones: Record<'info' | 'warn' | 'danger', { box: string; icon: LucideIcon }> = {
  info: { box: 'border-info/25 bg-info-soft text-info-soft-fg', icon: Info },
  warn: { box: 'border-warn/25 bg-warn-soft text-warn-soft-fg', icon: TriangleAlert },
  danger: { box: 'border-danger/25 bg-danger-soft text-danger-soft-fg', icon: CircleAlert },
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof tones
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const { box, icon: Icon } = tones[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
