import type { ColumnDef } from '@tanstack/react-table'
import {
  CircleAlert,
  ClipboardList,
  Copy,
  FilterX,
  MessageSquareText,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
  Webhook,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  feedbackWebhookUrl,
  type FeedbackCountRow,
  type FeedbackStatus,
  type TesterFeedbackItem,
} from '../api'
import { useCan } from '../AuthContext'
import {
  Badge,
  Button,
  Card,
  ChartCard,
  ConfirmDialog,
  DataTable,
  DetailList,
  Drawer,
  DrawerContent,
  EmptyState,
  Field,
  PageHeader,
  SearchInput,
  Select,
  StackedBar,
  StatCard,
  Textarea,
  toast,
  type BadgeTone,
  type Segment,
} from '../components/ui'
import { formatDateTime, formatRelative } from '../lib/format'
import { apiErrorMessage } from '../lib/queryClient'
import { useDeleteFeedback, useFeedback, useUpdateFeedback } from '../queries'

const PAGE_SIZE = 25
const PALETTE = [
  'var(--chart-1)',
  'var(--chart-4)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--info)',
  'var(--border-strong)',
]

const STATUS_BADGE: Record<FeedbackStatus, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'warn' },
  reviewed: { label: 'Reviewed', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
}

const STATUS_FILTERS = [
  ['', 'All statuses'],
  ['new', 'New'],
  ['reviewed', 'Reviewed'],
  ['resolved', 'Resolved'],
] as const

const PLATFORM_FILTERS = [
  ['', 'All platforms'],
  ['Android', 'Android App'],
  ['Web', 'Web App'],
] as const

function toSegments(rows: FeedbackCountRow[] | undefined): Segment[] {
  return (rows ?? []).slice(0, 6).map((row, idx) => ({
    label: row.label,
    value: row.count,
    color: PALETTE[idx % PALETTE.length],
  }))
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  const meta = STATUS_BADGE[status] ?? STATUS_BADGE.new
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-subtle">—</span>
  const tone: BadgeTone = score >= 4 ? 'success' : score === 3 ? 'warn' : 'danger'
  return <Badge tone={tone}>{score} / 5</Badge>
}

function appsScriptTemplate(webhookUrl: string) {
  return `const WEBHOOK_URL = '${webhookUrl}';
const WEBHOOK_SECRET = 'PASTE_YOUR_GOOGLE_FORM_WEBHOOK_SECRET_OR_CRON_SECRET';

function onFormSubmit(e) {
  var response = e.response;
  var answers = {};
  response.getItemResponses().forEach(function (ir) {
    answers[ir.getItem().getTitle()] = ir.getResponse();
  });

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Webhook-Secret': WEBHOOK_SECRET },
    payload: JSON.stringify({
      response_id: response.getId(),
      submitted_at: response.getTimestamp().toISOString(),
      answers: answers,
    }),
    muteHttpExceptions: true,
  });
}`
}

function BreakdownCard({
  title,
  description,
  rows,
  emptyLabel,
}: {
  title: string
  description: string
  rows: FeedbackCountRow[] | undefined
  emptyLabel: string
}) {
  const segments = toSegments(rows)
  return (
    <ChartCard
      title={title}
      description={description}
      chart={
        segments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>
        ) : (
          <StackedBar segments={segments} label={title} />
        )
      }
    />
  )
}

function FeedbackDetailDrawer({
  item,
  canWrite,
  onClose,
}: {
  item: TesterFeedbackItem | null
  canWrite: boolean
  onClose: () => void
}) {
  const update = useUpdateFeedback()
  const remove = useDeleteFeedback()
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setNote(item?.staff_note ?? '')
    setConfirmDelete(false)
  }, [item?.id, item?.staff_note])

  function setStatus(status: FeedbackStatus) {
    if (!item || update.isPending) return
    update.mutate(
      { id: item.id, status },
      {
        onSuccess: () => toast.success(`Marked as ${STATUS_BADGE[status].label.toLowerCase()}.`),
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not update status.')),
      },
    )
  }

  function saveNote() {
    if (!item || update.isPending) return
    update.mutate(
      { id: item.id, staff_note: note },
      {
        onSuccess: () => toast.success('Staff note saved.'),
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not save note.')),
      },
    )
  }

  function handleDelete() {
    if (!item || remove.isPending) return
    remove.mutate(item.id, {
      onSuccess: () => {
        toast.success('Feedback response deleted.')
        onClose()
      },
      onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed.')),
    })
  }

  const rawEntries = Object.entries(item?.raw_answers ?? {})

  return (
    <>
      <Drawer open={!!item} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent
          title={item ? `Response #${item.id}` : 'Feedback'}
          description={item?.submitted_at ? formatDateTime(item.submitted_at) : undefined}
          className="w-[min(520px,100vw)]"
        >
          {item ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.status} />
                  {item.platform ? <Badge>{item.platform}</Badge> : null}
                  {item.price_range ? <Badge tone="info">{item.price_range}</Badge> : null}
                </div>
                {canWrite ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(['new', 'reviewed', 'resolved'] as FeedbackStatus[]).map((st) => (
                      <Button
                        key={st}
                        size="sm"
                        variant={item.status === st ? 'primary' : 'secondary'}
                        disabled={update.isPending || item.status === st}
                        onClick={() => setStatus(st)}
                      >
                        {STATUS_BADGE[st].label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>

              <DetailList
                columns={2}
                items={[
                  { label: 'Ease of use', value: <ScoreBadge score={item.ease_score} /> },
                  { label: 'Recommend score', value: <ScoreBadge score={item.recommend_score} /> },
                  { label: 'Feature discovery', value: item.discovery_level || '—' },
                  { label: 'Trai experience', value: item.trai_experience || '—' },
                  { label: 'Price range (PKR)', value: item.price_range || '—' },
                  { label: 'Contact', value: item.contact || '—' },
                ]}
              />

              {item.features_tried.length > 0 ? (
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">Features tried</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.features_tried.map((feat) => (
                      <Badge key={feat} tone="neutral">
                        {feat}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">Favorite feature</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{item.favorite_feature || '—'}</p>
                </div>
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">Bugs or confusing screens</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{item.bugs_or_confusion || '—'}</p>
                </div>
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">Suggested improvements</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{item.improvement_idea || '—'}</p>
                </div>
              </div>

              {rawEntries.length > 0 ? (
                <div className="border-t border-border pt-4">
                  <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">All Google Form answers</h3>
                  <dl className="mt-2 space-y-2.5">
                    {rawEntries.map(([q, a]) => (
                      <div key={q} className="rounded-xl bg-surface-2 px-3 py-2">
                        <dt className="text-xs font-medium text-muted">{q}</dt>
                        <dd className="mt-0.5 text-sm text-fg">
                          {Array.isArray(a) ? a.join(', ') : String(a ?? '—')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              <div className="border-t border-border pt-4">
                <Field label="Staff note">
                  <Textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Internal notes or action items…"
                    disabled={!canWrite}
                  />
                </Field>
                {canWrite ? (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={remove.isPending}
                    >
                      <Trash2 />
                      Delete
                    </Button>
                    <Button variant="primary" size="sm" loading={update.isPending} onClick={saveNote}>
                      Save note
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this feedback response?"
        description="This permanently removes the tester response from Ops."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}

function WebhookSetupDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const url = feedbackWebhookUrl()
  const script = appsScriptTemplate(url)

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied.`)
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }

  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent
        title="Connect Google Form"
        description="Real-time webhook via Google Apps Script"
        className="w-[min(560px,100vw)]"
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-wide text-subtle uppercase">1. Webhook URL</p>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{url}</code>
              <Button size="sm" variant="secondary" onClick={() => void copy(url, 'Webhook URL')}>
                <Copy />
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted">
              Set <code className="font-mono">GOOGLE_FORM_WEBHOOK_SECRET</code> (or reuse{' '}
              <code className="font-mono">CRON_SECRET</code>) in your Django environment variables.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-subtle uppercase">2. Google Apps Script</p>
              <Button size="sm" variant="secondary" onClick={() => void copy(script, 'Apps Script')}>
                <Copy />
                Copy script
              </Button>
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
              <li>Open your Google Form, click the three dots (⋮) → Script editor.</li>
              <li>Paste the script below and replace the secret value.</li>
              <li>Open Triggers (clock icon) → Add Trigger → Function: <code className="font-mono">onFormSubmit</code>, Event: <code className="font-mono">From form → On form submit</code>.</li>
            </ol>
            <pre className="overflow-x-auto rounded-xl border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-fg">
              {script}
            </pre>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export function FeedbackPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const canWrite = useCan('feedback.write')
  const [selected, setSelected] = useState<TesterFeedbackItem | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)

  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const status = searchParams.get('status') ?? ''
  const platform = searchParams.get('platform') ?? ''
  const q = searchParams.get('q') ?? ''

  const query = useFeedback({ page, page_size: PAGE_SIZE, status, platform, q })
  const summary = query.data?.summary

  function updateParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('page')
      return next
    })
  }

  function clearFilters() {
    setSearchParams({})
  }

  const hasFilters = Boolean(status || platform || q)

  const columns = useMemo<ColumnDef<TesterFeedbackItem, unknown>[]>(
    () => [
      {
        id: 'submitted',
        header: 'Submitted',
        accessorFn: (row) => row.submitted_at ?? '',
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-fg">
              {row.original.submitted_at ? formatRelative(row.original.submitted_at) : '—'}
            </div>
            <div className="text-xs text-muted">{row.original.platform || 'Unknown platform'}</div>
          </div>
        ),
      },
      {
        id: 'ease',
        header: 'Ease',
        accessorFn: (row) => row.ease_score ?? 0,
        cell: ({ row }) => <ScoreBadge score={row.original.ease_score} />,
      },
      {
        id: 'price',
        header: 'Price (PKR)',
        accessorFn: (row) => row.price_range,
        cell: ({ row }) => (
          <span className="text-sm text-fg">{row.original.price_range || <span className="text-subtle">—</span>}</span>
        ),
      },
      {
        id: 'trai',
        header: 'Trai',
        accessorFn: (row) => row.trai_experience,
        cell: ({ row }) => (
          <span className="line-clamp-1 max-w-[200px] text-sm text-muted">
            {row.original.trai_experience || '—'}
          </span>
        ),
      },
      {
        id: 'highlights',
        header: 'Bugs / Suggestions',
        enableSorting: false,
        cell: ({ row }) => {
          const text =
            row.original.bugs_or_confusion ||
            row.original.improvement_idea ||
            row.original.favorite_feature
          return (
            <span className="line-clamp-1 max-w-[260px] text-sm text-fg">
              {text || <span className="text-subtle">No written notes</span>}
            </span>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tester feedback"
        description="Google Form responses from WalletTrails beta testers."
        actions={
          <Button variant="secondary" onClick={() => setSetupOpen(true)}>
            <Webhook />
            Google Form setup
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total responses"
          value={summary?.total ?? 0}
          icon={ClipboardList}
          loading={query.isPending}
        />
        <StatCard
          label="Needs review"
          value={summary?.new_count ?? 0}
          icon={MessageSquareText}
          loading={query.isPending}
        />
        <StatCard
          label="Avg ease of use"
          value={summary?.avg_ease !== null && summary?.avg_ease !== undefined ? `${summary.avg_ease} / 5` : '—'}
          icon={Star}
          loading={query.isPending}
        />
        <StatCard
          label="Avg recommend"
          value={
            summary?.avg_recommend !== null && summary?.avg_recommend !== undefined
              ? `${summary.avg_recommend} / 5`
              : '—'
          }
          icon={ThumbsUp}
          loading={query.isPending}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownCard
          title="Price willingness (PKR)"
          description="What testers say feels fair"
          rows={summary?.price_ranges}
          emptyLabel="No pricing answers yet."
        />
        <BreakdownCard
          title="Trai experience"
          description="Feedback on the AI bookkeeper"
          rows={summary?.trai_experiences}
          emptyLabel="No Trai answers yet."
        />
        <BreakdownCard
          title="Features discovered"
          description="Most-tried WalletTrails modules"
          rows={summary?.features_tried}
          emptyLabel="No feature selections yet."
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={q}
            onSearch={(value) => updateParam('q', value)}
            placeholder="Search bugs, suggestions, favorite feature, contact…"
            className="min-w-[240px] flex-1"
          />
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => updateParam('status', e.target.value)}
            className="w-40"
          >
            {STATUS_FILTERS.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by platform"
            value={platform}
            onChange={(e) => updateParam('platform', e.target.value)}
            className="w-40"
          >
            {PLATFORM_FILTERS.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <FilterX />
              Reset
            </Button>
          ) : null}
        </div>
      </Card>

      {query.isError ? (
        <Card>
          <EmptyState
            icon={CircleAlert}
            title="Couldn't load tester feedback"
            action={<Button onClick={() => void query.refetch()}>Try again</Button>}
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.results ?? []}
          loading={query.isPending}
          getRowId={(row) => String(row.id)}
          onRowClick={(row) => setSelected(row)}
          pagination={
            query.data
              ? {
                  page,
                  pageSize: PAGE_SIZE,
                  total: query.data.count,
                  onPageChange: (nextPage) =>
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev)
                      next.set('page', String(nextPage))
                      return next
                    }),
                }
              : undefined
          }
          empty={
            <EmptyState
              icon={Sparkles}
              title={hasFilters ? 'No matching responses' : 'No tester responses yet'}
              description={
                hasFilters
                  ? 'Try clearing your filters.'
                  : 'Connect your Google Form webhook to see responses appear here automatically.'
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => setSetupOpen(true)}>
                    <Webhook />
                    Set up Google Form
                  </Button>
                )
              }
            />
          }
          mobileCard={(row) => (
            <button
              type="button"
              onClick={() => setSelected(row)}
              className="w-full space-y-2 p-4 text-left hover:bg-surface-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">{row.platform || 'Tester response'}</span>
                <StatusBadge status={row.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <ScoreBadge score={row.ease_score} />
                {row.price_range ? <span>· {row.price_range} PKR</span> : null}
                {row.submitted_at ? <span>· {formatRelative(row.submitted_at)}</span> : null}
              </div>
              {row.bugs_or_confusion || row.improvement_idea ? (
                <p className="line-clamp-2 text-xs text-fg">{row.bugs_or_confusion || row.improvement_idea}</p>
              ) : null}
            </button>
          )}
        />
      )}

      <FeedbackDetailDrawer
        item={selected}
        canWrite={canWrite}
        onClose={() => setSelected(null)}
      />
      <WebhookSetupDrawer open={setupOpen} onClose={() => setSetupOpen(false)} />
    </div>
  )
}
