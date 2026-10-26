import { createColumnHelper } from '@tanstack/react-table'
import { Bell, Crown, Plus, Search, Trash2, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DateRangePicker,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '../components/ui'
import { useDateRange } from '../lib/dateRange'

function Block({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="mb-5">
      <CardHeader title={title} description={description} />
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const TOKENS: { name: string; bg: string; fg?: string }[] = [
  { name: 'bg', bg: 'var(--bg)' },
  { name: 'surface', bg: 'var(--surface)' },
  { name: 'surface-2', bg: 'var(--surface-2)' },
  { name: 'primary-solid', bg: 'var(--primary-solid)', fg: 'var(--on-primary)' },
  { name: 'primary-soft', bg: 'var(--primary-soft)', fg: 'var(--primary-soft-fg)' },
  { name: 'danger-soft', bg: 'var(--danger-soft)', fg: 'var(--danger-soft-fg)' },
  { name: 'warn-soft', bg: 'var(--warn-soft)', fg: 'var(--warn-soft-fg)' },
  { name: 'info-soft', bg: 'var(--info-soft)', fg: 'var(--info-soft-fg)' },
  { name: 'sidebar', bg: 'var(--sidebar)', fg: 'var(--sidebar-fg)' },
]

type SampleRow = { id: number; name: string; plan: 'Premium' | 'Free'; status: 'active' | 'inactive' | 'suspended'; wallets: number }

const SAMPLE_ROWS: SampleRow[] = [
  { id: 1, name: 'sample_ayesha', plan: 'Premium', status: 'active', wallets: 4 },
  { id: 2, name: 'sample_bilal', plan: 'Free', status: 'inactive', wallets: 2 },
  { id: 3, name: 'sample_fatima', plan: 'Free', status: 'active', wallets: 3 },
  { id: 4, name: 'sample_hamza', plan: 'Premium', status: 'suspended', wallets: 1 },
]

const column = createColumnHelper<SampleRow>()
const SAMPLE_COLUMNS = [
  column.accessor('name', { header: 'User', cell: (info) => <span className="font-semibold">{info.getValue()}</span> }),
  column.accessor('plan', {
    header: 'Plan',
    cell: (info) => <Badge tone={info.getValue() === 'Premium' ? 'success' : 'neutral'}>{info.getValue()}</Badge>,
  }),
  column.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const value = info.getValue()
      return (
        <Badge dot tone={value === 'active' ? 'success' : value === 'inactive' ? 'warn' : 'danger'}>
          {value}
        </Badge>
      )
    },
  }),
  column.accessor('wallets', { header: 'Wallets', cell: (info) => <span className="tabular">{info.getValue()}</span> }),
]

export default function UiKitPage() {
  const { range, setRange } = useDateRange()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [switchOn, setSwitchOn] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)
  const [page, setPage] = useState(1)

  return (
    <div>
      <PageHeader
        title="UI kit"
        description="The WalletTrails Ops design system. Values on this page are samples, not live data."
        actions={
          <>
            <Button>
              <Search />
              Secondary
            </Button>
            <Button variant="primary">
              <Plus />
              Primary action
            </Button>
          </>
        }
      />

      <Block title="Colour tokens" description="Switch the theme from the top bar to see both palettes.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TOKENS.map((token) => (
            <div key={token.name} className="overflow-hidden rounded-xl border border-border">
              <div className="flex h-16 items-end p-2.5 text-sm font-semibold" style={{ background: token.bg, color: token.fg ?? 'var(--text)' }}>
                Aa
              </div>
              <div className="bg-surface px-2.5 py-1.5 font-mono text-xs text-muted">{token.name}</div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Typography">
        <div className="space-y-2">
          <p className="font-display text-[34px] leading-tight font-bold">Outfit display — 34 / bold</p>
          <p className="font-display text-[26px] font-bold">Page title — 26 / bold</p>
          <p className="text-base font-semibold">Card title — DM Sans 16 / semibold</p>
          <p className="text-sm">Body — DM Sans 14 / regular. Tabular numbers: <span className="tabular">1,234,567.89</span></p>
          <p className="text-[13px] text-muted">Muted — 13, for descriptions and helper text.</p>
          <p className="text-xs text-subtle">Subtle — 12, for timestamps and footnotes.</p>
        </div>
      </Block>

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">
            <Trash2 />
            Danger
          </Button>
          <Button variant="danger-soft">Danger soft</Button>
          <Button variant="primary" loading>
            Saving…
          </Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg" variant="primary">
            Large
          </Button>
          <Button size="icon" aria-label="Notifications">
            <Bell />
          </Button>
        </div>
      </Block>

      <Block title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="success" dot>
            Active
          </Badge>
          <Badge tone="warn" dot>
            Inactive 7d
          </Badge>
          <Badge tone="danger" dot>
            Suspended
          </Badge>
          <Badge tone="info">Scheduled</Badge>
        </div>
      </Block>

      <Block title="Form controls">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Campaign title" hint="Shown as the notification heading.">
            <Input placeholder="WalletTrails update" />
          </Field>
          <Field label="Audience">
            <Select defaultValue="all">
              <option value="all">All opted-in users</option>
              <option value="android">Android only</option>
              <option value="inactive_7d">Inactive 7d+</option>
            </Select>
          </Field>
          <Field label="Promo code" error="This code already exists.">
            <Input defaultValue="PREMIUM30" />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Premium users never see ads</p>
              <p className="text-[13px] text-muted">Switch component</p>
            </div>
            <Switch label="Premium hides ads" checked={switchOn} onCheckedChange={setSwitchOn} />
          </div>
          <Field label="Message" className="md:col-span-2">
            <Textarea placeholder="Write a reply…" />
          </Field>
        </div>
      </Block>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sample: new users" value={128} previous={96} icon={Users} sparkline={[4, 6, 5, 9, 8, 12, 11, 14]} />
        <StatCard label="Sample: premium live" value={42} previous={45} icon={Crown} sparkline={[48, 47, 47, 46, 45, 44, 43, 42]} />
        <StatCard label="Sample: inactive 30d" value={37} previous={52} lowerIsBetter icon={Users} hint="Lower is better" />
        <StatCard label="Loading state" value={null} loading />
      </div>

      <Block title="Data table" description="Sorting, row states, empty state and server-side paging.">
        <div className="mb-3 flex gap-2">
          <Button size="sm" onClick={() => setTableLoading((v) => !v)}>
            Toggle loading
          </Button>
        </div>
        <DataTable
          caption="Sample users"
          columns={SAMPLE_COLUMNS}
          data={tableLoading ? [] : SAMPLE_ROWS}
          loading={tableLoading}
          getRowId={(row) => String(row.id)}
          onRowClick={(row) => toast(`Clicked ${row.name}`)}
          pagination={{ page, pageSize: 4, total: 12, onPageChange: setPage }}
        />
      </Block>

      <Block title="Tabs">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="text-sm text-muted">Overview tab content.</TabsContent>
          <TabsContent value="devices" className="text-sm text-muted">Devices tab content.</TabsContent>
          <TabsContent value="audit" className="text-sm text-muted">Audit tab content.</TabsContent>
        </Tabs>
      </Block>

      <Block title="Overlays & feedback">
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Open dialog</Button>
            </DialogTrigger>
            <DialogContent
              title="Grant premium"
              description="Give a user premium access manually."
              footer={
                <>
                  <DialogClose asChild>
                    <Button>Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="primary" onClick={() => toast.success('Sample: premium granted')}>
                      Grant
                    </Button>
                  </DialogClose>
                </>
              }
            >
              <Field label="Username">
                <Input placeholder="username" />
              </Field>
            </DialogContent>
          </Dialog>

          <Button variant="danger-soft" onClick={() => setConfirmOpen(true)}>
            Confirm dialog
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete campaign #12?"
            description="This removes it and its delivery records permanently."
            confirmLabel="Delete"
            tone="danger"
            onConfirm={() => {
              setConfirmOpen(false)
              toast.success('Sample: campaign deleted')
            }}
          />

          <Drawer>
            <DrawerTrigger asChild>
              <Button>Open drawer</Button>
            </DrawerTrigger>
            <DrawerContent title="User preview" description="Side panel for quick details." footer={<Button variant="primary">Open full profile</Button>}>
              <div className="space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-24 w-full" />
              </div>
            </DrawerContent>
          </Drawer>

          <Button onClick={() => toast.success('Saved. Apps pick this up on next config fetch.')}>Success toast</Button>
          <Button onClick={() => toast.error('Send failed.')}>Error toast</Button>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </Block>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Empty state" />
          <EmptyState
            title="No tickets need a reply"
            description="New support messages from the app will show up here."
            action={<Button size="sm">View all tickets</Button>}
          />
        </Card>
        <Card>
          <CardHeader title="Skeletons" description="Used while data loads." />
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </CardContent>
          <CardFooter>
            <span>Card footer</span>
            <Button size="sm" variant="ghost">
              Action
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
