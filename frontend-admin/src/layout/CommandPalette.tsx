import * as RadixDialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { LogOut, Moon, Search, Sun, UserSearch } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { DialogOverlay } from '../components/ui/Dialog'
import { useTheme } from '../lib/theme'
import { visibleNavGroups } from './nav'

function PaletteItem({
  value,
  keywords,
  onSelect,
  icon,
  children,
  hint,
}: {
  value: string
  keywords?: string[]
  onSelect: () => void
  icon: ReactNode
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-fg data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted"
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
    </Command.Item>
  )
}

const groupClass =
  'px-1 py-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 ' +
  '[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider ' +
  '[&_[cmdk-group-heading]]:text-subtle [&_[cmdk-group-heading]]:uppercase'

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const groups = visibleNavGroups(user?.capabilities)
  const { theme, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')

  function run(action: () => void) {
    onOpenChange(false)
    setSearch('')
    action()
  }

  const query = search.trim()

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSearch('')
      }}
    >
      <RadixDialog.Portal>
        <DialogOverlay />
        <RadixDialog.Content className="fixed top-[12vh] left-1/2 z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop data-[state=open]:animate-pop-in focus:outline-none">
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Jump to a page or run an action</RadixDialog.Description>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-[18px] shrink-0 text-subtle" aria-hidden />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search pages, users, actions…"
                className="h-13 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
              />
              <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                Esc
              </kbd>
            </div>
            <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
              <Command.Empty className="px-4 py-10 text-center text-sm text-muted">No matches.</Command.Empty>

              {query ? (
                <Command.Group heading="Users" className={groupClass}>
                  <PaletteItem
                    value={`search-users ${query}`}
                    icon={<UserSearch />}
                    onSelect={() => run(() => navigate(`/users?q=${encodeURIComponent(query)}`))}
                  >
                    Search users for “{query}”
                  </PaletteItem>
                </Command.Group>
              ) : null}

              {groups.map((group) => {
                const items = group.items.filter((item) => !item.soon)
                if (items.length === 0) return null
                return (
                  <Command.Group key={group.label} heading={group.label} className={groupClass}>
                    {items.map((item) => {
                      const Icon = item.icon
                      return (
                        <PaletteItem
                          key={item.to}
                          value={`${group.label} ${item.label}`}
                          keywords={item.keywords}
                          icon={<Icon />}
                          hint="Go to"
                          onSelect={() => run(() => navigate(item.to))}
                        >
                          {item.label}
                        </PaletteItem>
                      )
                    })}
                  </Command.Group>
                )
              })}

              <Command.Group heading="Actions" className={groupClass}>
                <PaletteItem
                  value="toggle theme"
                  keywords={['dark', 'light', 'mode', 'appearance']}
                  icon={theme === 'dark' ? <Sun /> : <Moon />}
                  onSelect={() => run(toggleTheme)}
                >
                  Switch to {theme === 'dark' ? 'light' : 'dark'} theme
                </PaletteItem>
                <PaletteItem value="sign out" keywords={['logout']} icon={<LogOut />} onSelect={() => run(logout)}>
                  Sign out
                </PaletteItem>
              </Command.Group>
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
