import type { ColumnDef } from '@tanstack/react-table'
import { CircleAlert, Crown, Gift, ShieldAlert, Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { OpsEntitlement, PurchaseQueueItem } from '../api'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  StackedBar,
  StatCard,
  toast,
} from '../components/ui'
import { formatDate, formatDateTime } from '../lib/format'
import { apiErrorMessage } from '../lib/queryClient'
import { entitlementStatus, productLabel, SOURCE_LABELS } from '../lib/status'
import { useEntitlements, useGrantPremium, usePremiumStats, usePurchaseQueue, useRevokePremium } from '../queries'

const PAGE_SIZE = 25

const STATUS_FILTERS = [
  ['live', 'Live'],
  ['active', 'Active (incl. past expiry)'],
  ['expired', 'Expired'],
  ['revoked', 'Revoked'],
  ['', 'All'],
] as const

const queueColumns: ColumnDef<PurchaseQueueItem>[] = [
  { id: 'user', header: 'User', accessorKey: 'username', cell: ({ row }) => <span className="font-semibold">@{row.original.username}</span> },
  { id: 'product', header: 'Product', accessorFn: (p) => productLabel(p.product_id) },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    cell: ({ getValue }) => <Badge tone={getValue<string>() === 'failed' ? 'danger' : 'warn'}>{getValue<string>()}</Badge>,
  },
  {
    id: 'error',
    header: 'Error',
    accessorKey: 'error',
    cell: ({ getValue }) => <span className="block max-w-[320px] text-xs whitespace-normal text-muted">{getValue<string>() || '—'}</span>,
  },
  { id: 'when', header: 'When', accessorFn: (p) => p.created_at ?? '', cell: ({ row }) => formatDateTime(row.original.created_at) },
]

function GrantForm({ initialUsername }: { initialUsername: string }) {
  const grant = useGrantPremium()
  const [username, setUsername] = useState(initialUsername)
  const [productId, setProductId] = useState('premium_monthly')
  const [days, setDays] = useState('30')
  const [note, setNote] = useState('')
  const lifetime = productId === 'premium_lifetime'

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim()) return
    grant.mutate(
      {
        username: username.trim(),
        product_id: productId,
        days: lifetime ? undefined : Number(days) || 30,
        note: note.trim() || undefined,
        source: 'manual_grant',
      },
      {
        onSuccess: (e) => {
          toast.success(`Granted ${productLabel(e.product_id)} to @${e.username}.`)
          setUsername('')
          setNote('')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Grant failed — check the username.')),
      },
    )
  }

  return (
    <Card>
      <CardHeader title="Manual grant" description="Give Premium without a purchase — logged in the audit trail." />
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_0.6fr_1.4fr_auto] lg:items-end">
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoComplete="off" />
          </Field>
          <Field label="Plan">
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="premium_monthly">Monthly</option>
              <option value="premium_yearly">Yearly</option>
              <option value="premium_lifetime">Lifetime</option>
            </Select>
          </Field>
          <Field label="Days">
            <Input type="number" min={1} value={lifetime ? '' : days} disabled={lifetime} placeholder={lifetime ? '∞' : '30'} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — why this grant" />
          </Field>
          <Button type="submit" variant="primary" disabled={!username.trim()} loading={grant.isPending}>
            <Gift />
            Grant
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function PremiumPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'live'
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [revoking, setRevoking] = useState<OpsEntitlement | null>(null)

  const statsQuery = usePremiumStats()
  const entitlements = useEntitlements({ status, q, page, page_size: PAGE_SIZE })
  const queue = usePurchaseQueue({ page_size: 20 })
  const revoke = useRevokePremium()
  const stats = statsQuery.data

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value)
      else merged.delete(key)
    }
    if (!('page' in next)) merged.delete('page')
    merged.delete('grant')
    setParams(merged, { replace: true })
  }

  const columns: ColumnDef<OpsEntitlement>[] = [
    {
      id: 'user',
      header: 'User',
      accessorKey: 'username',
      cell: ({ row }) => (
        <Link to={`/users/${row.original.user_id}`} className="block hover:text-primary" onClick={(e) => e.stopPropagation()}>
          <div className="font-semibold">@{row.original.username}</div>
          <div className="text-xs text-muted">{row.original.email}</div>
        </Link>
      ),
    },
    { id: 'product', header: 'Plan', accessorFn: (e) => productLabel(e.product_id) },
    { id: 'source', header: 'Source', accessorFn: (e) => SOURCE_LABELS[e.source] ?? e.source },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: ({ row }) => {
        const s = entitlementStatus(row.original.status, row.original.is_live)
        return (
          <Badge tone={s.tone} dot>
            {s.label}
          </Badge>
        )
      },
    },
    { id: 'started', header: 'Started', accessorFn: (e) => e.started_at ?? '', cell: ({ row }) => formatDate(row.original.started_at) },
    {
      id: 'expires',
      header: 'Expires',
      accessorFn: (e) => e.expires_at ?? '',
      cell: ({ row }) => (row.original.expires_at ? formatDate(row.original.expires_at) : <span className="text-subtle">Never</span>),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) =>
        row.original.is_live || row.original.status === 'active' ? (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRevoking(row.original)}>
              Revoke
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Premium"
        description="Play Billing and manual grants — who is Premium, never what they spend in WalletTrails."
      />

      {stats && !stats.play_verify_configured ? (
        <Alert tone="warn" className="mb-4" title="Play verification isn't configured">
          Set <code>GOOGLE_PLAY_SERVICE_ACCOUNT_JSON</code> on Railway, or use manual grants. In-app purchases fail until then.
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <section aria-label="Premium counts" className="grid grid-cols-2 gap-3">
          <StatCard label="Live premium" value={stats?.live_premium} icon={Crown} loading={statsQuery.isPending} />
          <StatCard label="From Google Play" value={stats?.play_live} icon={Store} loading={statsQuery.isPending} />
          <StatCard label="Manual grants live" value={stats?.manual_grants_live} icon={Gift} loading={statsQuery.isPending} />
          <StatCard
            label="Failed or pending verifies"
            value={stats?.pending_or_failed_purchases}
            icon={ShieldAlert}
            loading={statsQuery.isPending}
            hint={stats?.pending_or_failed_purchases ? 'See the queue below' : 'Purchase queue is healthy'}
          />
        </section>
        <Card>
          <CardHeader title="Live by plan" />
          <CardContent>
            {stats ? (
              <StackedBar
                label="Live premium by plan"
                segments={[
                  { label: 'Monthly', value: stats.live_monthly, color: 'var(--chart-1)' },
                  { label: 'Yearly', value: stats.live_yearly, color: 'var(--chart-4)' },
                  { label: 'Lifetime', value: stats.live_lifetime, color: 'var(--chart-3)' },
                ]}
              />
            ) : (
              <Skeleton className="h-32" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <GrantForm key={params.get('grant') ?? ''} initialUsername={params.get('grant') ?? ''} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[15px] font-semibold text-fg">Entitlements</h2>
        <SearchInput className="w-full sm:w-64" value={q} onSearch={(v) => update({ q: v })} placeholder="User, email or order id" label="Search entitlements" />
        <Select aria-label="Entitlement status" className="w-full sm:w-52" value={status} onChange={(e) => update({ status: e.target.value })}>
          {STATUS_FILTERS.map(([value, label]) => (
            <option key={value || 'all'} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        caption="Entitlements"
        columns={columns}
        data={entitlements.data?.results ?? []}
        loading={entitlements.isPending || entitlements.isPlaceholderData}
        getRowId={(e) => String(e.id)}
        pagination={{ page, pageSize: PAGE_SIZE, total: entitlements.data?.count ?? 0, onPageChange: (p) => update({ page: String(p) }) }}
        empty={
          entitlements.isError ? (
            <EmptyState icon={CircleAlert} title="Couldn't load entitlements" />
          ) : (
            <EmptyState icon={Crown} title="No entitlements in this view" />
          )
        }
        mobileCard={(e) => {
          const s = entitlementStatus(e.status, e.is_live)
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-fg">@{e.username}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <div className="text-xs text-muted">
                {productLabel(e.product_id)} · {SOURCE_LABELS[e.source] ?? e.source} · expires {e.expires_at ? formatDate(e.expires_at) : 'never'}
              </div>
            </div>
          )
        }}
      />

      {(queue.data?.results.length ?? 0) > 0 ? (
        <>
          <h2 className="mt-8 mb-3 text-[15px] font-semibold text-fg">Failed or pending Play verifies</h2>
          <DataTable caption="Purchase verification queue" columns={queueColumns} data={queue.data?.results ?? []} getRowId={(p) => String(p.id)} />
        </>
      ) : null}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke Premium for @${revoking?.username}?`}
        description={`Their ${productLabel(revoking?.product_id)} entitlement ends now. Play subscriptions are not refunded from here.`}
        confirmLabel="Revoke"
        tone="danger"
        loading={revoke.isPending}
        onConfirm={() =>
          revoking &&
          revoke.mutate(revoking.id, {
            onSuccess: () => {
              toast.success(`Revoked Premium for @${revoking.username}.`)
              setRevoking(null)
            },
            onError: (err) => toast.error(apiErrorMessage(err, 'Revoke failed.')),
          })
        }
      />
    </div>
  )
}
