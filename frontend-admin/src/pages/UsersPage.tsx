import type { ColumnDef } from '@tanstack/react-table'
import { Columns3, Download, FilterX, Smartphone, Users as UsersIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { downloadUsersCsv, type OpsUser } from '../api'
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  DetailList,
  Drawer,
  DrawerContent,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  toast,
} from '../components/ui'
import { displayName, formatDate, formatDateTime, formatRelative } from '../lib/format'
import { inactivityStatus, productLabel } from '../lib/status'
import { useUser, useUsers } from '../queries'

const PAGE_SIZE = 25
const COLUMNS_KEY = 'wallettrails_ops_user_columns'

const FILTERS = [
  {
    key: 'inactivity',
    label: 'Activity',
    options: [
      ['', 'All activity'],
      ['none', 'Active'],
      ['7d', 'Inactive 7d'],
      ['30d', 'Inactive 30d'],
      ['90d', 'Inactive 90d'],
    ],
  },
  {
    key: 'suspended',
    label: 'Status',
    options: [
      ['', 'Any status'],
      ['0', 'Not suspended'],
      ['1', 'Suspended'],
    ],
  },
  {
    key: 'push',
    label: 'Push',
    options: [
      ['', 'Any push'],
      ['1', 'Has device'],
      ['0', 'No device'],
    ],
  },
  {
    key: 'premium',
    label: 'Plan',
    options: [
      ['', 'Any plan'],
      ['1', 'Premium'],
      ['0', 'Free'],
    ],
  },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function TierBadge({ tier }: { tier: string }) {
  const s = inactivityStatus(tier)
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  )
}

function PlanBadge({ user }: { user: OpsUser }) {
  return user.premium?.is_premium ? <Badge tone="success">Premium</Badge> : <Badge>Free</Badge>
}

function UserCell({ user }: { user: OpsUser }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={displayName(user)} />
      <div className="min-w-0">
        <div className="truncate font-semibold text-fg">{user.username}</div>
        <div className="truncate text-xs text-muted">{user.email || 'No email'}</div>
      </div>
    </div>
  )
}

const columns: ColumnDef<OpsUser>[] = [
  { id: 'user', header: 'User', accessorFn: (u) => u.username, cell: ({ row }) => <UserCell user={row.original} /> },
  {
    id: 'joined',
    header: 'Joined',
    accessorFn: (u) => u.date_joined ?? '',
    cell: ({ row }) => <span className="text-muted">{formatDate(row.original.date_joined)}</span>,
  },
  {
    id: 'last_seen',
    header: 'Last seen',
    accessorFn: (u) => u.last_seen_at ?? '',
    cell: ({ row }) => (
      <span className="text-muted" title={formatDateTime(row.original.last_seen_at)}>
        {formatRelative(row.original.last_seen_at)}
      </span>
    ),
  },
  { id: 'activity', header: 'Activity', accessorKey: 'inactivity_tier', cell: ({ row }) => <TierBadge tier={row.original.inactivity_tier} /> },
  {
    id: 'push',
    header: 'Push',
    accessorFn: (u) => u.device_count,
    cell: ({ row }) =>
      row.original.push_enabled ? (
        <Badge tone="info">{row.original.platforms.join(', ') || 'Yes'}</Badge>
      ) : (
        <span className="text-subtle">None</span>
      ),
  },
  { id: 'plan', header: 'Plan', accessorFn: (u) => (u.premium?.is_premium ? 1 : 0), cell: ({ row }) => <PlanBadge user={row.original} /> },
  { id: 'wallets', header: 'Wallets', accessorKey: 'wallet_count', cell: ({ getValue }) => <span className="tabular">{getValue<number>()}</span> },
  {
    id: 'records',
    header: 'Records 30d',
    accessorKey: 'tx_count_30d',
    cell: ({ getValue }) => <span className="tabular">{getValue<number>()}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (u) => (u.suspended ? 1 : 0),
    cell: ({ row }) => (row.original.suspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>),
  },
]

const OPTIONAL_COLUMNS = [
  ['joined', 'Joined'],
  ['last_seen', 'Last seen'],
  ['push', 'Push'],
  ['plan', 'Plan'],
  ['wallets', 'Wallets'],
  ['records', 'Records 30d'],
] as const

function readColumns(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLUMNS_KEY) || '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

function UserPreview({ userId }: { userId: number }) {
  const query = useUser(userId)
  const user = query.data
  if (query.isError) return <p className="text-sm text-danger">Couldn't load this user.</p>
  if (!user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-56" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={displayName(user)} size="lg" />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-fg">{displayName(user)}</div>
          <div className="truncate text-sm text-muted">@{user.username}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TierBadge tier={user.inactivity_tier} />
            <PlanBadge user={user} />
            {user.suspended ? <Badge tone="danger">Suspended</Badge> : null}
            {user.is_staff ? <Badge tone="info">Staff</Badge> : null}
          </div>
        </div>
      </div>
      <DetailList
        items={[
          { label: 'Email', value: user.email || '—' },
          { label: 'Joined', value: formatDate(user.date_joined) },
          { label: 'Last seen', value: formatRelative(user.last_seen_at) },
          { label: 'Last login', value: formatDateTime(user.last_login) },
          { label: 'Wallets', value: user.wallet_count },
          { label: 'Records in 30 days', value: user.tx_count_30d },
          { label: 'Push devices', value: user.device_count ? `${user.device_count} · ${user.platforms.join(', ')}` : 'None' },
          { label: 'Plan', value: user.premium?.is_premium ? productLabel(user.premium.product_id) : 'Free' },
        ]}
      />
      {user.internal_notes ? (
        <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm text-muted">{user.internal_notes}</div>
      ) : null}
    </div>
  )
}

export function UsersPage() {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(FILTERS.map((f) => [f.key, params.get(f.key) ?? ''])) as Record<FilterKey, string>
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [visible, setVisible] = useState<Record<string, boolean>>(readColumns)
  const [exporting, setExporting] = useState(false)

  const users = useUsers({ page, page_size: PAGE_SIZE, q, ...filters })
  const rows = users.data?.results ?? []
  const count = users.data?.count ?? 0
  const hasFilters = Boolean(q) || Object.values(filters).some(Boolean)

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value)
      else merged.delete(key)
    }
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  function toggleColumn(id: string, on: boolean) {
    const next = { ...visible, [id]: on }
    setVisible(next)
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(next))
  }

  async function onExport() {
    setExporting(true)
    try {
      await downloadUsersCsv({ q: q || undefined, premium: filters.premium || undefined })
    } catch {
      toast.error('CSV export failed.')
    } finally {
      setExporting(false)
    }
  }

  const empty = useMemo(
    () =>
      users.isError ? (
        <EmptyState
          icon={UsersIcon}
          title="Couldn't load users"
          description="The Ops API didn't respond."
          action={<Button onClick={() => void users.refetch()}>Try again</Button>}
        />
      ) : (
        <EmptyState
          icon={hasFilters ? FilterX : UsersIcon}
          title={hasFilters ? 'No users match these filters' : 'No users yet'}
          action={hasFilters ? <Button onClick={() => setParams({}, { replace: true })}>Clear filters</Button> : undefined}
        />
      ),
    [users, hasFilters, setParams],
  )

  return (
    <div>
      <PageHeader
        title="Users"
        description={`${count.toLocaleString('en-US')} hosted accounts · privacy-safe summaries only`}
        actions={
          <Button onClick={() => void onExport()} loading={exporting}>
            {exporting ? null : <Download />}
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          className="w-full sm:w-72"
          value={q}
          onSearch={(value) => update({ q: value })}
          placeholder="Search name, email, username"
          label="Search users"
        />
        {FILTERS.map((f) => (
          <Select
            key={f.key}
            aria-label={f.label}
            className="w-[calc(50%-4px)] sm:w-40"
            value={filters[f.key]}
            onChange={(e) => update({ [f.key]: e.target.value })}
          >
            {f.options.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        ))}
        {hasFilters ? (
          <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
            <FilterX />
            Clear
          </Button>
        ) : null}
        <div className="ml-auto hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                <Columns3 />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {OPTIONAL_COLUMNS.map(([id, label]) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={visible[id] !== false}
                  onCheckedChange={(on) => toggleColumn(id, on === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DataTable
        caption="Hosted users"
        columns={columns}
        data={rows}
        loading={users.isPending || users.isPlaceholderData}
        getRowId={(u) => String(u.id)}
        onRowClick={(u) => setPreviewId(u.id)}
        columnVisibility={visible}
        empty={empty}
        pagination={{ page, pageSize: PAGE_SIZE, total: count, onPageChange: (p) => update({ page: String(p) }) }}
        mobileCard={(u) => (
          <div className="space-y-2.5">
            <UserCell user={u} />
            <div className="flex flex-wrap gap-1.5">
              <TierBadge tier={u.inactivity_tier} />
              <PlanBadge user={u} />
              {u.push_enabled ? (
                <Badge tone="info">
                  <Smartphone className="size-3" aria-hidden />
                  {u.platforms.join(', ')}
                </Badge>
              ) : null}
              {u.suspended ? <Badge tone="danger">Suspended</Badge> : null}
            </div>
            <div className="text-xs text-muted">
              Seen {formatRelative(u.last_seen_at)} · {u.wallet_count} wallets · {u.tx_count_30d} records in 30d
            </div>
          </div>
        )}
      />

      <p className="mt-4 text-xs leading-relaxed text-subtle">
        Counts only — amounts are never shown in Ops. “Records 30d” is how many transactions a user created with a date in
        the last 30 days. Activity uses last API use, login, push-device ping or latest record, not days since sign-up.
      </p>

      <Drawer open={previewId !== null} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DrawerContent
          title="User preview"
          description="Quick look — open the profile for actions."
          footer={
            previewId !== null ? (
              <Button asChild variant="primary">
                <Link to={`/users/${previewId}`}>Open full profile</Link>
              </Button>
            ) : null
          }
        >
          {previewId !== null ? <UserPreview userId={previewId} /> : null}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
