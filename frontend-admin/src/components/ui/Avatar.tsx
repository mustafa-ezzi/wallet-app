import { initials } from '../../lib/format'
import { cn } from '../../lib/cn'

const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' } as const

export function Avatar({ name, size = 'sm', className }: { name: string; size?: keyof typeof sizes; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-primary-soft font-display font-bold text-primary-soft-fg',
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
