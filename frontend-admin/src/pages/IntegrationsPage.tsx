import { CircleAlert, Plug, RefreshCw, Unplug } from 'lucide-react'
import { useState } from 'react'
import { connectIntegration, type IntegrationCard } from '../api'
import { useCan } from '../AuthContext'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Skeleton,
  toast,
  type BadgeTone,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { apiErrorMessage } from '../lib/queryClient'
import { useDisconnectIntegration, useIntegrations, useSyncIntegration, useUploadLinkedIn } from '../queries'

const STATUS: Record<IntegrationCard['status'], { label: string; tone: BadgeTone }> = {
  not_setup: { label: 'Not set up', tone: 'neutral' },
  connected: { label: 'Connected', tone: 'success' },
  needs_reconnect: { label: 'Needs reconnect', tone: 'warn' },
  error: { label: 'Error', tone: 'danger' },
}

export function IntegrationsPage() {
  const integrations = useIntegrations()
  const sync = useSyncIntegration()
  const disconnect = useDisconnectIntegration()
  const upload = useUploadLinkedIn()
  const canWrite = useCan('integrations.write')
  const [pending, setPending] = useState<IntegrationCard | null>(null)

  async function connect(provider: string) {
    try {
      const result = await connectIntegration(provider)
      if (result.status === 'connected' || result.status === 'needs_reconnect') {
        toast.success(`${result.label} is connected.`)
        void integrations.refetch()
      } else {
        toast.info(result.detail || 'Not set up.')
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'This provider is not set up yet.'))
    }
  }

  function onUpload(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { rows?: unknown } | unknown[]
        const rows = Array.isArray(parsed) ? parsed : parsed.rows
        if (!Array.isArray(rows)) {
          toast.error('The file needs a rows list, or a JSON array of metric, date and value.')
          return
        }
        upload.mutate(rows as { metric: string; date: string; value: number }[], {
          onSuccess: (card) => toast.success(`Saved ${card.rows_written ?? 0} LinkedIn rows.`),
          onError: (err) => toast.error(apiErrorMessage(err, 'Upload failed.')),
        })
      } catch {
        toast.error('That file is not JSON.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <PageHeader
        title="Integrations"
        description="GA4 uses a service account on the server. Social providers stay off until their app credentials are set. Tokens are never shown."
      />

      {integrations.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : integrations.isError ? (
        <Card>
          <EmptyState icon={CircleAlert} title="Couldn't load integrations" action={<Button onClick={() => void integrations.refetch()}>Try again</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(integrations.data ?? []).map((card) => {
            const status = STATUS[card.status] ?? STATUS.not_setup
            return (
              <Card key={card.provider}>
                <CardHeader
                  title={
                    <span className="inline-flex items-center gap-2">
                      <Plug className="size-4 text-primary" aria-hidden />
                      {card.label}
                    </span>
                  }
                  actions={
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  }
                />
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted">{card.display_name || 'No account connected.'}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-subtle">Last sync</dt>
                    <dd className="text-fg">{card.last_sync_at ? formatDateTime(card.last_sync_at) : 'Never'}</dd>
                    <dt className="text-subtle">Token expiry</dt>
                    <dd className="text-fg">{card.token_expires_at ? formatDateTime(card.token_expires_at) : '—'}</dd>
                  </dl>
                  {card.last_error ? <p className="text-[13px] text-warn-soft-fg">{card.last_error}</p> : null}
                  {canWrite ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="secondary" onClick={() => void connect(card.provider)}>
                        Connect
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!card.id || card.status === 'not_setup'}
                        loading={sync.isPending && sync.variables === card.id}
                        onClick={() =>
                          card.id
                            ? sync.mutate(card.id, {
                                onSuccess: () => toast.success(`${card.label} synced.`),
                                onError: (err) => toast.error(apiErrorMessage(err, 'Sync failed.')),
                              })
                            : undefined
                        }
                      >
                        <RefreshCw />
                        Sync now
                      </Button>
                      <Button variant="danger-soft" disabled={!card.id || card.status === 'not_setup'} onClick={() => setPending(card)}>
                        <Unplug />
                        Disconnect
                      </Button>
                    </div>
                  ) : null}
                  {canWrite && card.provider === 'linkedin' ? (
                    <label className="block text-[13px] font-semibold text-muted">
                      Upload a JSON export
                      <input
                        type="file"
                        accept="application/json,.json"
                        className="mt-1 block w-full text-sm font-normal text-fg file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-semibold"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) onUpload(file)
                          e.target.value = ''
                        }}
                      />
                      <span className="mt-1 block font-normal text-subtle">
                        Used until LinkedIn approves the Community Management API. Counts only — no commenter names.
                      </span>
                    </label>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={pending ? `Disconnect ${pending.label}?` : 'Disconnect?'}
        description="The stored token is deleted. Past snapshots stay."
        confirmLabel="Disconnect"
        tone="danger"
        loading={disconnect.isPending}
        onConfirm={() => {
          if (!pending?.id) return
          disconnect.mutate(pending.id, {
            onSuccess: () => {
              toast.success(`${pending.label} disconnected.`)
              setPending(null)
            },
            onError: (err) => toast.error(apiErrorMessage(err, 'Could not disconnect.')),
          })
        }}
      />
    </>
  )
}
