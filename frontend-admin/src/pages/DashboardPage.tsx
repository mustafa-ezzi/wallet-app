import {
  Activity,
  ArrowRight,
  BellRing,
  CircleCheck,
  Crown,
  FilePlus2,
  Globe,
  LifeBuoy,
  MousePointerClick,
  MessageCircleWarning,
  RefreshCw,
  Sparkles,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AttentionItem, OpsDashboardSummary } from '../api'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ChartCard,
  ChartLegend,
  EmptyState,
  MiniTable,
  PageHeader,
  Skeleton,
  StackedBar,
  StatCard,
  TrendChart,
  toast,
} from '../components/ui'
import { cn } from '../lib/cn'
import { useCan } from '../AuthContext'
import { formatRange, useDateRange } from '../lib/dateRange'
import { formatDateTime, formatRelative, shortDay } from '../lib/format'
import { useAnalyticsReport, useDashboardSummary, useRefreshInactivity, useWebsiteSummary } from '../queries'

type Kpi = {
  label: string
  icon: LucideIcon
  value: (d: OpsDashboardSummary) => number
  previous?: (d: OpsDashboardSummary) => number | undefined
  spark?: (d: OpsDashboardSummary) => number[]
  hint?: string
  lowerIsBetter?: boolean
}

const KPIS: Kpi[] = [
  { label: 'Total users', icon: Users, value: (d) => d.snapshot.total_users, hint: 'All hosted accounts right now' },
  {
    label: 'New sign-ups',
    icon: UserPlus,
    value: (d) => d.current.signups,
    previous: (d) => d.previous?.signups,
    spark: (d) => d.series.map((p) => p.signups),
  },
  {
    label: 'Active users',
    icon: Activity,
    value: (d) => d.current.active_users,
    previous: (d) => d.previous?.active_users,
    spark: (d) => d.series.map((p) => p.active_users),
    hint: 'Users who added records in the range',
  },
  { label: 'Premium live', icon: Crown, value: (d) => d.snapshot.premium_live, hint: 'Users with a live entitlement' },
  {
    label: 'Records created',
    icon: FilePlus2,
    value: (d) => d.current.records_created,
    previous: (d) => d.previous?.records_created,
    spark: (d) => d.series.map((p) => p.records_created),
    hint: 'Count of rows, never amounts',
  },
  {
    label: 'Support tickets opened',
    icon: LifeBuoy,
    value: (d) => d.current.support_opened,
    previous: (d) => d.previous?.support_opened,
    lowerIsBetter: true,
  },
  {
    label: 'Premium started',
    icon: Sparkles,
    value: (d) => d.current.premium_started,
    previous: (d) => d.previous?.premium_started,
  },
  {
    label: 'Push campaigns sent',
    icon: BellRing,
    value: (d) => d.current.campaigns_sent,
    previous: (d) => d.previous?.campaigns_sent,
  },
]

const ACTIVITY_SERIES = [
  { key: 'signups', label: 'Sign-ups', color: 'var(--chart-1)' },
  { key: 'active_users', label: 'Active users', color: 'var(--chart-4)' },
] as const

const ATTENTION_ICON: Record<AttentionItem['kind'], LucideIcon> = {
  support: LifeBuoy,
  purchase: Crown,
  campaign: BellRing,
}

const TONE_CLASS: Record<AttentionItem['tone'], string> = {
  danger: 'bg-danger-soft text-danger-soft-fg',
  warn: 'bg-warn-soft text-warn-soft-fg',
  info: 'bg-info-soft text-info-soft-fg',
}

function NeedsAttention({ data, loading }: { data?: OpsDashboardSummary; loading: boolean }) {
  const items = data?.needs_attention.items ?? []
  const counts = data?.needs_attention.counts
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Needs attention"
        description="Support waiting on Ops, purchase problems and campaigns about to send."
      />
      <div className="flex-1 px-2 pt-3 pb-2">
        {loading ? (
          <div className="space-y-3 px-3 py-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={CircleCheck} title="All clear" description="Nothing is waiting on Ops right now." className="py-8" />
        ) : (
          <ul>
            {items.map((item) => {
              const Icon = ATTENTION_ICON[item.kind]
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    to={item.to}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', TONE_CLASS[item.tone])}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{item.title}</span>
                      <span className="block truncate text-xs text-muted">{item.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-subtle">{formatRelative(item.at)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {counts ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
          <Badge tone={counts.support ? 'warn' : 'neutral'}>
            {counts.support} {counts.support === 1 ? 'ticket' : 'tickets'}
          </Badge>
          <Badge tone={counts.purchases ? 'danger' : 'neutral'}>
            {counts.purchases} {counts.purchases === 1 ? 'purchase' : 'purchases'}
          </Badge>
          <Badge tone={counts.campaigns ? 'info' : 'neutral'}>
            {counts.campaigns} {counts.campaigns === 1 ? 'campaign' : 'campaigns'}
          </Badge>
        </div>
      ) : null}
    </Card>
  )
}

function LatestInsights() {
  const report = useAnalyticsReport()
  const highlights = report.data?.insights.highlights ?? []
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Latest insights"
        description={
          report.data ? `From the analytics report generated ${formatRelative(report.data.generated_at)}.` : 'From the analytics report.'
        }
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link to="/insights/report">
              Full report
              <ArrowRight />
            </Link>
          </Button>
        }
      />
      <div className="flex-1 p-5 pt-4">
        {report.isPending ? (
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : report.isError || highlights.length === 0 ? (
          <p className="text-sm text-muted">
            No report yet. Run <code className="rounded bg-surface-3 px-1 py-0.5 text-xs">analytics_agent</code> to publish one.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {highlights.slice(0, 4).map((h) => (
              <li key={h} className="flex gap-2.5 text-sm text-fg">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {h}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function WebsiteCards() {
  const can = useCan('growth.read')
  const { range } = useDateRange()
  const website = useWebsiteSummary(range, can)
  if (!can) return null
  const totals = website.data?.totals
  const previous = range.compare ? website.data?.previous : undefined
  const hint = website.data && !website.data.configured ? 'Connect GA4 under Integrations, then sync' : undefined
  return (
    <section aria-label="Website" className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-subtle uppercase">Website</p>
        <Link to="/growth/website" className="text-xs font-semibold text-primary">
          Website report
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Website visitors"
          icon={Globe}
          value={website.isPending ? undefined : website.isError ? undefined : totals?.users ?? 0}
          previous={previous?.users}
          loading={website.isPending}
          hint={website.isError ? 'Website report unavailable' : hint}
        />
        <StatCard
          label="Get the app clicks"
          icon={MousePointerClick}
          value={website.isPending ? undefined : website.isError ? undefined : totals?.get_app_clicks ?? 0}
          previous={previous?.get_app_clicks}
          loading={website.isPending}
          hint={hint}
        />
      </div>
    </section>
  )
}

export function DashboardPage() {
  const { range } = useDateRange()
  const summary = useDashboardSummary(range)
  const refreshFlags = useRefreshInactivity()
  const data = summary.data
  const loading = summary.isPending
  const tiers = data?.snapshot.inactivity
  const platforms = data?.snapshot.platforms

  return (
    <div>
      <PageHeader
        title="Command Center"
        description={`${formatRange(range)}${range.compare ? ' · compared with the previous period' : ''} — counts only, never money.`}
        actions={
          <>
            <Button onClick={() => void summary.refetch()} loading={summary.isFetching && !loading} disabled={loading}>
              {summary.isFetching && !loading ? null : <RefreshCw />}
              Refresh
            </Button>
            <Button
              variant="primary"
              loading={refreshFlags.isPending}
              onClick={() =>
                refreshFlags.mutate(undefined, {
                  onSuccess: (result) => toast.success(`Inactivity recomputed for ${result.updated} users.`),
                  onError: () => toast.error('Could not refresh inactivity flags.'),
                })
              }
            >
              Recompute inactivity
            </Button>
          </>
        }
      />

      {summary.isError && !data ? (
        <Card>
          <EmptyState
            icon={MessageCircleWarning}
            title="Couldn't load the Command Center"
            description="The Ops API didn't respond. Check that the backend is running, then try again."
            action={
              <Button variant="primary" onClick={() => void summary.refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {KPIS.map((kpi) => (
              <StatCard
                key={kpi.label}
                label={kpi.label}
                icon={kpi.icon}
                value={data ? kpi.value(data) : undefined}
                previous={data && range.compare ? kpi.previous?.(data) : undefined}
                sparkline={data ? kpi.spark?.(data) : undefined}
                hint={kpi.hint}
                lowerIsBetter={kpi.lowerIsBetter}
                loading={loading}
              />
            ))}
          </section>

          <WebsiteCards />

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              className="xl:col-span-2"
              title="Sign-ups and activity"
              description="Per day in the selected range."
              actions={<ChartLegend items={ACTIVITY_SERIES.map((s) => ({ label: s.label, color: s.color }))} />}
              chart={
                loading ? (
                  <Skeleton className="h-[260px]" />
                ) : (
                  <TrendChart
                    label="Daily sign-ups and active users"
                    data={data?.series ?? []}
                    xKey="date"
                    series={ACTIVITY_SERIES}
                    formatX={shortDay}
                  />
                )
              }
              table={
                <MiniTable
                  columns={['Day', 'Sign-ups', 'Active users', 'Records']}
                  rows={(data?.series ?? []).map((p) => [shortDay(p.date), p.signups, p.active_users, p.records_created])}
                />
              }
            />
            <NeedsAttention data={data} loading={loading} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader title="Inactivity tiers" description="Based on the last recompute of inactivity flags." />
              <div className="p-5 pt-4">
                {tiers ? (
                  <StackedBar
                    label="Users by inactivity tier"
                    segments={[
                      { label: 'Active', value: tiers.none, color: 'var(--chart-1)' },
                      { label: 'Inactive 7d+', value: tiers['7d'], color: 'var(--chart-3)' },
                      { label: 'Inactive 30d+', value: tiers['30d'], color: 'var(--chart-4)' },
                      { label: 'Inactive 90d+', value: tiers['90d'], color: 'var(--danger-solid)' },
                      { label: 'Not yet flagged', value: tiers.unflagged, color: 'var(--border-strong)' },
                    ]}
                  />
                ) : (
                  <Skeleton className="h-40" />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Push devices by platform" description="Users with at least one registered device." />
              <div className="p-5 pt-4">
                {platforms ? (
                  <StackedBar
                    label="Users with push by platform"
                    segments={[
                      { label: 'Android', value: platforms.android, color: 'var(--chart-1)' },
                      { label: 'iOS', value: platforms.ios, color: 'var(--chart-4)' },
                      { label: 'Web', value: platforms.web, color: 'var(--chart-2)' },
                      { label: 'Other', value: platforms.other, color: 'var(--border-strong)' },
                    ]}
                  />
                ) : (
                  <Skeleton className="h-40" />
                )}
              </div>
            </Card>
            <LatestInsights />
          </div>

          {data ? <p className="text-xs text-subtle">Generated {formatDateTime(data.generated_at)}.</p> : null}
        </div>
      )}
    </div>
  )
}
