import { ArrowLeft, CircleCheck, Inbox, LifeBuoy, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { SupportThread } from '../api'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SearchInput,
  Skeleton,
  Textarea,
  toast,
} from '../components/ui'
import { cn } from '../lib/cn'
import { formatDateTime, formatRelative } from '../lib/format'
import { apiErrorMessage } from '../lib/queryClient'
import { SUPPORT_CATEGORIES, supportStatus } from '../lib/status'
import { useReplySupport, useSetSupportStatus, useSupportThread, useSupportThreads } from '../queries'

const FILTERS = [
  ['waiting_ops', 'Needs reply'],
  ['waiting_user', 'Waiting on user'],
  ['open', 'Open'],
  ['closed', 'Closed'],
  ['', 'All'],
] as const

const STATUS_ACTIONS = [
  ['waiting_ops', 'Needs reply'],
  ['waiting_user', 'Waiting on user'],
  ['closed', 'Closed'],
] as const

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
}

function ThreadRow({ thread, active }: { thread: SupportThread; active: boolean }) {
  const s = supportStatus(thread.status)
  return (
    <Link
      to={`/support/${thread.id}${window.location.search}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'block border-l-2 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
        active ? 'border-primary bg-primary-soft/60' : 'border-transparent',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{thread.subject}</span>
        <span className="shrink-0 text-xs text-subtle">{formatRelative(thread.updated_at)}</span>
      </div>
      <div className="mt-0.5 truncate text-xs text-muted">
        @{thread.username} · {thread.last_message_preview || 'No messages'}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone={s.tone}>{s.label}</Badge>
        {thread.priority === 'high' ? <Badge tone="danger">High priority</Badge> : null}
        <Badge>{SUPPORT_CATEGORIES[thread.category] ?? thread.category}</Badge>
      </div>
    </Link>
  )
}

function ThreadView({ threadId }: { threadId: number }) {
  const query = useSupportThread(threadId)
  const reply = useReplySupport()
  const setStatus = useSetSupportStatus()
  const thread = query.data
  const [body, setBody] = useState('')
  const replyRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const busy = reply.isPending || setStatus.isPending

  useEffect(() => {
    setBody('')
  }, [threadId])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [thread?.messages?.length, threadId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !isTyping(e.target)) {
        e.preventDefault()
        replyRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function send(close: boolean) {
    const text = body.trim()
    if (!text || busy) return
    reply.mutate(
      { id: threadId, body: text, close },
      {
        onSuccess: () => {
          setBody('')
          toast.success(close ? 'Replied and closed. The user gets a push.' : 'Reply sent. The user gets a push.')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Reply failed.')),
      },
    )
  }

  if (query.isError) return <EmptyState icon={LifeBuoy} title="Ticket not found" className="h-full justify-center" />
  if (!thread) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-20 w-3/4" />
        <Skeleton className="ml-auto h-16 w-2/3" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-fg">
              #{thread.id} {thread.subject}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              <Link to={`/users/${thread.user_id}`} className="font-semibold hover:text-primary">
                @{thread.username}
              </Link>{' '}
              · {thread.email || 'no email'} · {SUPPORT_CATEGORIES[thread.category] ?? thread.category}
              {thread.priority === 'high' ? ' · high priority' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Ticket status">
            {STATUS_ACTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={busy || thread.status === value}
                aria-pressed={thread.status === value}
                onClick={() =>
                  setStatus.mutate(
                    { id: thread.id, status: value },
                    {
                      onSuccess: () => toast.success(`Marked “${label}”.`),
                      onError: (err) => toast.error(apiErrorMessage(err, 'Could not change status.')),
                    },
                  )
                }
                className={cn(
                  'h-7 cursor-pointer rounded-full border px-2.5 text-xs font-semibold transition-colors disabled:cursor-default',
                  thread.status === value
                    ? 'border-primary bg-primary-soft text-primary-soft-fg'
                    : 'border-border text-muted hover:border-border-strong hover:text-fg',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-bg/50 px-5 py-5">
        {(thread.messages ?? []).map((m) => {
          const staff = m.sender === 'staff'
          return (
            <div key={m.id} className={cn('flex gap-2.5', staff && 'flex-row-reverse')}>
              <Avatar name={staff ? (m.author_username ?? 'Staff') : (thread.username ?? 'User')} />
              <div className={cn('max-w-[min(560px,85%)]', staff && 'text-right')}>
                <div
                  className={cn(
                    'rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed whitespace-pre-wrap',
                    staff ? 'rounded-tr-md bg-primary-solid text-on-primary' : 'rounded-tl-md border border-border bg-surface text-fg',
                  )}
                >
                  {m.body}
                </div>
                <div className="mt-1 px-1 text-xs text-subtle">
                  {staff ? `Staff${m.author_username ? ` · @${m.author_username}` : ''}` : 'User'} · {formatDateTime(m.created_at)}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {thread.status === 'closed' ? (
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted">
          <span className="inline-flex items-center gap-2">
            <CircleCheck className="size-4 text-primary" aria-hidden />
            Closed {formatRelative(thread.closed_at)}.
          </span>
          <span className="text-xs">Reopen with a status above.</span>
        </div>
      ) : (
        <form
          className="border-t border-border p-4"
          onSubmit={(e) => {
            e.preventDefault()
            send(false)
          }}
        >
          <label htmlFor="support-reply" className="sr-only">
            Your reply
          </label>
          <Textarea
            id="support-reply"
            ref={replyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                send(e.shiftKey)
              }
            }}
            maxLength={4000}
            rows={3}
            placeholder="Write a reply…"
            disabled={busy}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="hidden text-xs text-subtle sm:inline">
              <kbd className="font-sans">R</kbd> to reply · <kbd className="font-sans">Ctrl</kbd>+<kbd className="font-sans">Enter</kbd> send ·
              add <kbd className="font-sans">Shift</kbd> to close
            </span>
            <div className="ml-auto flex gap-2">
              <Button type="button" disabled={!body.trim()} loading={reply.isPending && reply.variables?.close} onClick={() => send(true)}>
                Reply & close
              </Button>
              <Button type="submit" variant="primary" disabled={!body.trim()} loading={reply.isPending && !reply.variables?.close}>
                <Send />
                Send reply
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

export function SupportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'waiting_ops'
  const q = params.get('q') ?? ''
  const threads = useSupportThreads({ page_size: 50, status, q })
  const rows = threads.data?.results ?? []
  const activeId = id ? Number(id) : null

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.set(key, value)
    if (key === 'q' && !value) next.delete('q')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key !== 'j' && e.key !== 'k') || e.metaKey || e.ctrlKey || isTyping(e.target) || rows.length === 0) return
      const index = rows.findIndex((t) => t.id === activeId)
      const nextIndex = e.key === 'j' ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1)
      navigate(`/support/${rows[nextIndex].id}${window.location.search}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, activeId, navigate])

  return (
    <div>
      <PageHeader
        title="Support"
        description={`${threads.data?.count ?? 0} tickets in this view · users get a push when you answer`}
        className={cn(activeId !== null && 'max-lg:hidden')}
      />

      <div className="grid h-[calc(100dvh-13rem)] min-h-[520px] overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:grid-cols-[360px_1fr]">
        <aside className={cn('flex min-h-0 flex-col border-border lg:border-r', activeId !== null && 'max-lg:hidden')} aria-label="Tickets">
          <div className="space-y-3 border-b border-border p-3">
            <SearchInput value={q} onSearch={(v) => setFilter('q', v)} placeholder="Search subject or user" label="Search tickets" />
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
              {FILTERS.map(([value, label]) => (
                <button
                  key={value || 'all'}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => setFilter('status', value)}
                  className={cn(
                    'h-7 cursor-pointer rounded-full px-2.5 text-xs font-semibold transition-colors',
                    status === value ? 'bg-primary-solid text-on-primary' : 'bg-surface-2 text-muted hover:text-fg',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.isPending ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : threads.isError ? (
              <EmptyState icon={LifeBuoy} title="Couldn't load tickets" action={<Button onClick={() => void threads.refetch()}>Try again</Button>} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Inbox} title="No tickets here" description="Nothing in this filter right now." />
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((t) => (
                  <li key={t.id}>
                    <ThreadRow thread={t} active={t.id === activeId} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className={cn('flex min-h-0 flex-col', activeId === null && 'max-lg:hidden')} aria-label="Conversation">
          {activeId !== null ? (
            <>
              <div className="border-b border-border px-3 py-2 lg:hidden">
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/support${window.location.search}`}>
                    <ArrowLeft />
                    All tickets
                  </Link>
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <ThreadView threadId={activeId} />
              </div>
            </>
          ) : (
            <EmptyState
              icon={LifeBuoy}
              title="Pick a ticket"
              description="Select a conversation on the left. Use J and K to move between tickets."
              className="h-full justify-center"
            />
          )}
        </section>
      </div>
    </div>
  )
}
