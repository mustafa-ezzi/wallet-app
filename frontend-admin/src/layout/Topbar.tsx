import { LogOut, Menu, Moon, Search, Sun } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import {
  Button,
  DateRangePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '../components/ui'
import { useDateRange } from '../lib/dateRange'
import { useTheme } from '../lib/theme'
import { findNavItem } from './nav'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function initials(name: string) {
  return (
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function Topbar({ onOpenNav, onOpenPalette }: { onOpenNav: () => void; onOpenPalette: () => void }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { range, setRange } = useDateRange()
  const { pathname } = useLocation()
  const current = findNavItem(pathname)
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || ''

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={onOpenNav}>
        <Menu />
      </Button>

      <div className="min-w-0 flex-1">
        {current ? (
          <p className="truncate text-[13px] text-muted">
            <span className="max-sm:hidden">{current.group} / </span>
            <span className="font-semibold text-fg">{current.label}</span>
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-9.5 cursor-pointer items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3 text-sm text-subtle transition-colors hover:bg-surface-2 sm:w-64"
        aria-label="Open command palette"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left max-sm:hidden">Search…</span>
        <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-px text-[11px] font-semibold text-muted max-sm:hidden">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <DateRangePicker value={range} onChange={setRange} />

      <Tooltip content={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="grid size-9 cursor-pointer place-items-center rounded-full bg-primary-soft text-[13px] font-bold text-primary-soft-fg ring-offset-2 ring-offset-bg hover:ring-2 hover:ring-border-strong"
            aria-label="Account menu"
          >
            {initials(displayName)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>
            <span className="block text-sm font-semibold text-fg">{displayName}</span>
            <span className="block truncate">{user?.email || `@${user?.username}`}</span>
            <span className="mt-1 inline-block rounded-full bg-surface-3 px-2 py-px text-[11px] font-semibold text-muted">
              {user?.is_superuser ? 'Superuser' : 'Staff'}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={toggleTheme}>
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={logout}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
