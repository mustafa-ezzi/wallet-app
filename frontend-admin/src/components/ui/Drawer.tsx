import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { DialogOverlay } from './Dialog'

export const Drawer = RadixDialog.Root
export const DrawerTrigger = RadixDialog.Trigger
export const DrawerClose = RadixDialog.Close

export function DrawerContent({
  title,
  description,
  side = 'right',
  children,
  footer,
  className,
  bare = false,
}: {
  title: ReactNode
  description?: ReactNode
  side?: 'left' | 'right'
  children?: ReactNode
  footer?: ReactNode
  className?: string
  /** Render children edge to edge with a visually hidden title (e.g. mobile nav). */
  bare?: boolean
}) {
  return (
    <RadixDialog.Portal>
      <DialogOverlay />
      <RadixDialog.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-[min(440px,100vw)] flex-col bg-surface shadow-pop focus:outline-none',
          side === 'right'
            ? 'right-0 border-l border-border data-[state=open]:animate-slide-in-right'
            : 'left-0 border-r border-border data-[state=open]:animate-slide-in-left',
          className,
        )}
      >
        {bare ? (
          <>
            <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
            <RadixDialog.Description className="sr-only">{description ?? title}</RadixDialog.Description>
            {children}
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div className="min-w-0">
                <RadixDialog.Title className="text-lg font-semibold text-fg">{title}</RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="mt-0.5 text-sm text-muted">{description}</RadixDialog.Description>
                ) : (
                  <RadixDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</RadixDialog.Description>
                )}
              </div>
              <RadixDialog.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-2">
                  <X />
                </Button>
              </RadixDialog.Close>
            </div>
            <div className="flex-1 overflow-auto px-6 py-5 text-sm">{children}</div>
            {footer ? <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">{footer}</div> : null}
          </>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}
