import { useState } from 'react'
import { Copy, Link2 } from 'lucide-react'
import { Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Skeleton, toast } from '../components/ui'
import { useCan } from '../AuthContext'
import { apiErrorMessage } from '../lib/queryClient'
import { formatDateTime } from '../lib/format'
import { useCreateTrackedLink, useTrackedLinks } from '../queries'

const EMPTY = {
  label: '',
  destination: 'https://wallettrails.com/#download',
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  utm_content: '',
}

export function LinksPage() {
  const links = useTrackedLinks()
  const create = useCreateTrackedLink()
  const canWrite = useCan('growth.write')
  const [form, setForm] = useState(EMPTY)

  function set(key: keyof typeof EMPTY, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied.')
    } catch {
      toast.error('Could not copy that link.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Campaign links"
        description="Build a tagged URL. GA4 shows which of these brought visitors after the next sync."
      />
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader title="New link" description={canWrite ? 'Marketing, admins, and owners can save links.' : 'You can read links. Saving needs a marketing role.'} />
          <form
            className="space-y-3 px-5 pb-5"
            onSubmit={(event) => {
              event.preventDefault()
              create.mutate(form, {
                onSuccess: (row) => {
                  toast.success('Link saved.')
                  void copy(row.url)
                  setForm(EMPTY)
                },
                onError: (err) => toast.error(apiErrorMessage(err, 'Could not save that link.')),
              })
            }}
          >
            <Field label="Label">
              <Input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Instagram bio" required disabled={!canWrite} />
            </Field>
            <Field label="Destination">
              <Input value={form.destination} onChange={(e) => set('destination', e.target.value)} required disabled={!canWrite} />
            </Field>
            <Field label="Source">
              <Input value={form.utm_source} onChange={(e) => set('utm_source', e.target.value)} placeholder="instagram" disabled={!canWrite} />
            </Field>
            <Field label="Medium">
              <Input value={form.utm_medium} onChange={(e) => set('utm_medium', e.target.value)} placeholder="bio" disabled={!canWrite} />
            </Field>
            <Field label="Campaign">
              <Input value={form.utm_campaign} onChange={(e) => set('utm_campaign', e.target.value)} placeholder="launch" disabled={!canWrite} />
            </Field>
            <Field label="Content">
              <Input value={form.utm_content} onChange={(e) => set('utm_content', e.target.value)} placeholder="optional" disabled={!canWrite} />
            </Field>
            <Button type="submit" variant="primary" loading={create.isPending} disabled={!canWrite}>
              Save link
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Saved links" />
          <div className="px-5 pb-5">
            {links.isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : links.isError ? (
              <EmptyState icon={Link2} title="Couldn't load links" action={<Button onClick={() => void links.refetch()}>Try again</Button>} />
            ) : (links.data ?? []).length === 0 ? (
              <EmptyState icon={Link2} title="No links yet" description="Save one and paste it into a post, story, or bio." className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {(links.data ?? []).map((link) => (
                  <li key={link.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">{link.label}</p>
                      <p className="truncate text-[13px] text-muted">{link.url}</p>
                      <p className="mt-1 text-xs text-subtle">{formatDateTime(link.created_at)}</p>
                    </div>
                    <Button variant="secondary" onClick={() => void copy(link.url)} aria-label={`Copy ${link.label}`}>
                      <Copy />
                      Copy
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
