import * as RadixMenu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '../../lib/cn'

export const DropdownMenu = RadixMenu.Root
export const DropdownMenuTrigger = RadixMenu.Trigger

export function DropdownMenuContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof RadixMenu.Content>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-52 rounded-xl border border-border bg-surface p-1.5 shadow-pop data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </RadixMenu.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: ComponentPropsWithoutRef<typeof RadixMenu.Item>) {
  return (
    <RadixMenu.Item
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg outline-none select-none',
        'data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixMenu.CheckboxItem>) {
  return (
    <RadixMenu.CheckboxItem
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-8 text-sm text-fg outline-none select-none relative',
        'data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <RadixMenu.ItemIndicator className="absolute left-2.5 inline-flex">
        <Check className="size-4 text-primary" aria-hidden />
      </RadixMenu.ItemIndicator>
      {children}
    </RadixMenu.CheckboxItem>
  )
}

export function DropdownMenuLabel({ className, ...props }: ComponentPropsWithoutRef<typeof RadixMenu.Label>) {
  return <RadixMenu.Label className={cn('px-2.5 py-2 text-xs text-muted', className)} {...props} />
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <RadixMenu.Separator className={cn('my-1 h-px bg-border', className)} />
}
