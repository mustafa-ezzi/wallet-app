import { Toaster as Sonner } from 'sonner'
import { useTheme } from '../../lib/theme'

export { toast } from 'sonner'

export function Toaster() {
  const { theme } = useTheme()
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border-border !bg-surface !text-fg !shadow-pop !font-sans',
          description: '!text-muted',
          success: '[&_[data-icon]]:!text-brand',
          error: '[&_[data-icon]]:!text-danger',
        },
      }}
    />
  )
}
