import {
  BellRing,
  CalendarDays,
  ChartColumn,
  Crown,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  Palette,
  Plug,
  ScrollText,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  TicketPercent,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
  /** Planned in a later build phase; shown in the sidebar but not navigable yet. */
  soon?: boolean
  end?: boolean
  keywords?: string[]
}

export type NavGroup = { label: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Command Center', to: '/', icon: LayoutDashboard, end: true, keywords: ['home', 'kpi', 'dashboard'] }],
  },
  {
    label: 'App',
    items: [
      { label: 'Users', to: '/users', icon: Users, keywords: ['accounts', 'suspend'] },
      { label: 'Premium', to: '/premium', icon: Crown, keywords: ['entitlements', 'subscription', 'grant'] },
      { label: 'Promos', to: '/promos', icon: TicketPercent, keywords: ['codes', 'trial'] },
      { label: 'Notifications', to: '/campaigns', icon: BellRing, keywords: ['push', 'campaigns', 'broadcast'] },
      { label: 'Support', to: '/support', icon: LifeBuoy, keywords: ['tickets', 'inbox', 'help'] },
      { label: 'Ads & Config', to: '/ads', icon: SlidersHorizontal, keywords: ['admob', 'remote config', 'flags'] },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Website', to: '/growth/website', icon: Globe, soon: true },
      { label: 'Social', to: '/growth/social', icon: Share2, soon: true },
      { label: 'Content calendar', to: '/growth/calendar', icon: CalendarDays, soon: true },
      { label: 'Campaign links', to: '/growth/links', icon: Link2, soon: true },
    ],
  },
  {
    label: 'Insights',
    items: [{ label: 'Analytics report', to: '/insights/report', icon: ChartColumn, keywords: ['analytics', 'trends', 'insights'] }],
  },
  {
    label: 'System',
    items: [
      { label: 'Integrations', to: '/system/integrations', icon: Plug, soon: true },
      { label: 'Team & roles', to: '/system/team', icon: ShieldCheck, soon: true },
      { label: 'Audit log', to: '/audit', icon: ScrollText, keywords: ['history', 'actions'] },
      { label: 'UI kit', to: '/ui', icon: Palette, keywords: ['design system', 'components'] },
    ],
  },
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))

/** Best match for the current path, used for the top-bar title. */
export function findNavItem(pathname: string) {
  const live = NAV_ITEMS.filter((item) => !item.soon)
  return (
    live.find((item) => item.to === pathname) ??
    live
      .filter((item) => item.to !== '/' && pathname.startsWith(`${item.to}/`))
      .sort((a, b) => b.to.length - a.to.length)[0]
  )
}
