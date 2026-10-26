import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CircleAlert,
  Crown,
  FileBarChart,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import type { AnalyticsReport } from '../api'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
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
} from '../components/ui'
import { cn } from '../lib/cn'
import { formatDate, formatDateTime, formatNumber, formatRelative, shortDay } from '../lib/format'
import { useAnalyticsReport } from '../queries'

type Grain = 'daily' | 'weekly' | 'monthly'

const ACTIVITY_SERIES = [
  { key: 'transactions', label: 'Records dated', color: 'var(--chart-1)' },
  { key: 'signups', label: 'Sign-ups', color: 'var(--chart-4)' },
] as const

const PALETTE = ['var(--chart-1)', 'var(--chart-4)', 'var(--chart-2)', 'var(--chart-3)', 'var(--info)', 'var(--border-strong)']

const RECORD_LABELS: Record<string, string> = {
  users: 'Users',
  transactions: 'Transactions',
  accounts: 'Wallet accounts',
  projects: 'Projects',
  recurring_expenses: 'Recurring expenses',
  receivables: 'Receivables',
  payables: 'Payables',
  households: 'Households',
  household_expenses: 'Household expenses',
  bank_sms_imports: 'Bank SMS imports',
  category_budgets: 'Category budgets',
  support_threads: 'Support threads',
  entitlements: 'Entitlements',
}

const GROWTH_LABELS: Record<string, string> = {
  users_new: 'New users',
  signups: 'Sign-ups',
  transactions_created: 'Records created',
  transaction_activity: 'Records dated in window',
}

const BREAKDOWN_LABELS: Record<string, string> = {
  account_type: 'Account types',
  project_status: 'Project status',
  project_income_type: 'Project income type',
  payable_status: 'Payable status',
  receivable_status: 'Receivable status',
  recurring_expenses: 'Recurring expenses',
  household_membership_status: 'Household memberships',
  bank_sms_status: 'Bank SMS status',
  bank_sms_source: 'Bank SMS source',
  support_status: 'Support status',
  entitlement_product_live: 'Live premium plans',
  device_platform: 'Device platforms',
  user_type: 'User types',
}

function humanize(key: string) {
  const text = key.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status
}

function pct(value: number | null) {
  if (value === null) return 'new'
  return `${value > 0 ? '+' : ''}${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}%`
}

function DirectionBadge({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up')
    return (
      <Badge tone="success">
        <ArrowUpRight className="size-3" aria-hidden />
        Up
      </Badge>
    )
  if (direction === 'down')
    return (
      <Badge tone="danger">
        <ArrowDownRight className="size-3" aria-hidden />
        Down
      </Badge>
    )
  return (
    <Badge>
      <ArrowRight className="size-3" aria-hidden />
      Flat
    </Badge>
  )
}

function ActivityCard({ report }: { report: AnalyticsReport }) {
  const [grain, setGrain] = useState<Grain>('daily')
  const activity = report.metrics.activity
  const data =
    grain === 'daily'
      ? activity.daily.map((d) => ({ x: d.date, transactions: d.transactions, signups: d.signups }))
      : grain === 'weekly'
        ? activity.weekly.map((d) => ({ x: d.week, transactions: d.transactions, signups: d.signups }))
        : activity.monthly.map((d) => ({ x: d.month, transactions: d.transactions, signups: d.signups }))
  const formatX = grain === 'daily' ? shortDay : (v: string) => v

  return (
    <ChartCard
      className="xl:col-span-2"
      title="Activity"
      description="Records dated and sign-ups — counts only."
      actions={
        <>
          <ChartLegend items={ACTIVITY_SERIES.map((s) => ({ label: s.label, color: s.color }))} />
          <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5" role="group" aria-label="Time grain">
            {(['daily', 'weekly', 'monthly'] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={grain === g}
                onClick={() => setGrain(g)}
                className={cn(
                  'h-7 cursor-pointer rounded-md px-2 text-xs font-semibold text-muted capitalize',
                  grain === g && 'bg-surface text-fg shadow-card',
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </>
      }
      chart={
        data.length > 1 ? (
          <TrendChart label={`${grain} activity`} data={data} xKey="x" series={ACTIVITY_SERIES} formatX={formatX} />
        ) : (
          <EmptyState title="Not enough points to chart" description="Switch to the table view to see the numbers." />
        )
      }
      table={<MiniTable columns={['Period', 'Records dated', 'Sign-ups']} rows={data.map((d) => [formatX(d.x), d.transactions, d.signups])} />}
    />
  )
}

function ReportBody({ report }: { report: AnalyticsReport }) {
  const { metrics, trends, insights, status } = report
  const users = metrics.users
  const growth = Object.entries(metrics.growth)
  const directions = Object.entries(trends.direction)
  const breakdowns = Object.entries(metrics.breakdowns).filter(([, values]) => values && typeof values === 'object' && !Array.isArray(values))
  const records = Object.entries(metrics.records)

  return (
    <div className="space-y-4">
      {status.warnings.length ? (
        <Alert tone="warn" title={status.state === 'partial' ? 'Partial report' : 'Report warnings'}>
          <ul className="list-disc space-y-1 pl-4">
            {status.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden />
              Summary
            </span>
          }
          actions={<Badge tone="info">{insights.source === 'llm' ? 'AI written' : 'Rule based'}</Badge>}
        />
        <CardContent className="space-y-3">
          {insights.summary ? <p className="text-sm leading-relaxed text-fg">{insights.summary}</p> : null}
          {insights.highlights.length ? (
            <ul className="space-y-2">
              {insights.highlights.map((h) => (
                <li key={h} className="flex gap-2 text-sm text-muted">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          ) : !insights.summary ? (
            <p className="text-sm text-muted">No count-based insights in this report.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active today" value={users.active_1d} icon={Users} />
        <StatCard label="Active 7 days" value={users.active_7d} icon={Users} />
        <StatCard label="Active 30 days" value={users.active_30d} icon={Users} />
        <StatCard label="New in 7 days" value={users.new_7d} icon={UserPlus} hint={`${formatNumber(users.new_24h)} in the last 24 h`} />
        <StatCard label="Premium live" value={users.premium_live} icon={Crown} />
        <StatCard label="Users with push" value={users.users_with_push} icon={BellRing} hint={`${formatNumber(users.push_tokens)} tokens`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ActivityCard report={report} />
        <Card>
          <CardHeader title="Growth" description="This window vs the previous one." />
          <CardContent>
            {growth.length ? (
              <ul className="divide-y divide-border">
                {growth.map(([key, g]) => (
                  <li key={key} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="text-muted">{GROWTH_LABELS[key] ?? humanize(key)}</span>
                    <span className="ml-auto font-semibold text-fg tabular">{formatNumber(g.current)}</span>
                    <span className="w-14 text-right text-xs text-subtle tabular">was {formatNumber(g.previous)}</span>
                    <Badge tone={g.percent_change === null || g.percent_change > 0 ? 'success' : g.percent_change < 0 ? 'danger' : 'neutral'} className="w-16 justify-center">
                      {pct(g.percent_change)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No growth figures.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Trends and anomalies" description={trends.anomaly_rule} />
          <CardContent className="space-y-4">
            {directions.length ? (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {directions.map(([key, dir]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span className="text-muted">{GROWTH_LABELS[key] ?? humanize(key)}</span>
                    <DirectionBadge direction={dir} />
                  </div>
                ))}
              </div>
            ) : null}
            {trends.anomalies.length ? (
              <MiniTable
                columns={['Day', 'Metric', 'Value', 'Usual', 'Z-score']}
                rows={trends.anomalies.map((a) => [
                  shortDay(a.date),
                  `${GROWTH_LABELS[a.metric] ?? humanize(a.metric)} (${a.direction})`,
                  a.value,
                  Math.round(a.baseline_mean * 10) / 10,
                  a.z_score === null ? '—' : a.z_score.toFixed(1),
                ])}
              />
            ) : (
              <p className="text-sm text-muted">No unusual days in this window.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Records" description="Totals, plus new in this window vs the previous one." />
          <CardContent>
            <MiniTable
              columns={['Record', 'Total', 'New', 'Previous']}
              rows={records.map(([key, r]) => [RECORD_LABELS[key] ?? humanize(key), r.total, r.new, r.previous_new])}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader title="Support" />
          <CardContent>
            <StackedBar
              label="Support threads by state"
              segments={[
                { label: 'Waiting on Ops', value: metrics.support.waiting_ops, color: 'var(--danger-solid)' },
                { label: 'Waiting on user', value: metrics.support.waiting_user, color: 'var(--chart-3)' },
                { label: 'Open', value: metrics.support.open, color: 'var(--chart-1)' },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Onboarding" />
          <CardContent>
            <StackedBar
              label="Onboarding completion"
              segments={[
                { label: 'Complete', value: users.onboarding_complete, color: 'var(--chart-1)' },
                { label: 'Incomplete', value: users.onboarding_incomplete, color: 'var(--border-strong)' },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Households and budgets" />
          <CardContent>
            <ul className="space-y-2.5 text-sm">
              {[
                ['Households', metrics.households.total],
                ['Budgets this month', metrics.budgets.current_month],
                ['Overall caps this month', metrics.budgets.overall_caps_current_month],
              ].map(([label, value]) => (
                <li key={label} className="flex justify-between">
                  <span className="text-muted">{label}</span>
                  <span className="font-semibold text-fg tabular">{formatNumber(Number(value))}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Features in use" />
          <CardContent>
            <ul className="space-y-2.5 text-sm">
              {[
                ['Travel mode on', metrics.features.travel_mode_enabled],
                ['Bank SMS import on', metrics.features.bank_sms_settings_enabled],
                ['Suspended users', users.suspended],
              ].map(([label, value]) => (
                <li key={label} className="flex justify-between">
                  <span className="text-muted">{label}</span>
                  <span className="font-semibold text-fg tabular">{formatNumber(Number(value))}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {breakdowns.length ? (
        <section aria-labelledby="breakdowns-heading">
          <h2 id="breakdowns-heading" className="mt-2 mb-3 font-display text-lg font-bold text-fg">
            Breakdowns
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {breakdowns.map(([key, values]) => {
              const entries = Object.entries(values).filter(([, v]) => typeof v === 'number')
              return (
                <Card key={key}>
                  <CardHeader title={BREAKDOWN_LABELS[key] ?? humanize(key)} />
                  <CardContent>
                    <StackedBar
                      label={BREAKDOWN_LABELS[key] ?? humanize(key)}
                      segments={entries.map(([label, value], i) => ({
                        label: humanize(label),
                        value: value as number,
                        color: label === 'other' || label === 'unknown' || label === 'unset' ? 'var(--border-strong)' : PALETTE[i % (PALETTE.length - 1)],
                      }))}
                    />
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      ) : null}

      <p className="pt-2 text-xs text-subtle">
        Read-only, counts-only snapshot. Money totals, balances and category amounts are removed before this page receives the report. Schedule:{' '}
        <code className="font-mono">{report.schedule.cron}</code> ({report.schedule.timezone}).
      </p>
    </div>
  )
}

export function AnalyticsReportPage() {
  const report = useAnalyticsReport()
  const data = report.data
  const missing = httpStatus(report.error) === 404

  return (
    <>
      <PageHeader
        title="Analytics report"
        description={
          data
            ? `${data.period.label ? humanize(data.period.label) : `${formatDate(data.period.start)} – ${formatDate(data.period.end)}`} · generated ${formatRelative(data.generated_at)}`
            : 'The scheduled counts-only report from the analytics agent.'
        }
        actions={
          data ? (
            <div className="flex items-center gap-2">
              <Badge tone={data.status.state === 'ok' ? 'success' : 'warn'} dot>
                {data.status.state === 'ok' ? 'Complete' : 'Partial'}
              </Badge>
              <span className="hidden text-xs text-subtle sm:inline" title={formatDateTime(data.generated_at)}>
                {data.period.days}-day window
              </span>
            </div>
          ) : null
        }
      />

      {report.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : missing ? (
        <Card>
          <EmptyState
            icon={FileBarChart}
            title="No report yet"
            description="The analytics agent hasn't published a report. Once analytics.json exists (or OPS_ANALYTICS_REPORT_PATH points at one), it shows up here."
          />
        </Card>
      ) : report.isError || !data ? (
        <Card>
          <EmptyState icon={CircleAlert} title="Couldn't load the report" action={<Button onClick={() => void report.refetch()}>Try again</Button>} />
        </Card>
      ) : (
        <ReportBody report={data} />
      )}
    </>
  )
}
