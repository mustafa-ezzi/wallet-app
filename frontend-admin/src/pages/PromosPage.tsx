import type { ColumnDef } from '@tanstack/react-table'
import { CircleAlert, Plus, TicketPercent } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { OpsPromo } from '../api'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  Switch,
  toast,
} from '../components/ui'
import { formatDate } from '../lib/format'
import { apiErrorMessage } from '../lib/queryClient'
import { productLabel } from '../lib/status'
import { useCreatePromo, usePatchPromo, usePromos } from '../queries'

function promoState(p: OpsPromo) {
  if (p.is_valid_now) return { label: 'Valid', tone: 'success' as const }
  if (p.active) return { label: 'Used up or expired', tone: 'warn' as const }
  return { label: 'Off', tone: 'neutral' as const }
}

function UsageBar({ promo }: { promo: OpsPromo }) {
  const max = promo.max_redemptions
  const pct = max ? Math.min(100, (promo.redemption_count / max) * 100) : null
  return (
    <div className="w-40">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-fg tabular">{promo.redemption_count}</span>
        <span className="text-subtle tabular">{max != null ? `of ${max}` : 'no limit'}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {pct !== null ? (
          <div className={pct >= 100 ? 'h-full bg-warn' : 'h-full bg-primary-solid'} style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-full bg-[repeating-linear-gradient(90deg,var(--border-strong)_0_6px,transparent_6px_10px)]" />
        )}
      </div>
    </div>
  )
}

function CreatePromoForm() {
  const create = useCreatePromo()
  const [code, setCode] = useState('')
  const [productId, setProductId] = useState('premium_monthly')
  const [days, setDays] = useState('30')
  const [maxUses, setMaxUses] = useState('')
  const [note, setNote] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const normalized = code.trim().toUpperCase()
    if (!normalized) return
    create.mutate(
      {
        code: normalized,
        product_id: productId,
        trial_days: Number(days) || 30,
        max_redemptions: maxUses.trim() ? Number(maxUses) : null,
        note: note.trim() || undefined,
      },
      {
        onSuccess: (p) => {
          toast.success(`Created ${p.code}.`)
          setCode('')
          setMaxUses('')
          setNote('')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not create the code — it may already exist.')),
      },
    )
  }

  return (
    <Card>
      <CardHeader title="Create code" description="Users redeem it in the app for a Premium trial (source: promo)." />
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.6fr_0.8fr_1.4fr_auto] lg:items-end">
          <Field label="Code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PREMIUM30"
              autoComplete="off"
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Plan">
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="premium_monthly">Monthly</option>
              <option value="premium_yearly">Yearly</option>
              <option value="premium_lifetime">Lifetime</option>
            </Select>
          </Field>
          <Field label="Days">
            <Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <Field label="Max uses">
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="No limit" />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — where it's shared" />
          </Field>
          <Button type="submit" variant="primary" disabled={!code.trim()} loading={create.isPending}>
            <Plus />
            Create
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function PromosPage() {
  const promos = usePromos({ page_size: 100 })
  const patch = usePatchPromo()
  const rows = promos.data?.results ?? []
  const valid = rows.filter((p) => p.is_valid_now).length
  const redemptions = rows.reduce((sum, p) => sum + p.redemption_count, 0)

  function toggle(p: OpsPromo, active: boolean) {
    patch.mutate(
      { id: p.id, active },
      {
        onSuccess: () => toast.success(`${p.code} ${active ? 'enabled' : 'disabled'}.`),
        onError: (err) => toast.error(apiErrorMessage(err, 'Update failed.')),
      },
    )
  }

  const columns: ColumnDef<OpsPromo>[] = [
    {
      id: 'code',
      header: 'Code',
      accessorKey: 'code',
      cell: ({ row }) => (
        <div>
          <div className="font-mono font-semibold text-fg">{row.original.code}</div>
          <div className="max-w-[260px] truncate text-xs text-muted">{row.original.note || '—'}</div>
        </div>
      ),
    },
    { id: 'plan', header: 'Plan', accessorFn: (p) => productLabel(p.product_id) },
    {
      id: 'days',
      header: 'Days',
      accessorKey: 'trial_days',
      cell: ({ row }) => <span className="tabular">{row.original.product_id === 'premium_lifetime' ? '∞' : row.original.trial_days}</span>,
    },
    { id: 'usage', header: 'Usage', accessorKey: 'redemption_count', cell: ({ row }) => <UsageBar promo={row.original} /> },
    {
      id: 'state',
      header: 'State',
      accessorFn: (p) => promoState(p).label,
      cell: ({ row }) => {
        const s = promoState(row.original)
        return (
          <Badge tone={s.tone} dot>
            {s.label}
          </Badge>
        )
      },
    },
    { id: 'created', header: 'Created', accessorFn: (p) => p.created_at ?? '', cell: ({ row }) => <span className="text-muted">{formatDate(row.original.created_at)}</span> },
    {
      id: 'active',
      header: 'On',
      enableSorting: false,
      cell: ({ row }) => (
        <Switch
          label={`${row.original.active ? 'Disable' : 'Enable'} ${row.original.code}`}
          checked={row.original.active}
          disabled={patch.isPending}
          onCheckedChange={(on) => toggle(row.original, on)}
        />
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="Promo codes" description="Trial codes users redeem in the app." />

      <section aria-label="Promo counts" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard label="Codes" value={promos.data ? rows.length : undefined} icon={TicketPercent} loading={promos.isPending} />
        <StatCard label="Valid now" value={promos.data ? valid : undefined} loading={promos.isPending} />
        <StatCard label="Total redemptions" value={promos.data ? redemptions : undefined} loading={promos.isPending} className="col-span-2 xl:col-span-1" />
      </section>

      <div className="mb-6">
        <CreatePromoForm />
      </div>

      <DataTable
        caption="Promo codes"
        columns={columns}
        data={rows}
        loading={promos.isPending}
        getRowId={(p) => String(p.id)}
        empty={
          promos.isError ? (
            <EmptyState icon={CircleAlert} title="Couldn't load promo codes" />
          ) : (
            <EmptyState icon={TicketPercent} title="No promo codes yet" description="Create one above." />
          )
        }
        mobileCard={(p) => {
          const s = promoState(p)
          return (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-fg">{p.code}</span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
                <div className="text-xs text-muted">
                  {productLabel(p.product_id)} · {p.product_id === 'premium_lifetime' ? '∞' : `${p.trial_days} days`}
                </div>
                <UsageBar promo={p} />
              </div>
              <Switch label={`${p.active ? 'Disable' : 'Enable'} ${p.code}`} checked={p.active} disabled={patch.isPending} onCheckedChange={(on) => toggle(p, on)} />
            </div>
          )
        }}
      />
    </div>
  )
}
