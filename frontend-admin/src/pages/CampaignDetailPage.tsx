import type { ColumnDef } from '@tanstack/react-table'
import { BellRing, CircleCheck, CircleX, Send, SkipForward, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { OpsCampaign } from '../api'
import { PushPreview } from '../components/PushPreview'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DetailList,
  EmptyState,
  PageHeader,
  Skeleton,
  StackedBar,
  StatCard,
  toast,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { apiErrorMessage } from '../lib/queryClient'
import { audienceLabel, campaignStatus, deliveryStatus } from '../lib/status'
import { useCampaign, useDeleteCampaign, useSendCampaign } from '../queries'

type Delivery = NonNullable<OpsCampaign['deliveries']>[number]

const deliveryColumns: ColumnDef<Delivery>[] = [
  {
    id: 'user',
    header: 'User',
    accessorFn: (d) => d.username || d.email,
    cell: ({ row }) => (
      <div>
        <div className="font-semibold text-fg">{row.original.username || row.original.email || `User #${row.original.user_id}`}</div>
        {row.original.email && row.original.username !== row.original.email ? (
          <div className="text-xs text-muted">{row.original.email}</div>
        ) : null}
      </div>
    ),
  },
  { id: 'platform', header: 'Platform', accessorKey: 'platform' },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    cell: ({ getValue }) => {
      const s = deliveryStatus(getValue<string>())
      return <Badge tone={s.tone}>{s.label}</Badge>
    },
  },
  {
    id: 'error',
    header: 'Error',
    accessorKey: 'error',
    cell: ({ getValue }) => <span className="block max-w-[360px] text-xs whitespace-normal text-muted">{getValue<string>() || '—'}</span>,
  },
]

export function CampaignDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const campaignId = Number(id)
  const query = useCampaign(campaignId)
  const sendCampaign = useSendCampaign()
  const deleteCampaign = useDeleteCampaign()
  const [pending, setPending] = useState<'send' | 'delete' | null>(null)
  const campaign = query.data

  if (query.isError) {
    return (
      <>
        <PageHeader title={`Campaign #${id}`} back={{ to: '/campaigns', label: 'Notifications' }} />
        <Card>
          <EmptyState icon={BellRing} title="Campaign not found" />
        </Card>
      </>
    )
  }
  if (!campaign) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-72" />
      </div>
    )
  }

  const status = campaignStatus(campaign.status)
  const retry = campaign.status === 'failed' || campaign.status === 'sending'
  const canSend = ['draft', 'scheduled', 'failed', 'sending'].includes(campaign.status)
  const summary = campaign.deliveries_summary
  const route = String((campaign.data as { route?: string })?.route || '') || 'Open app'

  function confirm() {
    if (pending === 'send') {
      sendCampaign.mutate(
        { id: campaignId, confirm: true },
        {
          onSuccess: (r) => {
            if (r.ok) toast.success(`Sent: ${r.sent_ok} delivered, ${r.sent_failed} failed.`)
            else toast.error(`Send failed: ${r.detail || 'unknown error'}`)
            setPending(null)
          },
          onError: (err) => toast.error(apiErrorMessage(err, 'Send failed.')),
        },
      )
    } else if (pending === 'delete') {
      deleteCampaign.mutate(campaignId, {
        onSuccess: () => {
          toast.success(`Deleted campaign #${campaignId}.`)
          navigate('/campaigns')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed.')),
      })
    }
  }

  return (
    <div>
      <PageHeader
        back={{ to: '/campaigns', label: 'Notifications' }}
        title={campaign.title}
        description={`Campaign #${campaign.id} · delivery summary — no user finance data`}
        actions={
          <>
            {canSend ? (
              <Button variant="primary" onClick={() => setPending('send')}>
                <Send />
                {retry ? 'Retry send' : 'Send now'}
              </Button>
            ) : null}
            {campaign.status !== 'sending' ? (
              <Button variant="danger-soft" onClick={() => setPending('delete')}>
                <Trash2 />
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      {campaign.last_error ? (
        <Alert tone="danger" title="Last error" className="mb-4">
          {campaign.last_error}
        </Alert>
      ) : null}

      <section aria-label="Delivery numbers" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Estimated users" value={campaign.recipient_estimate} icon={Users} />
        <StatCard label="Delivered" value={summary?.ok ?? campaign.sent_ok} icon={CircleCheck} />
        <StatCard label="Failed" value={summary?.failed ?? campaign.sent_failed} icon={CircleX} />
        <StatCard label="Skipped" value={summary?.skipped ?? 0} icon={SkipForward} hint={summary?.pending ? `${summary.pending} pending` : undefined} />
      </section>

      <div className="mb-6 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <CardContent>
              <DetailList
                items={[
                  {
                    label: 'Status',
                    value: (
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    ),
                  },
                  { label: 'Audience', value: audienceLabel(campaign.audience, campaign.target_username) },
                  { label: 'Tap opens', value: route },
                  { label: 'Scheduled', value: formatDateTime(campaign.scheduled_at) },
                  { label: 'Sent', value: formatDateTime(campaign.sent_at) },
                  {
                    label: 'Created',
                    value: `${formatDateTime(campaign.created_at)}${campaign.created_by_username ? ` · @${campaign.created_by_username}` : ''}`,
                  },
                ]}
              />
            </CardContent>
          </Card>
          {summary ? (
            <Card>
              <CardHeader title="Delivery results" description="Per device token." />
              <CardContent>
                <StackedBar
                  label="Deliveries by result"
                  segments={[
                    { label: 'Delivered', value: summary.ok, color: 'var(--chart-1)' },
                    { label: 'Failed', value: summary.failed, color: 'var(--danger-solid)' },
                    { label: 'Skipped', value: summary.skipped, color: 'var(--border-strong)' },
                    { label: 'Pending', value: summary.pending, color: 'var(--chart-3)' },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Card className="flex items-center justify-center p-6">
          <PushPreview title={campaign.title} body={campaign.body} when={campaign.sent_at ? formatDateTime(campaign.sent_at) : 'now'} />
        </Card>
      </div>

      <h2 className="mb-3 text-[15px] font-semibold text-fg">Who got it</h2>
      <DataTable
        caption="Deliveries"
        columns={deliveryColumns}
        data={campaign.deliveries ?? []}
        getRowId={(d) => String(d.id)}
        empty={<EmptyState icon={BellRing} title="No deliveries yet" description="Recipients appear here after the campaign is sent." />}
        mobileCard={(d) => {
          const s = deliveryStatus(d.status)
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-fg">{d.username || d.email || `User #${d.user_id}`}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <div className="text-xs text-muted">
                {d.platform}
                {d.error ? ` · ${d.error}` : ''}
              </div>
            </div>
          )
        }}
      />

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending === 'delete' ? `Delete campaign #${campaign.id}?` : retry ? 'Retry this campaign?' : 'Send this campaign now?'}
        description={
          pending === 'delete'
            ? 'This removes it and its delivery records permanently.'
            : `It goes to ${audienceLabel(campaign.audience, campaign.target_username)}. This cannot be undone.`
        }
        confirmLabel={pending === 'delete' ? 'Delete' : 'Send now'}
        tone={pending === 'delete' ? 'danger' : 'primary'}
        loading={sendCampaign.isPending || deleteCampaign.isPending}
        onConfirm={confirm}
      />
    </div>
  )
}
