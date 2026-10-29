import { Globe, MousePointerClick, Radio, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Alert,
  Card,
  CardHeader,
  ChartCard,
  ChartLegend,
  EmptyState,
  MiniTable,
  PageHeader,
  Skeleton,
  StatCard,
  TrendChart,
} from '../components/ui'
import { formatRange, useDateRange } from '../lib/dateRange'
import { formatDateTime, shortDay } from '../lib/format'
import { useWebsiteRealtime, useWebsiteSummary } from '../queries'

const SERIES = [
  { key: 'users', label: 'Visitors', color: 'var(--chart-1)' },
  { key: 'get_app_clicks', label: 'Get the app', color: 'var(--chart-4)' },
] as const

const EVENT_LABELS: Record<string, string> = {
  get_app_click: 'Get the app',
  use_case_tab: 'Use-case tab',
  faq_open: 'FAQ opened',
  support_click: 'Support',
}

function formatRate(value: number) {
  const pct = value <= 1 ? value * 100 : value
  return `${pct.toFixed(1)}%`
}

function formatDuration(seconds: number) {
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}m ${String(total % 60).padStart(2, '0')}s`
}

export function WebsitePage() {
  const { range } = useDateRange()
  const report = useWebsiteSummary(range)
  const realtime = useWebsiteRealtime()
  const data = report.data
  const loading = report.isPending
  const totals = data?.totals
  const previous = range.compare ? data?.previous : undefined
  const quiet =
    !!data &&
    !data.configured &&
    data.totals.users === 0 &&
    data.totals.sessions === 0 &&
    data.events.every((event) => event.value === 0)

  return (
    <div>
      <PageHeader
        title="Website"
        description={`${formatRange(range)} — visit counts from GA4. No money, balances, or transaction rows.`}
      />

      {data?.last_error ? (
        <Alert tone="warn" title="Last sync" className="mb-4">
          {data.last_error}
        </Alert>
      ) : null}

      {report.isError ? (
        <Card>
          <EmptyState icon={Globe} title="Couldn't load the website report" description="The Ops API didn't respond." />
        </Card>
      ) : quiet ? (
        <Card>
          <EmptyState
            icon={Globe}
            title="Google Analytics is not connected"
            description="Set GA4_PROPERTY_ID (the numeric property id) and GA4_SERVICE_ACCOUNT_JSON on the server, give that account Viewer access, then connect and sync under Integrations. The website tag uses VITE_GA_MEASUREMENT_ID, which looks like G-XXXX."
            action={
              <Link to="/system/integrations" className="text-sm font-semibold text-primary">
                Open Integrations
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <section aria-label="Website metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Visitors"
              icon={Users}
              value={loading ? undefined : totals?.users}
              previous={previous?.users}
              loading={loading}
              hint="People who opened the site"
            />
            <StatCard
              label="Get the app clicks"
              icon={MousePointerClick}
              value={loading ? undefined : totals?.get_app_clicks}
              previous={previous?.get_app_clicks}
              loading={loading}
            />
            <StatCard
              label="Sessions"
              icon={Globe}
              value={loading ? undefined : totals?.sessions}
              previous={previous?.sessions}
              loading={loading}
              hint={totals ? `${formatRate(totals.engagement_rate)} engaged · ${formatDuration(totals.avg_engagement_seconds)} avg` : undefined}
            />
            <StatCard
              label="On the site now"
              icon={Radio}
              value={realtime.isPending ? undefined : realtime.data?.active_users ?? undefined}
              loading={realtime.isPending}
              hint={
                realtime.data?.detail
                  ? realtime.data.detail
                  : data?.last_sync_at
                    ? `Last sync ${formatDateTime(data.last_sync_at)}`
                    : 'Realtime, cached for 15 minutes'
              }
            />
          </section>

          <ChartCard
            title="Visitors and Get the app"
            description="Per day in the selected range."
            actions={<ChartLegend items={SERIES.map((item) => ({ label: item.label, color: item.color }))} />}
            chart={
              loading ? (
                <Skeleton className="h-[260px]" />
              ) : (
                <TrendChart
                  label="Daily website visitors and Get the app clicks"
                  data={data?.series ?? []}
                  xKey="date"
                  series={SERIES}
                  formatX={shortDay}
                />
              )
            }
            table={
              <MiniTable
                columns={['Day', 'Visitors', 'Sessions', 'Get the app']}
                rows={(data?.series ?? []).map((point) => [shortDay(point.date), point.users, point.sessions, point.get_app_clicks])}
              />
            }
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Top pages" description="Page views in this range." />
              <div className="px-5 pb-4">
                {(data?.pages.length ?? 0) === 0 ? (
                  <p className="py-6 text-sm text-muted">No page counts in this range.</p>
                ) : (
                  <MiniTable columns={['Page', 'Views']} rows={(data?.pages ?? []).map((row) => [row.label, row.value])} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Where visits came from" description="Sessions by source and medium." />
              <div className="px-5 pb-4">
                {(data?.sources.length ?? 0) === 0 ? (
                  <p className="py-6 text-sm text-muted">No source counts in this range.</p>
                ) : (
                  <MiniTable columns={['Source', 'Sessions']} rows={(data?.sources ?? []).map((row) => [row.label, row.value])} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Countries" />
              <div className="px-5 pb-4">
                {(data?.countries.length ?? 0) === 0 ? (
                  <p className="py-6 text-sm text-muted">No country counts in this range.</p>
                ) : (
                  <MiniTable columns={['Country', 'Visitors']} rows={(data?.countries ?? []).map((row) => [row.label, row.value])} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Devices and site events" />
              <div className="space-y-4 px-5 pb-4">
                <MiniTable columns={['Device', 'Visitors']} rows={(data?.devices ?? []).map((row) => [row.label, row.value])} />
                <MiniTable
                  columns={['Event', 'Count']}
                  rows={(data?.events ?? []).map((row) => [EVENT_LABELS[row.label] ?? row.label, row.value])}
                />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
