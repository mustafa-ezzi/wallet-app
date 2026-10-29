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
  /** Hidden unless the signed-in role includes this capability. */
  capability?: string
  end?: boolean
  keywords?: string[]
}

export type NavGroup = { label: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Command Center', to: '/', icon: LayoutDashboard, end: true, capability: 'dashboard.read', keywords: ['home', 'kpi', 'dashboard'] }],
  },
  {
    label: 'App',
    items: [
      { label: 'Users', to: '/users', icon: Users, capability: 'users.read', keywords: ['accounts', 'suspend'] },
      { label: 'Premium', to: '/premium', icon: Crown, capability: 'premium.read', keywords: ['entitlements', 'subscription', 'grant'] },
      { label: 'Promos', to: '/promos', icon: TicketPercent, capability: 'promos.read', keywords: ['codes', 'trial'] },
      { label: 'Notifications', to: '/campaigns', icon: BellRing, capability: 'campaigns.read', keywords: ['push', 'campaigns', 'broadcast'] },
      { label: 'Support', to: '/support', icon: LifeBuoy, capability: 'support.read', keywords: ['tickets', 'inbox', 'help'] },
      { label: 'Ads & Config', to: '/ads', icon: SlidersHorizontal, capability: 'config.read', keywords: ['admob', 'remote config', 'flags'] },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Website', to: '/growth/website', icon: Globe, soon: true, capability: 'growth.read' },
      { label: 'Social', to: '/growth/social', icon: Share2, soon: true, capability: 'growth.read' },
      { label: 'Content calendar', to: '/growth/calendar', icon: CalendarDays, soon: true, capability: 'growth.read' },
      { label: 'Campaign links', to: '/growth/links', icon: Link2, soon: true, capability: 'growth.read' },
    ],
  },
  {
    label: 'Insights',
    items: [{ label: 'Analytics report', to: '/insights/report', icon: ChartColumn, capability: 'analytics.read', keywords: ['analytics', 'trends', 'insights'] }],
  },
  {
    label: 'System',
    items: [
      { label: 'Integrations', to: '/system/integrations', icon: Plug, capability: 'integrations.read', keywords: ['ga4', 'instagram', 'facebook', 'linkedin'] },
      { label: 'Team & roles', to: '/system/team', icon: ShieldCheck, capability: 'team.read', keywords: ['staff', 'permissions'] },
      { label: 'Audit log', to: '/audit', icon: ScrollText, capability: 'audit.read', keywords: ['history', 'actions'] },
      { label: 'UI kit', to: '/ui', icon: Palette, keywords: ['design system', 'components'] },
    ],
  },
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))

export function visibleNavGroups(capabilities: string[] | undefined) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.capability || !capabilities || capabilities.includes(item.capability)),
  })).filter((group) => group.items.length > 0)
}

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
