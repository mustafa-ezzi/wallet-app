import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { OpsAuditRow } from '../api'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, SearchInput, Select, Skeleton, type BadgeTone } from '../components/ui'
import { cn } from '../lib/cn'
import { formatNumber } from '../lib/format'
import { useAuditLog } from '../queries'

const PAGE_SIZE = 50

const AREAS = [
  { value: '', label: 'All actions' },
  { value: 'user.', label: 'Users' },
  { value: 'users.', label: 'Bulk user tasks' },
  { value: 'premium.', label: 'Premium' },
  { value: 'promo.', label: 'Promo codes' },
  { value: 'campaign.', label: 'Notifications' },
  { value: 'support.', label: 'Support' },
  { value: 'config.', label: 'Ads & Config' },
] as const

function actionTone(action: string): BadgeTone {
  if (/delete|revoke|suspend|cancel/.test(action) && !action.includes('unsuspend')) return 'danger'
  if (/grant|create|send|unsuspend/.test(action)) return 'success'
  if (/config|update|status/.test(action)) return 'warn'
  return 'neutral'
}

function humanAction(action: string) {
  return action.replace(/[._]/g, ' ')
}

function targetLink(row: OpsAuditRow): { label: string; to?: string } | null {
  if (!row.target_type) return null
  const id = row.target_id
  switch (row.target_type) {
    case 'user':
      return { label: `User #${id}`, to: id ? `/users/${id}` : undefined }
    case 'push_campaign':
      return { label: `Campaign #${id}`, to: id ? `/campaigns/${id}` : undefined }
    case 'support_thread':
      return { label: `Ticket #${id}`, to: id ? `/support/${id}` : undefined }
    case 'promo_code':
      return { label: `Promo #${id}`, to: '/promos' }
    case 'entitlement':
      return { label: `Entitlement #${id}`, to: '/premium' }
    case 'app_remote_config':
      return { label: 'Remote config', to: '/ads' }
    default:
      return { label: `${row.target_type}${id ? ` #${id}` : ''}` }
  }
}

function dayLabel(iso: string) {
  const d = parseISO(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, d MMM yyyy')
}

function groupByDay(rows: OpsAuditRow[]) {
  const groups: { day: string; rows: OpsAuditRow[] }[] = []
  for (const row of rows) {
    const day = row.created_at ? dayLabel(row.created_at) : 'Unknown date'
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.rows.push(row)
    else groups.push({ day, rows: [row] })
  }
  return groups
}

function MetaValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-subtle">—</span>
  if (typeof value === 'object') {
    return <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-fg">{JSON.stringify(value, null, 2)}</pre>
  }
  return <span className="break-all text-fg">{String(value)}</span>
}

function AuditEntry({ row }: { row: OpsAuditRow }) {
  const [open, setOpen] = useState(false)
  const target = targetLink(row)
  const metaKeys = Object.keys(row.meta || {})
  const hasDetails = metaKeys.length > 0 || !!row.ip_address

  return (
    <li className="relative pl-12">
      <span className="absolute top-0 bottom-0 left-[18px] w-px bg-border" aria-hidden />
      <span className="absolute top-3 left-0">
        <Avatar name={row.actor_username || '?'} size="sm" />
      </span>
      <div className="rounded-xl border border-transparent py-2.5 pr-2 transition-colors hover:border-border hover:bg-surface-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-3 text-sm">
          <span className="font-semibold text-fg">{row.actor_username ? `@${row.actor_username}` : 'System'}</span>
          <Badge tone={actionTone(row.action)} className="font-mono">
            {row.action}
          </Badge>
          {target ? (
            target.to ? (
              <Link to={target.to} className="font-semibold text-primary hover:underline">
                {target.label}
              </Link>
            ) : (
              <span className="text-muted">{target.label}</span>
            )
          ) : null}
          <span className="ml-auto text-xs text-subtle tabular-nums">
            {row.created_at ? format(parseISO(row.created_at), 'HH:mm') : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 pl-3">
          <span className="sr-only">{humanAction(row.action)}</span>
          {hasDetails ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-md text-xs font-semibold text-muted hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
            >
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
              {open ? 'Hide details' : `Details${metaKeys.length ? ` (${metaKeys.length})` : ''}`}
            </button>
          ) : null}
        </div>
        {open ? (
          <dl className="mt-2 ml-3 grid gap-x-4 gap-y-2 rounded-lg bg-surface-2 p-3 text-[13px] sm:grid-cols-[minmax(120px,auto)_1fr]">
            {metaKeys.map((key) => (
              <div key={key} className="contents">
                <dt className="font-semibold text-muted">{key.replace(/_/g, ' ')}</dt>
                <dd>
                  <MetaValue value={row.meta[key]} />
                </dd>
              </div>
            ))}
            {row.ip_address ? (
              <div className="contents">
                <dt className="font-semibold text-muted">IP address</dt>
                <dd className="font-mono text-fg">{row.ip_address}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </li>
  )
}

export function AuditPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const action = params.get('action') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const audit = useAuditLog({ page_size: PAGE_SIZE, page, q, action })
  const rows = audit.data?.results ?? []
  const count = audit.data?.count ?? 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    if (!('page' in next)) p.delete('page')
    setParams(p, { replace: true })
  }

  return (
    <>
      <PageHeader title="Audit log" description="Every staff action — grants, pushes, suspensions, config changes." />

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <SearchInput className="sm:max-w-sm sm:flex-1" value={q} onSearch={(v) => update({ q: v })} placeholder="Search actor, action, target…" label="Search audit log" />
        <Select aria-label="Filter by area" className="sm:w-52" value={action} onChange={(e) => update({ action: e.target.value })}>
          {AREAS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
        <span className="text-sm text-muted sm:ml-auto">{formatNumber(count)} entries</span>
      </Card>

      <Card className="p-4 sm:p-5">
        {audit.isPending ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-5 flex-1" />
              </div>
            ))}
          </div>
        ) : audit.isError ? (
          <EmptyState icon={CircleAlert} title="Couldn't load the audit log" action={<Button onClick={() => void audit.refetch()}>Try again</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={q || action ? 'No matching entries' : 'No staff actions yet'}
            description={q || action ? 'Try a different search or area.' : 'Actions taken in this panel show up here.'}
          />
        ) : (
          <div className={cn('space-y-6', audit.isFetching && 'opacity-70')}>
            {groupByDay(rows).map((group) => (
              <section key={group.day} aria-label={group.day}>
                <h2 className="mb-2 text-xs font-bold tracking-wide text-subtle uppercase">{group.day}</h2>
                <ol className="space-y-1">
                  {group.rows.map((row) => (
                    <AuditEntry key={row.id} row={row} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        {pages > 1 ? (
          <nav aria-label="Pagination" className="mt-5 flex items-center justify-between border-t border-border pt-4 text-sm text-muted">
            <span>
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                <ChevronLeft />
                Newer
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
                Older
                <ChevronRight />
              </Button>
            </div>
          </nav>
        ) : null}
      </Card>
    </>
  )
}
