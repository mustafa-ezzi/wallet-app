import type { LucideIcon } from 'lucide-react'
import {
  User,
  Plane,
  ShoppingBasket,
  Wrench,
  UtensilsCrossed,
  Car,
  Film,
  Zap,
  Home,
  HeartPulse,
  ShoppingBag,
  GraduationCap,
  Gift,
  MoreHorizontal,
  Banknote,
  Laptop,
  Briefcase,
  Calendar,
  Tag,
  ArrowLeftRight,
} from 'lucide-react'

export type CategoryMeta = {
  key: string
  label: string
  icon: LucideIcon
  color: string
}

export const EXPENSE_CATEGORIES: CategoryMeta[] = [
  { key: 'Personal', label: 'Personal', icon: User, color: '#22c55e' },
  { key: 'Travel', label: 'Travel', icon: Plane, color: '#38bdf8' },
  { key: 'Grocery', label: 'Grocery', icon: ShoppingBasket, color: '#f59e0b' },
  { key: 'Fuel & Maintenance', label: 'Fuel & Maintenance', icon: Wrench, color: '#a78bfa' },
  { key: 'Food & Drink', label: 'Food & Drink', icon: UtensilsCrossed, color: '#fb7185' },
  { key: 'Transport', label: 'Transport', icon: Car, color: '#60a5fa' },
  { key: 'Entertainment', label: 'Entertainment', icon: Film, color: '#f472b6' },
  { key: 'Bills & Utilities', label: 'Bills & Utilities', icon: Zap, color: '#eab308' },
  { key: 'Rent', label: 'Rent', icon: Home, color: '#f97316' },
  { key: 'Health', label: 'Health', icon: HeartPulse, color: '#ef4444' },
  { key: 'Shopping', label: 'Shopping', icon: ShoppingBag, color: '#06b6d4' },
  { key: 'Education', label: 'Education', icon: GraduationCap, color: '#818cf8' },
  { key: 'Gifts', label: 'Gifts', icon: Gift, color: '#e879f9' },
  { key: 'Miscellaneous', label: 'Miscellaneous', icon: MoreHorizontal, color: '#94a3b8' },
]

export const INCOME_CATEGORIES: CategoryMeta[] = [
  { key: 'Salary', label: 'Salary', icon: Banknote, color: '#059669' },
  { key: 'Freelance', label: 'Freelance', icon: Laptop, color: '#0ea5e9' },
  { key: 'Business', label: 'Business', icon: Briefcase, color: '#7c3aed' },
  { key: 'Monthly Income', label: 'Monthly Income', icon: Calendar, color: '#16a34a' },
  { key: 'Gifts', label: 'Gifts', icon: Gift, color: '#e879f9' },
  { key: 'Other', label: 'Other', icon: Tag, color: '#94a3b8' },
]

const TRANSFER_META: CategoryMeta = {
  key: 'Bank Transfer',
  label: 'Transfer',
  icon: ArrowLeftRight,
  color: '#64748b',
}

const ALIASES: Record<string, string> = {
  food: 'Food & Drink',
  'food & drinks': 'Food & Drink',
  'food and drink': 'Food & Drink',
  drinks: 'Food & Drink',
  groceries: 'Grocery',
  utilities: 'Bills & Utilities',
  'server charges': 'Bills & Utilities',
  bills: 'Bills & Utilities',
  fuel: 'Fuel & Maintenance',
  maintenance: 'Fuel & Maintenance',
  monthly: 'Monthly Income',
  'bank transfer': 'Bank Transfer',
  salary: 'Salary',
  rent: 'Rent',
  miscellaneous: 'Miscellaneous',
}

const FALLBACK_COLORS = [
  '#22c55e', '#38bdf8', '#f59e0b', '#a78bfa', '#fb7185',
  '#60a5fa', '#f472b6', '#eab308', '#f97316', '#06b6d4',
]

const BY_KEY = new Map<string, CategoryMeta>()
for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, TRANSFER_META]) {
  if (!BY_KEY.has(c.key.toLowerCase())) BY_KEY.set(c.key.toLowerCase(), c)
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function getCategoryMeta(name?: string | null): CategoryMeta {
  const raw = (name ?? '').trim()
  if (!raw) return { key: 'Uncategorized', label: 'Uncategorized', icon: Tag, color: '#94a3b8' }
  const lower = raw.toLowerCase()
  const canonical = ALIASES[lower] ?? raw
  const hit = BY_KEY.get(canonical.toLowerCase())
  if (hit) return hit
  return {
    key: raw,
    label: raw,
    icon: Tag,
    color: FALLBACK_COLORS[hashString(lower) % FALLBACK_COLORS.length],
  }
}
