import type { ColumnDef } from '@tanstack/react-table'
import { Ban, Crown, LifeBuoy, ScrollText, ShieldCheck, Smartphone, Trash2, UserCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCan } from '../AuthContext'
import type { OpsAuditRow, OpsEntitlement, OpsUser, SupportThread } from '../api'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DetailList,
  Dialog,
  DialogClose,
  DialogContent,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '../components/ui'
import { apiErrorMessage } from '../lib/queryClient'
import { displayName, formatDate, formatDateTime, formatRelative } from '../lib/format'
import { entitlementStatus, inactivityStatus, productLabel, SOURCE_LABELS, supportStatus } from '../lib/status'
import { useAuditLog, useDeleteUser, useEntitlements, useSetSuspended, useSupportThreads, useUser } from '../queries'

const entitlementColumns: ColumnDef<OpsEntitlement>[] = [
  { id: 'product', header: 'Product', accessorFn: (e) => productLabel(e.product_id) },
  { id: 'source', header: 'Source', accessorFn: (e) => SOURCE_LABELS[e.source] ?? e.source },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (e) => e.status,
    cell: ({ row }) => {
      const s = entitlementStatus(row.original.status, row.original.is_live)
      return <Badge tone={s.tone}>{s.label}</Badge>
    },
  },
  { id: 'started', header: 'Started', accessorFn: (e) => e.started_at ?? '', cell: ({ row }) => formatDate(row.original.started_at) },
  { id: 'expires', header: 'Expires', accessorFn: (e) => e.expires_at ?? '', cell: ({ row }) => formatDate(row.original.expires_at) },
]

const auditColumns: ColumnDef<OpsAuditRow>[] = [
  { id: 'when', header: 'When', accessorFn: (r) => r.created_at ?? '', cell: ({ row }) => formatDateTime(row.original.created_at) },
  { id: 'actor', header: 'Staff', accessorFn: (r) => r.actor_username ?? '', cell: ({ row }) => (row.original.actor_username ? `@${row.original.actor_username}` : '—') },
  { id: 'action', header: 'Action', accessorKey: 'action', cell: ({ getValue }) => <code className="text-xs">{getValue<string>()}</code> },
]

function SupportList({ userId }: { userId: number }) {
  const threads = useSupportThreads({ user_id: userId, page_size: 20 })
  const rows = threads.data?.results ?? []
  if (threads.isPending) return <Skeleton className="h-24" />
  if (rows.length === 0) return <EmptyState icon={LifeBuoy} title="No support tickets" className="py-8" />
  return (
    <ul className="divide-y divide-border">
      {rows.map((t: SupportThread) => {
        const s = supportStatus(t.status)
        return (
          <li key={t.id}>
            <Link to={`/support/${t.id}`} className="flex items-center gap-3 px-1 py-3 hover:text-primary">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-fg">
                  #{t.id} {t.subject}
                </span>
                <span className="block truncate text-xs text-muted">{t.last_message_preview || '—'}</span>
              </span>
              <Badge tone={s.tone}>{s.label}</Badge>
              <span className="w-24 text-right text-xs text-subtle">{formatRelative(t.updated_at)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function DeleteUserDialog({ user, open, onOpenChange }: { user: OpsUser; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const deleteUser = useDeleteUser()
  const [confirmName, setConfirmName] = useState('')
  const matches = confirmName.trim() === user.username

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmName('')
        onOpenChange(next)
      }}
    >
      <DialogContent
        title={`Delete @${user.username} permanently?`}
        description="This cannot be undone."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={deleteUser.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={!matches}
              loading={deleteUser.isPending}
              onClick={() =>
                deleteUser.mutate(
                  { id: user.id, confirmUsername: confirmName.trim() },
                  {
                    onSuccess: () => {
                      toast.success(`Deleted @${user.username}.`)
                      navigate('/users', { replace: true })
                    },
                    onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed.')),
                  },
                )
              }
            >
              <Trash2 />
              Delete forever
            </Button>
          </>
        }
      >
        <p className="mb-4 leading-relaxed text-muted">
          Removes the account and all linked personal data: wallets, records, bank SMS drafts, devices, support threads,
          entitlements, people links and their household rows. Households they alone belonged to are removed too.
        </p>
        <Field label={<>Type <code className="text-fg">{user.username}</code> to confirm</>}>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={user.username}
            autoComplete="off"
            disabled={deleteUser.isPending}
          />
        </Field>
      </DialogContent>
    </Dialog>
  )
}

export function UserDetailPage() {
  const { id } = useParams()
  const userId = Number(id)
  const userQuery = useUser(userId)
  const setSuspended = useSetSuspended()
  const user = userQuery.data
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canWriteUsers = useCan('users.write')
  const canDeleteUsers = useCan('users.delete')
  const entitlements = useEntitlements({ user_id: userId, page_size: 20 })
  const audit = useAuditLog({ target_type: 'user', target_id: userId, page_size: 25 })

  if (!Number.isFinite(userId)) return <Alert tone="danger">Invalid user id.</Alert>

  if (userQuery.isError) {
    return (
      <>
        <PageHeader title="User" back={{ to: '/users', label: 'Users' }} />
        <Card>
          <EmptyState icon={UserRound} title="User not found" description="They may have been deleted, or the Ops API failed." />
        </Card>
      </>
    )
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const tier = inactivityStatus(user.inactivity_tier)
  const protectedAccount = Boolean(user.is_superuser)

  return (
    <div>
      <PageHeader
        back={{ to: '/users', label: 'Users' }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={displayName(user)} size="md" />
            <span className="min-w-0 truncate">{displayName(user)}</span>
          </span>
        }
        description={`@${user.username} · hosted profile summary — no ledger access`}
        actions={
          <>
            {canWriteUsers ? (
              <Button
                variant={user.suspended ? 'primary' : 'danger-soft'}
                disabled={protectedAccount}
                onClick={() => setConfirmSuspend(true)}
              >
                {user.suspended ? <UserCheck /> : <Ban />}
                {user.suspended ? 'Unsuspend' : 'Suspend'}
              </Button>
            ) : null}
            {canDeleteUsers ? (
              <Button variant="danger" disabled={protectedAccount} onClick={() => setConfirmDelete(true)}>
                <Trash2 />
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        <Badge tone={tier.tone} dot>
          {tier.label}
        </Badge>
        {user.premium?.is_premium ? <Badge tone="success">Premium · {productLabel(user.premium.product_id)}</Badge> : <Badge>Free</Badge>}
        {user.suspended ? <Badge tone="danger">Suspended {user.suspended_at ? formatRelative(user.suspended_at) : ''}</Badge> : null}
        {user.is_staff ? <Badge tone="info">Staff</Badge> : null}
        {user.is_superuser ? <Badge tone="info">Superuser — protected</Badge> : null}
        {user.marketing_opt_out ? <Badge>Opted out of marketing</Badge> : null}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="overview">
            <UserRound /> Overview
          </TabsTrigger>
          <TabsTrigger value="devices">
            <Smartphone /> Devices
          </TabsTrigger>
          <TabsTrigger value="premium">
            <Crown /> Premium
          </TabsTrigger>
          <TabsTrigger value="support">
            <LifeBuoy /> Support
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollText /> Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Account" />
            <CardContent>
              <DetailList
                items={[
                  { label: 'Email', value: user.email || '—' },
                  { label: 'Name', value: [user.first_name, user.last_name].filter(Boolean).join(' ') || '—' },
                  { label: 'Joined', value: formatDateTime(user.date_joined) },
                  { label: 'Status', value: user.suspended ? 'Suspended' : 'Active' },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Activity" description="Counts only — never amounts." />
            <CardContent>
              <DetailList
                items={[
                  { label: 'Last seen', value: `${formatRelative(user.last_seen_at)} · ${formatDateTime(user.last_seen_at)}` },
                  { label: 'Last login', value: formatDateTime(user.last_login) },
                  { label: 'Wallets', value: user.wallet_count },
                  { label: 'Records in 30 days', value: user.tx_count_30d },
                ]}
              />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Internal notes" />
            <CardContent className="text-sm text-muted">{user.internal_notes || 'No notes for this user.'}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader title="Push devices" description="Token values are never shown." />
            <CardContent>
              <DetailList
                columns={3}
                items={[
                  { label: 'Registered devices', value: user.device_count },
                  { label: 'Platforms', value: user.platforms.join(', ') || 'None' },
                  {
                    label: 'Latest device ping',
                    value: user.latest_device
                      ? `${user.latest_device.platform} · ${formatDateTime(user.latest_device.updated_at)}`
                      : '—',
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="premium" className="space-y-4">
          <Card>
            <CardHeader
              title="Current plan"
              actions={
                <Button asChild size="sm">
                  <Link to={`/premium?grant=${encodeURIComponent(user.username)}`}>
                    <Crown />
                    Grant premium
                  </Link>
                </Button>
              }
            />
            <CardContent>
              <DetailList
                columns={3}
                items={[
                  { label: 'Plan', value: user.premium?.is_premium ? productLabel(user.premium.product_id) : 'Free' },
                  { label: 'Source', value: user.premium?.source ? (SOURCE_LABELS[user.premium.source] ?? user.premium.source) : '—' },
                  { label: 'Expires', value: !user.premium?.is_premium ? '—' : user.premium.expires_at ? formatDate(user.premium.expires_at) : 'Never' },
                ]}
              />
            </CardContent>
          </Card>
          <DataTable
            caption="Entitlement history"
            columns={entitlementColumns}
            data={entitlements.data?.results ?? []}
            loading={entitlements.isPending}
            empty={<EmptyState icon={Crown} title="No entitlements" className="py-8" />}
          />
        </TabsContent>

        <TabsContent value="support">
          <Card>
            <CardContent>
              <SupportList userId={user.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <DataTable
            caption="Staff actions on this user"
            columns={auditColumns}
            data={audit.data?.results ?? []}
            loading={audit.isPending}
            empty={<EmptyState icon={ShieldCheck} title="No staff actions on this user" className="py-8" />}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title={user.suspended ? `Unsuspend @${user.username}?` : `Suspend @${user.username}?`}
        description={user.suspended ? 'They will be able to sign in again.' : 'They will not be able to sign in until unsuspended.'}
        confirmLabel={user.suspended ? 'Unsuspend' : 'Suspend'}
        tone={user.suspended ? 'primary' : 'danger'}
        loading={setSuspended.isPending}
        onConfirm={() =>
          setSuspended.mutate(
            { user, suspend: !user.suspended },
            {
              onSuccess: (next) => {
                toast.success(next.suspended ? `Suspended @${user.username}.` : `Unsuspended @${user.username}.`)
                setConfirmSuspend(false)
              },
              onError: (err) => toast.error(apiErrorMessage(err, 'Action failed.')),
            },
          )
        }
      />
      <DeleteUserDialog user={user} open={confirmDelete} onOpenChange={setConfirmDelete} />
    </div>
  )
}
