import type { ColumnDef } from '@tanstack/react-table'
import { BellRing, Copy, Eye, FlaskConical, MoreHorizontal, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  toast,
} from '../components/ui'
import { formatDateTime, formatRelative } from '../lib/format'
import { apiErrorMessage } from '../lib/queryClient'
import { AUDIENCES, audienceLabel, campaignStatus } from '../lib/status'
import {
  useCampaignEstimate,
  useCampaignRecipients,
  useCampaigns,
  useCancelCampaign,
  useCreateCampaign,
  useDeleteCampaign,
  useSendCampaign,
} from '../queries'

const ROUTES = [
  { value: '', label: 'Open app (default)' },
  { value: 'home', label: 'Home' },
  { value: 'wallets', label: 'Wallets' },
  { value: 'bills', label: 'Bills' },
  { value: 'income', label: 'Income' },
  { value: 'reports', label: 'Reports' },
  { value: 'family', label: 'Family' },
  { value: 'household', label: 'Family (household)' },
  { value: 'settings', label: 'Settings' },
]

const TEMPLATES = [
  {
    id: 'reengage_7d',
    label: 'Re-engage 7d',
    title: 'Your WalletTrails is waiting',
    body: 'Open the app to sync wallets and stay on top of bills.',
    audience: 'inactive_7d',
    route: 'home',
  },
  {
    id: 'reengage_30d',
    label: 'Win-back 30d',
    title: 'We miss your WalletTrails',
    body: 'Come back — your money history is safe. Tap to open.',
    audience: 'inactive_30d',
    route: 'home',
  },
  {
    id: 'reengage_90d',
    label: 'Win-back 90d',
    title: 'Still keeping your rupees?',
    body: 'Your wallets are still here when you are ready. Open WalletTrails anytime.',
    audience: 'inactive_90d',
    route: 'home',
  },
  {
    id: 'whats_new',
    label: "What's new",
    title: 'WalletTrails update',
    body: 'Widgets and reports got sharper — open the app to try them.',
    audience: 'all',
    route: 'home',
  },
]

const TITLE_MAX = 120
const BODY_MAX = 400

type Draft = { title: string; body: string; audience: string; route: string; schedule: string; userId: number | null; userLabel: string }
const EMPTY_DRAFT: Draft = { title: '', body: '', audience: 'all', route: '', schedule: '', userId: null, userLabel: '' }

type PendingAction = { kind: 'send' | 'delete'; campaign: OpsCampaign } | null

const canSend = (c: OpsCampaign) => ['draft', 'scheduled', 'failed', 'sending'].includes(c.status)
const isRetry = (c: OpsCampaign) => c.status === 'failed' || c.status === 'sending'

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={value > max * 0.9 ? 'text-warn' : 'text-subtle'}>{`${value}/${max}`}</span>
}

export function CampaignsPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [userQuery, setUserQuery] = useState('')
  const [pending, setPending] = useState<PendingAction>(null)
  const campaigns = useCampaigns({ page_size: 50 })
  const recipients = useCampaignRecipients(draft.audience === 'user' ? userQuery : '')
  const estimate = useCampaignEstimate(draft.audience, draft.userId ?? undefined)
  const createCampaign = useCreateCampaign()
  const sendCampaign = useSendCampaign()
  const cancelCampaign = useCancelCampaign()
  const deleteCampaign = useDeleteCampaign()
  const rows = campaigns.data?.results ?? []
  const est = estimate.isError ? null : estimate.data
  const limitReached = est ? est.campaigns_sent_today >= est.max_campaigns_per_day : false

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  function onCreate() {
    let scheduled_at: string | null = null
    if (draft.schedule) {
      const when = new Date(draft.schedule)
      if (Number.isNaN(when.getTime()) || when <= new Date()) {
        toast.error('Pick a time in the future, or leave the schedule empty.')
        return
      }
      scheduled_at = when.toISOString()
    }
    createCampaign.mutate(
      {
        title: draft.title.trim(),
        body: draft.body.trim(),
        audience: draft.audience,
        user_id: draft.audience === 'user' ? draft.userId ?? undefined : undefined,
        data: draft.route ? { route: draft.route } : {},
        scheduled_at,
      },
      {
        onSuccess: (c) => {
          setDraft(EMPTY_DRAFT)
          setUserQuery('')
          toast.success(
            scheduled_at ? `Campaign #${c.id} scheduled for ${formatDateTime(c.scheduled_at)}.` : `Draft #${c.id} saved. Dry run it, then send.`,
          )
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not save the campaign.')),
      },
    )
  }

  function dryRun(c: OpsCampaign) {
    sendCampaign.mutate(
      { id: c.id, dry_run: true },
      {
        onSuccess: (r) => toast.info(`Dry run #${c.id}: about ${r.users ?? 0} users on ${r.tokens ?? 0} devices would get it.`),
        onError: (err) => toast.error(apiErrorMessage(err, 'Dry run failed.')),
      },
    )
  }

  function duplicate(c: OpsCampaign) {
    setDraft({
      title: c.title,
      body: c.body,
      audience: c.audience,
      route: String((c.data as { route?: string })?.route || ''),
      schedule: '',
      userId: c.target_user_id,
      userLabel: c.target_username ?? '',
    })
    setUserQuery(c.target_username ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    toast.info(`Copied #${c.id} into the composer.`)
  }

  function confirmPending() {
    if (!pending) return
    const { kind, campaign } = pending
    if (kind === 'send') {
      sendCampaign.mutate(
        { id: campaign.id, confirm: true },
        {
          onSuccess: (r) => {
            if (r.ok) toast.success(`${isRetry(campaign) ? 'Retried' : 'Sent'} #${campaign.id}: ${r.sent_ok} delivered, ${r.sent_failed} failed.`)
            else toast.error(`Send failed: ${r.detail || 'unknown error'}`)
            setPending(null)
          },
          onError: (err) => toast.error(apiErrorMessage(err, 'Send failed.')),
        },
      )
    } else {
      deleteCampaign.mutate(campaign.id, {
        onSuccess: () => {
          toast.success(`Deleted campaign #${campaign.id}.`)
          setPending(null)
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed.')),
      })
    }
  }

  const columns: ColumnDef<OpsCampaign>[] = [
    {
      id: 'campaign',
      header: 'Campaign',
      accessorKey: 'title',
      cell: ({ row }) => (
        <div className="max-w-[340px] min-w-[220px] whitespace-normal">
          <div className="font-semibold text-fg">
            <span className="text-subtle">#{row.original.id}</span> {row.original.title}
          </div>
          <div className="line-clamp-1 text-xs text-muted">{row.original.body}</div>
        </div>
      ),
    },
    { id: 'audience', header: 'Audience', accessorFn: (c) => audienceLabel(c.audience, c.target_username) },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: ({ row }) => {
        const s = campaignStatus(row.original.status)
        return (
          <div>
            <Badge tone={s.tone} dot>
              {s.label}
            </Badge>
            {row.original.status === 'scheduled' && row.original.scheduled_at ? (
              <div className="mt-1 text-xs text-subtle">{formatDateTime(row.original.scheduled_at)}</div>
            ) : null}
          </div>
        )
      },
    },
    { id: 'estimate', header: 'Estimate', accessorKey: 'recipient_estimate', cell: ({ getValue }) => <span className="tabular">{getValue<number>()}</span> },
    {
      id: 'results',
      header: 'Results',
      accessorFn: (c) => c.sent_ok,
      cell: ({ row }) =>
        row.original.status === 'sent' || row.original.status === 'failed' ? (
          <span className="tabular">
            <span className="text-primary">{row.original.sent_ok} ok</span> · <span className={row.original.sent_failed ? 'text-danger' : 'text-subtle'}>{row.original.sent_failed} failed</span>
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      id: 'created',
      header: 'Created',
      accessorFn: (c) => c.created_at ?? '',
      cell: ({ row }) => <span className="text-muted">{formatRelative(row.original.created_at)}</span>,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const c = row.original
        return (
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for campaign ${c.id}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => navigate(`/campaigns/${c.id}`)}>
                  <Eye /> View results
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => duplicate(c)}>
                  <Copy /> Duplicate
                </DropdownMenuItem>
                {canSend(c) ? (
                  <>
                    <DropdownMenuItem onSelect={() => dryRun(c)}>
                      <FlaskConical /> Dry run
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPending({ kind: 'send', campaign: c })}>
                      <Send /> {isRetry(c) ? 'Retry send' : 'Send now'}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {c.status === 'draft' || c.status === 'scheduled' ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      cancelCampaign.mutate(c.id, {
                        onSuccess: () => toast.success(`Cancelled #${c.id}.`),
                        onError: (err) => toast.error(apiErrorMessage(err, 'Cancel failed.')),
                      })
                    }
                  >
                    <X /> Cancel
                  </DropdownMenuItem>
                ) : null}
                {c.status !== 'sending' ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-danger [&_svg]:text-danger" onSelect={() => setPending({ kind: 'delete', campaign: c })}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  const valid = Boolean(draft.title.trim() && draft.body.trim() && (draft.audience !== 'user' || draft.userId))

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`Push broadcasts to opted-in users · limit ${est?.max_campaigns_per_day ?? 20} per day`}
        actions={
          <Button onClick={() => void campaigns.refetch()} loading={campaigns.isFetching && !campaigns.isPending}>
            {campaigns.isFetching && !campaigns.isPending ? null : <RefreshCw />}
            Refresh
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Compose" description="Start from a template or write your own." />
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDraft({ title: t.title, body: t.body, audience: t.audience, route: t.route, schedule: '', userId: null, userLabel: '' })
                    setUserQuery('')
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            <Field label="Title" hint={<Counter value={draft.title.length} max={TITLE_MAX} />}>
              <Input value={draft.title} maxLength={TITLE_MAX} onChange={(e) => set('title', e.target.value)} placeholder="WalletTrails update" />
            </Field>
            <Field label="Message" hint={<Counter value={draft.body.length} max={BODY_MAX} />}>
              <Textarea
                value={draft.body}
                maxLength={BODY_MAX}
                rows={3}
                onChange={(e) => set('body', e.target.value)}
                placeholder="Widgets are sharper — open the app to sync."
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Audience">
                <Select
                  value={draft.audience}
                  onChange={(e) => {
                    set('audience', e.target.value)
                    if (e.target.value !== 'user') {
                      set('userId', null)
                      set('userLabel', '')
                      setUserQuery('')
                    }
                  }}
                >
                  {AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tap opens">
                <Select value={draft.route} onChange={(e) => set('route', e.target.value)}>
                  {ROUTES.map((r) => (
                    <option key={r.value || 'default'} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Schedule" hint="Leave empty to save a draft.">
                <Input type="datetime-local" value={draft.schedule} onChange={(e) => set('schedule', e.target.value)} />
              </Field>
            </div>
            {draft.audience === 'user' ? (
              <Field label="User" hint="Search by username or email. They still need a linked device and product updates turned on.">
                <div className="space-y-2">
                  <Input
                    value={userQuery}
                    onChange={(e) => {
                      setUserQuery(e.target.value)
                      set('userId', null)
                      set('userLabel', '')
                    }}
                    placeholder="username or email"
                    aria-label="Find a user"
                  />
                  {draft.userId ? (
                    <p className="text-[13px] font-semibold text-fg">Sending to @{draft.userLabel}</p>
                  ) : userQuery.trim().length >= 2 ? (
                    <ul className="overflow-hidden rounded-xl border border-border">
                      {(recipients.data ?? []).length === 0 ? (
                        <li className="px-3 py-2 text-[13px] text-muted">{recipients.isPending ? 'Searching…' : 'No matching users.'}</li>
                      ) : (
                        recipients.data?.map((user) => (
                          <li key={user.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
                              onClick={() => {
                                set('userId', user.id)
                                set('userLabel', user.username)
                                setUserQuery(user.username)
                              }}
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-semibold text-fg">@{user.username}</span>
                                <span className="block truncate text-xs text-muted">{user.email || 'No email'}</span>
                              </span>
                              <span className="shrink-0 text-xs text-subtle">{user.has_push ? 'Device linked' : 'No device'}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-muted">Type at least two letters, then pick the person.</p>
                  )}
                </div>
              </Field>
            ) : null}
          </CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5">
            <div className="text-[13px] text-muted" aria-live="polite">
              {estimate.isPending ? (
                <Skeleton className="h-4 w-56" />
              ) : est ? (
                <>
                  Reaches about <strong className="text-fg tabular">{est.users}</strong> users on{' '}
                  <strong className="text-fg tabular">{est.tokens}</strong> devices · {est.campaigns_sent_today}/{est.max_campaigns_per_day} sent
                  today
                </>
              ) : (
                'Audience estimate unavailable.'
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={!valid && !draft.schedule} onClick={() => { setDraft(EMPTY_DRAFT); setUserQuery('') }}>
                Clear
              </Button>
              <Button variant="primary" disabled={!valid} loading={createCampaign.isPending} onClick={onCreate}>
                {draft.schedule ? 'Schedule' : 'Save draft'}
              </Button>
            </div>
          </div>
        </Card>
        <Card className="flex flex-col items-center justify-center p-6">
          <PushPreview title={draft.title} body={draft.body} />
        </Card>
      </div>

      {limitReached ? (
        <Alert tone="warn" className="mb-4">
          Today's limit of {est?.max_campaigns_per_day} campaigns is reached. New sends will be refused until tomorrow.
        </Alert>
      ) : null}
      {draft.audience === 'user' && draft.userId && est && est.tokens === 0 ? (
        <Alert tone="info" className="mb-4" title="This user cannot receive a push yet">
          @{draft.userLabel} has no linked device, or product updates are turned off. They need a native build, then Settings → Link this device for push.
        </Alert>
      ) : est && est.tokens === 0 ? (
        <Alert tone="info" className="mb-4" title="No devices to reach yet">
          Only users with a registered push token and product updates turned on get broadcasts. Install a native build with
          Firebase, then link the device under Settings. See <code>mobile/android-push-notifications-firebase-setup.md</code>.
        </Alert>
      ) : null}

      <h2 className="mb-3 text-[15px] font-semibold text-fg">Campaigns</h2>
      <DataTable
        caption="Push campaigns"
        columns={columns}
        data={rows}
        loading={campaigns.isPending}
        getRowId={(c) => String(c.id)}
        onRowClick={(c) => navigate(`/campaigns/${c.id}`)}
        empty={<EmptyState icon={BellRing} title="No campaigns yet" description="Compose one above to get started." />}
        mobileCard={(c) => {
          const s = campaignStatus(c.status)
          return (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-fg">{c.title}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <div className="line-clamp-2 text-xs text-muted">{c.body}</div>
              <div className="text-xs text-subtle">
                {audienceLabel(c.audience, c.target_username)} · {c.status === 'sent' ? `${c.sent_ok} delivered` : `~${c.recipient_estimate} users`}
              </div>
            </div>
          )
        }}
      />
      <p className="mt-4 text-xs text-subtle">
        Due-date reminders are separate from broadcasts. <Link to="/audit" className="font-semibold hover:text-primary">Audit log</Link>{' '}
        records every send.
      </p>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === 'delete'
            ? `Delete campaign #${pending.campaign.id}?`
            : pending && isRetry(pending.campaign)
              ? `Retry campaign #${pending.campaign.id}?`
              : `Send campaign #${pending?.campaign.id}?`
        }
        description={
          pending?.kind === 'delete'
            ? 'This removes it and its delivery records permanently.'
            : `“${pending?.campaign.title}” goes to ${audienceLabel(pending?.campaign.audience ?? '', pending?.campaign.target_username)}. This cannot be undone.`
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : 'Send now'}
        tone={pending?.kind === 'delete' ? 'danger' : 'primary'}
        loading={sendCampaign.isPending || deleteCampaign.isPending}
        onConfirm={confirmPending}
      />
    </div>
  )
}
