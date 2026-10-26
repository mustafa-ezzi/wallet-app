import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const tones = {
  neutral: 'bg-surface-3 text-muted',
  success: 'bg-primary-soft text-primary-soft-fg',
  warn: 'bg-warn-soft text-warn-soft-fg',
  danger: 'bg-danger-soft text-danger-soft-fg',
  info: 'bg-info-soft text-info-soft-fg',
} as const

const dots = {
  neutral: 'bg-subtle',
  success: 'bg-brand',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
} as const

export type BadgeTone = keyof typeof tones

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn('size-1.5 rounded-full', dots[tone])} aria-hidden /> : null}
      {children}
    </span>
  )
}
