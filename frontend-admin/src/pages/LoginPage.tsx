import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../AuthContext'
import walletTrailsLogo from '../assets/wallettrail-logo.png'
import { Button, Field, Input } from '../components/ui'

const schema = z.object({
  username: z.string().trim().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
})

type LoginValues = z.infer<typeof schema>

export function LoginPage() {
  const { user, loading, login, error } = useAuth()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } })

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(values: LoginValues) {
    try {
      await login(values.username, values.password)
    } catch {
      /* error shown via context */
    }
  }

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-fg lg:flex lg:flex-col">
        <div
          aria-hidden
          className="absolute -top-40 -right-40 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.28),transparent_65%)]"
        />
        <div
          aria-hidden
          className="absolute -bottom-48 -left-32 size-[440px] rounded-full bg-[radial-gradient(circle,rgba(13,148,136,0.3),transparent_65%)]"
        />
        <div className="relative flex items-center gap-2.5">
          <img src={walletTrailsLogo} alt="" className="size-9 rounded-[10px]" />
          <span className="font-display text-lg font-bold text-white">WalletTrails</span>
          <span className="rounded-md bg-sidebar-active px-1.5 py-px text-xs font-bold text-sidebar-accent">Ops</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h1 className="font-display text-[40px] leading-[1.05] font-bold text-white">
            One place to run the whole <span className="text-sidebar-accent">WalletTrails</span> ecosystem.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-sidebar-muted">
            Users, premium, support and push today — website and social growth next.
          </p>
          <p className="mt-10 flex items-center gap-2 text-[13px] text-sidebar-muted">
            <ShieldCheck className="size-4 text-sidebar-accent" aria-hidden />
            Ops never shows anyone's balances or transactions.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <form className="w-full max-w-[380px]" onSubmit={handleSubmit(onSubmit)} noValidate>
          <img src={walletTrailsLogo} alt="WalletTrails" className="mb-6 size-11 rounded-xl lg:hidden" />
          <h2 className="text-[26px] font-bold text-fg">Sign in to Ops</h2>
          <p className="mt-1.5 mb-7 text-sm text-muted">Staff accounts only.</p>

          {error ? (
            <div role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4">
            <Field label="Username" error={errors.username?.message}>
              <Input id="username" autoComplete="username" autoFocus {...register('username')} />
            </Field>
            <Field label="Password" error={errors.password?.message}>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
            </Field>
          </div>

          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" loading={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
