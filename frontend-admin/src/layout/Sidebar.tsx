import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import walletTrailsLogo from '../assets/wallettrail-logo.png'
import { Tooltip } from '../components/ui'
import { cn } from '../lib/cn'
import { useDashboard } from '../queries'
import { NAV_GROUPS, type NavItem } from './nav'

function NavEntry({
  item,
  collapsed,
  count,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  count?: number
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const base =
    'group relative flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-[13.5px] font-medium transition-colors'

  if (item.soon) {
    const body = (
      <div
        aria-disabled="true"
        className={cn(base, 'cursor-default text-sidebar-muted/70', collapsed && 'justify-center px-0')}
      >
        <Icon className="size-[18px] shrink-0 opacity-70" aria-hidden />
        {collapsed ? (
          <span className="sr-only">{item.label} (coming soon)</span>
        ) : (
          <>
            <span className="truncate">{item.label}</span>
            <span className="ml-auto rounded-full border border-sidebar-border px-1.5 py-px text-[10px] font-semibold tracking-wide text-sidebar-muted uppercase">
              Soon
            </span>
          </>
        )}
      </div>
    )
    return collapsed ? (
      <Tooltip content={`${item.label} · coming soon`} side="right">
        {body}
      </Tooltip>
    ) : (
      body
    )
  }

  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          base,
          isActive
            ? 'bg-sidebar-active text-white'
            : 'text-sidebar-fg/85 hover:bg-sidebar-hover hover:text-white',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-sidebar-accent" aria-hidden />
          ) : null}
          <Icon className={cn('size-[18px] shrink-0', isActive ? 'text-sidebar-accent' : 'opacity-80')} aria-hidden />
          {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
          {count ? (
            <span
              className={cn(
                'rounded-full bg-sidebar-accent px-1.5 text-[11px] leading-[18px] font-bold text-[#04150e] tabular',
                collapsed ? 'absolute top-0.5 right-0.5 min-w-4 px-1 text-[10px] leading-4' : 'ml-auto',
              )}
              aria-label={`${count} waiting`}
            >
              {count}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )

  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  className,
}: {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onNavigate?: () => void
  className?: string
}) {
  const dashboard = useDashboard()
  const needsReply = dashboard.data?.support?.waiting_ops ?? 0

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-fg',
        collapsed ? 'w-[68px]' : 'w-[248px]',
        className,
      )}
    >
      <div className={cn('flex h-16 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <img src={walletTrailsLogo} alt="" className="size-8 rounded-[10px] object-cover" />
        {collapsed ? (
          <span className="sr-only">WalletTrails Ops</span>
        ) : (
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="font-display text-[17px] font-bold tracking-tight text-white">WalletTrails</span>
            <span className="rounded-md bg-sidebar-active px-1.5 py-px text-[11px] font-bold text-sidebar-accent">Ops</span>
          </div>
        )}
      </div>

      <nav
        aria-label="Main"
        className="flex-1 overflow-y-auto px-3 pb-4 [scrollbar-color:rgba(255,255,255,0.14)_transparent] [scrollbar-width:thin]"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mt-4 first:mt-1">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" aria-hidden />
            ) : (
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-[0.08em] text-sidebar-muted uppercase">
                {group.label}
              </p>
            )}
            <div className="grid gap-0.5">
              {group.items.map((item) => (
                <NavEntry
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  count={item.to === '/support' ? needsReply : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {onToggleCollapsed ? (
        <div className={cn('border-t border-sidebar-border p-3', collapsed && 'flex justify-center')}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'flex h-9 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 text-[13px] font-medium text-sidebar-muted hover:bg-sidebar-hover hover:text-white',
              collapsed ? 'w-9 justify-center px-0' : 'w-full',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            {collapsed ? null : 'Collapse'}
          </button>
        </div>
      ) : null}
    </aside>
  )
}
