import { CircleAlert, OctagonX, RotateCcw, Save } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { OpsRemoteConfig } from '../api'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Switch,
  Textarea,
  toast,
} from '../components/ui'
import { cn } from '../lib/cn'
import { formatDateTime } from '../lib/format'
import { apiErrorMessage } from '../lib/queryClient'
import { useOpsConfig, usePatchOpsConfig } from '../queries'

type Form = {
  ads_enabled: boolean
  banner_enabled: boolean
  interstitial_enabled: boolean
  rewarded_enabled: boolean
  premium_hides_ads: boolean
  android_banner_unit: string
  android_interstitial_unit: string
  android_rewarded_unit: string
  show_after_sessions: string
  interstitial_min_interval_sec: string
  countries: string
  test_device_ids: string
  min_supported_version: string
  store_url: string
  maintenance_message: string
  support_whatsapp: string
  feature_flags: string
}

const LABELS: Record<keyof Form, string> = {
  ads_enabled: 'Ads master switch',
  banner_enabled: 'Banner ads',
  interstitial_enabled: 'Interstitial ads',
  rewarded_enabled: 'Rewarded ads',
  premium_hides_ads: 'Premium hides ads',
  android_banner_unit: 'Banner unit ID',
  android_interstitial_unit: 'Interstitial unit ID',
  android_rewarded_unit: 'Rewarded unit ID',
  show_after_sessions: 'Show after N sessions',
  interstitial_min_interval_sec: 'Interstitial min interval',
  countries: 'Countries',
  test_device_ids: 'Test device IDs',
  min_supported_version: 'Min supported version',
  store_url: 'Store URL',
  maintenance_message: 'Maintenance message',
  support_whatsapp: 'WhatsApp support',
  feature_flags: 'Feature flags',
}

function fromConfig(cfg: OpsRemoteConfig): Form {
  const r = cfg.raw
  return {
    ads_enabled: r.ads_enabled,
    banner_enabled: r.banner_enabled,
    interstitial_enabled: r.interstitial_enabled,
    rewarded_enabled: r.rewarded_enabled,
    premium_hides_ads: r.premium_hides_ads,
    android_banner_unit: r.android_banner_unit || '',
    android_interstitial_unit: r.android_interstitial_unit || '',
    android_rewarded_unit: r.android_rewarded_unit || '',
    show_after_sessions: String(r.show_after_sessions ?? 3),
    interstitial_min_interval_sec: String(r.interstitial_min_interval_sec ?? 180),
    countries: (r.countries || []).join(','),
    test_device_ids: (r.test_device_ids || []).join(','),
    min_supported_version: r.min_supported_version || '',
    store_url: r.store_url || '',
    maintenance_message: r.maintenance_message || '',
    support_whatsapp: r.support_whatsapp || '',
    feature_flags: JSON.stringify(r.feature_flags || {}, null, 2),
  }
}

function normalize(key: keyof Form, value: Form[keyof Form]): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (key === 'feature_flags') {
    try {
      return JSON.stringify(JSON.parse(value || '{}'))
    } catch {
      return value
    }
  }
  if (key === 'countries' || key === 'test_device_ids') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ')
  }
  return value.trim()
}

function parseFlags(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text || '{}') as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function ToggleRow({ label, hint, checked, onChange, changed }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; changed: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          {label}
          {changed ? <Badge tone="warn">Changed</Badge> : null}
        </div>
        {hint ? <div className="text-xs text-muted">{hint}</div> : null}
      </div>
      <Switch label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function AdsConfigPage() {
  const configQuery = useOpsConfig()
  const patch = usePatchOpsConfig()
  const cfg = configQuery.data
  const [form, setForm] = useState<Form | null>(null)
  const [saved, setSaved] = useState<Form | null>(null)
  const [version, setVersion] = useState<string | null | undefined>(undefined)
  const [reviewing, setReviewing] = useState(false)
  const [killing, setKilling] = useState(false)

  useEffect(() => {
    if (cfg && cfg.updated_at !== version) {
      const next = fromConfig(cfg)
      setForm(next)
      setSaved(next)
      setVersion(cfg.updated_at)
    }
  }, [cfg, version])

  const changes = useMemo(() => {
    if (!form || !saved) return []
    return (Object.keys(LABELS) as (keyof Form)[])
      .filter((key) => normalize(key, form[key]) !== normalize(key, saved[key]))
      .map((key) => ({ key, label: LABELS[key], from: normalize(key, saved[key]), to: normalize(key, form[key]) }))
  }, [form, saved])
  const changedKeys = new Set(changes.map((c) => c.key))
  const flagsInvalid = form ? parseFlags(form.feature_flags) === null : false

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function onSaved(data: OpsRemoteConfig, message: string) {
    const next = fromConfig(data)
    setForm(next)
    setSaved(next)
    setVersion(data.updated_at)
    toast.success(message)
  }

  function save() {
    if (!form) return
    const feature_flags = parseFlags(form.feature_flags)
    if (!feature_flags) {
      toast.error('Feature flags must be a JSON object.')
      return
    }
    patch.mutate(
      {
        ads_enabled: form.ads_enabled,
        banner_enabled: form.banner_enabled,
        interstitial_enabled: form.interstitial_enabled,
        rewarded_enabled: form.rewarded_enabled,
        premium_hides_ads: form.premium_hides_ads,
        android_banner_unit: form.android_banner_unit.trim(),
        android_interstitial_unit: form.android_interstitial_unit.trim(),
        android_rewarded_unit: form.android_rewarded_unit.trim(),
        show_after_sessions: Number(form.show_after_sessions) || 0,
        interstitial_min_interval_sec: Number(form.interstitial_min_interval_sec) || 0,
        countries: form.countries,
        test_device_ids: form.test_device_ids,
        min_supported_version: form.min_supported_version.trim(),
        store_url: form.store_url.trim(),
        maintenance_message: form.maintenance_message.trim(),
        support_whatsapp: form.support_whatsapp.trim(),
        feature_flags,
      },
      {
        onSuccess: (data) => {
          setReviewing(false)
          onSaved(data, 'Saved. Apps pick this up on their next config fetch.')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Save failed.')),
      },
    )
  }

  function killAds() {
    patch.mutate(
      { ads_enabled: false },
      {
        onSuccess: (data) => {
          setKilling(false)
          onSaved(data, 'Kill switch on — ads are disabled for everyone.')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Kill switch failed.')),
      },
    )
  }

  if (configQuery.isError && !cfg) {
    return (
      <>
        <PageHeader title="Ads & Config" />
        <Card>
          <EmptyState icon={CircleAlert} title="Couldn't load remote config" action={<Button onClick={() => void configQuery.refetch()}>Try again</Button>} />
        </Card>
      </>
    )
  }

  return (
    <div className="pb-24">
      <PageHeader
        title="Ads & Config"
        description="Remote AdMob controls, app gate and feature flags — apps read this on launch."
        actions={
          <Button variant="danger" disabled={!cfg || !form?.ads_enabled} onClick={() => setKilling(true)}>
            <OctagonX />
            Kill all ads
          </Button>
        }
      />

      {!form || !cfg ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            Ads right now:
            {cfg.ads.effective_show_ads ? <Badge tone="success" dot>Showing</Badge> : <Badge tone="danger" dot>Off</Badge>}
            {cfg.updated_at ? (
              <span className="text-xs text-subtle">
                · last saved {formatDateTime(cfg.updated_at)}
                {cfg.raw.updated_by_username ? ` by @${cfg.raw.updated_by_username}` : ''}
              </span>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Ad toggles" description="The master switch overrides everything below it.">
              <div className="divide-y divide-border">
                <ToggleRow label={LABELS.ads_enabled} checked={form.ads_enabled} onChange={(v) => set('ads_enabled', v)} changed={changedKeys.has('ads_enabled')} />
                <ToggleRow label={LABELS.banner_enabled} checked={form.banner_enabled} onChange={(v) => set('banner_enabled', v)} changed={changedKeys.has('banner_enabled')} />
                <ToggleRow
                  label={LABELS.interstitial_enabled}
                  checked={form.interstitial_enabled}
                  onChange={(v) => set('interstitial_enabled', v)}
                  changed={changedKeys.has('interstitial_enabled')}
                />
                <ToggleRow label={LABELS.rewarded_enabled} checked={form.rewarded_enabled} onChange={(v) => set('rewarded_enabled', v)} changed={changedKeys.has('rewarded_enabled')} />
                <ToggleRow
                  label="Premium users never see ads"
                  checked={form.premium_hides_ads}
                  onChange={(v) => set('premium_hides_ads', v)}
                  changed={changedKeys.has('premium_hides_ads')}
                />
              </div>
            </Section>

            <Section title="Android unit IDs" description="Leave blank to use Google's sample test units.">
              <div className="space-y-4">
                {(['android_banner_unit', 'android_interstitial_unit', 'android_rewarded_unit'] as const).map((key) => (
                  <Field key={key} label={LABELS[key]}>
                    <Input className={cn('font-mono text-[13px]', changedKeys.has(key) && 'border-warn')} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder="ca-app-pub-…/…" />
                  </Field>
                ))}
              </div>
            </Section>

            <Section title="Rules">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={LABELS.show_after_sessions}>
                  <Input type="number" min={0} className={cn(changedKeys.has('show_after_sessions') && 'border-warn')} value={form.show_after_sessions} onChange={(e) => set('show_after_sessions', e.target.value)} />
                </Field>
                <Field label="Interstitial min interval (seconds)">
                  <Input
                    type="number"
                    min={0}
                    className={cn(changedKeys.has('interstitial_min_interval_sec') && 'border-warn')}
                    value={form.interstitial_min_interval_sec}
                    onChange={(e) => set('interstitial_min_interval_sec', e.target.value)}
                  />
                </Field>
                <Field label={LABELS.countries} hint="Comma separated, e.g. PK">
                  <Input className={cn(changedKeys.has('countries') && 'border-warn')} value={form.countries} onChange={(e) => set('countries', e.target.value)} />
                </Field>
                <Field label={LABELS.test_device_ids} hint="Comma separated">
                  <Input className={cn(changedKeys.has('test_device_ids') && 'border-warn')} value={form.test_device_ids} onChange={(e) => set('test_device_ids', e.target.value)} />
                </Field>
              </div>
            </Section>

            <Section title="App gate and support">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={LABELS.min_supported_version}>
                  <Input className={cn(changedKeys.has('min_supported_version') && 'border-warn')} value={form.min_supported_version} onChange={(e) => set('min_supported_version', e.target.value)} placeholder="1.0.0" />
                </Field>
                <Field label="WhatsApp support" hint="Digits or a wa.me link">
                  <Input className={cn(changedKeys.has('support_whatsapp') && 'border-warn')} value={form.support_whatsapp} onChange={(e) => set('support_whatsapp', e.target.value)} placeholder="923001234567" />
                </Field>
                <Field label={LABELS.store_url} className="sm:col-span-2">
                  <Input className={cn(changedKeys.has('store_url') && 'border-warn')} value={form.store_url} onChange={(e) => set('store_url', e.target.value)} placeholder="https://play.google.com/…" />
                </Field>
                <Field label={LABELS.maintenance_message} hint="Shown in the app when set." className="sm:col-span-2">
                  <Input className={cn(changedKeys.has('maintenance_message') && 'border-warn')} value={form.maintenance_message} onChange={(e) => set('maintenance_message', e.target.value)} />
                </Field>
              </div>
            </Section>

            <Section title="Feature flags" description="A JSON object the apps read as-is.">
              <Field label="Flags (JSON)" error={flagsInvalid ? 'Must be a valid JSON object.' : undefined}>
                <Textarea rows={8} className="font-mono text-[13px]" value={form.feature_flags} onChange={(e) => set('feature_flags', e.target.value)} spellCheck={false} />
              </Field>
            </Section>
          </div>

          {changes.length > 0 ? (
            <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:pl-[264px]">
              <div className="flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-pop animate-pop-in">
                <span className="text-sm font-semibold text-fg">
                  {changes.length} unsaved {changes.length === 1 ? 'change' : 'changes'}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" onClick={() => setForm(saved)}>
                    <RotateCcw />
                    Discard
                  </Button>
                  <Button variant="primary" disabled={flagsInvalid} onClick={() => setReviewing(true)}>
                    <Save />
                    Review and save
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={reviewing}
        onOpenChange={setReviewing}
        title="Save remote config?"
        description="Every app picks these up on its next config fetch."
        confirmLabel="Save changes"
        loading={patch.isPending}
        onConfirm={save}
      >
        <ul className="divide-y divide-border rounded-xl border border-border">
          {changes.map((c) => (
            <li key={c.key} className="px-3 py-2.5">
              <div className="text-xs font-semibold text-muted">{c.label}</div>
              <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-[13px]">
                <span className="break-all text-subtle line-through">{c.from || 'empty'}</span>
                <span className="text-subtle" aria-label="changes to">
                  →
                </span>
                <span className="font-semibold break-all text-fg">{c.to || 'empty'}</span>
              </div>
            </li>
          ))}
        </ul>
        {changedKeys.has('ads_enabled') && !form?.ads_enabled ? (
          <Alert tone="warn" className="mt-3">
            This turns off all ads for every user.
          </Alert>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={killing}
        onOpenChange={setKilling}
        title="Disable all ads now?"
        description="Sets the ads master switch off for every user, right away. Other unsaved edits are discarded."
        confirmLabel="Kill all ads"
        tone="danger"
        loading={patch.isPending}
        onConfirm={killAds}
      />
    </div>
  )
}
