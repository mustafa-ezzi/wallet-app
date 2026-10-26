import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

export const DialogOverlay = forwardRef<HTMLDivElement, { className?: string }>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <RadixDialog.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-fade-in', className)}
      {...props}
    />
  )
})

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  hideClose = false,
}: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
  hideClose?: boolean
}) {
  return (
    <RadixDialog.Portal>
      <DialogOverlay />
      <RadixDialog.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2',
          'max-h-[calc(100vh-48px)] overflow-auto rounded-2xl border border-border bg-surface shadow-pop',
          'data-[state=open]:animate-pop-in focus:outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <RadixDialog.Title className="text-lg font-semibold text-fg">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1 text-sm text-muted">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RadixDialog.Description>
            )}
          </div>
          {hideClose ? null : (
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-2">
                <X />
              </Button>
            </RadixDialog.Close>
          )}
        </div>
        {children ? <div className="px-6 py-4 text-sm text-fg">{children}</div> : <div className="h-4" />}
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-2/60 px-6 py-3.5">{footer}</div>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}

/** Controlled yes/no dialog for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  tone?: 'primary' | 'danger'
  loading?: boolean
  onConfirm: () => void
  children?: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={loading}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}
