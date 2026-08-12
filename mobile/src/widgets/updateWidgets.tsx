import React from 'react'
import { Platform } from 'react-native'
import type { WidgetInfo } from 'react-native-android-widget'
import { getOfflineStore } from '@/src/offline/store'
import { fmt, fmtBalance } from '@/src/utils/format'
import type { BalanceWidgetData } from './BalanceWidget'
import type { MonthFlowWidgetData } from './MonthFlowWidget'
import type { QuickGlanceWidgetData } from './QuickGlanceWidget'
import type { WalletsWidgetData } from './WalletsWidget'

export const BALANCE_WIDGET_NAME = 'CashTrailBalance'
export const MONTH_FLOW_WIDGET_NAME = 'CashTrailMonthFlow'
export const WALLETS_WIDGET_NAME = 'CashTrailWallets'
export const QUICK_GLANCE_WIDGET_NAME = 'CashTrailQuickGlance'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function todayMonthPrefix(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function updatedClockLabel(): string {
  const d = new Date()
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ap = h >= 12 ? 'pm' : 'am'
  const hour12 = h % 12 || 12
  return `${hour12}:${m}${ap}`
}

function bankCashAccounts<T extends { type?: string }>(accounts: T[]): T[] {
  return accounts.filter((a) => a.type === 'bank' || a.type === 'cash')
}

export async function loadBalanceWidgetData(): Promise<BalanceWidgetData> {
  try {
    const store = await getOfflineStore()
    const accounts = bankCashAccounts(await store.listAccounts())
    const total = accounts.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0)
    return {
      balanceLabel: fmtBalance(total),
      subtitle: accounts.length
        ? `${accounts.length} wallet${accounts.length === 1 ? '' : 's'} · tap to open`
        : 'Open CashTrail to sync wallets',
      walletCount: accounts.length,
      updatedLabel: updatedClockLabel(),
    }
  } catch {
    return {
      balanceLabel: '—',
      subtitle: 'Open CashTrail to sync',
      walletCount: 0,
    }
  }
}

export async function loadMonthFlowWidgetData(): Promise<MonthFlowWidgetData> {
  const month = MONTH_NAMES[new Date().getMonth()]
  try {
    const store = await getOfflineStore()
    const txs = await store.listTransactions()
    const prefix = todayMonthPrefix()
    let income = 0
    let expense = 0
    for (const t of txs) {
      if (!t.date.startsWith(prefix)) continue
      if (t.category === 'Bank Transfer') continue
      if (t.type === 'income') income += t.amount
      else expense += t.amount
    }
    const net = income - expense
    return {
      monthLabel: month,
      incomeLabel: fmt(income),
      expenseLabel: fmt(expense),
      netLabel: fmtBalance(net),
      netPositive: net >= 0,
      incomeValue: income,
      expenseValue: expense,
    }
  } catch {
    return {
      monthLabel: month,
      incomeLabel: '—',
      expenseLabel: '—',
      netLabel: '—',
      netPositive: true,
      incomeValue: 0,
      expenseValue: 0,
    }
  }
}

export async function loadWalletsWidgetData(): Promise<WalletsWidgetData> {
  try {
    const store = await getOfflineStore()
    const accounts = bankCashAccounts(await store.listAccounts())
    const total = accounts.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0)
    // Load enough rows for tall widgets; UI slices by height.
    const rows = [...accounts]
      .sort((a, b) => (Number(b.currentBalance) || 0) - (Number(a.currentBalance) || 0))
      .slice(0, 5)
      .map((a) => ({
        name: a.name,
        balanceLabel: fmtBalance(a.currentBalance),
      }))
    return { rows, totalLabel: fmtBalance(total) }
  } catch {
    return { rows: [], totalLabel: '—' }
  }
}

export async function loadQuickGlanceWidgetData(): Promise<QuickGlanceWidgetData> {
  try {
    const store = await getOfflineStore()
    const [allAccounts, txs] = await Promise.all([store.listAccounts(), store.listTransactions()])
    const accounts = bankCashAccounts(allAccounts)
    const total = accounts.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0)
    const prefix = todayMonthPrefix()
    const monthTx = txs.filter((t) => t.date.startsWith(prefix)).length
    return {
      balanceLabel: fmtBalance(total),
      txCountLabel: monthTx ? `${monthTx} tx this month` : 'Tap to add a transaction',
    }
  } catch {
    return { balanceLabel: '—', txCountLabel: 'Open CashTrail' }
  }
}

async function safeRequest(
  widgetName: string,
  render: (info: WidgetInfo) => React.ReactElement,
) {
  const { requestWidgetUpdate } = await import('react-native-android-widget')
  await requestWidgetUpdate({
    widgetName,
    renderWidget: (info) => render(info),
    widgetNotFound: () => {},
  })
}

/** Push latest data to every CashTrail home-screen widget. */
export async function updateAllWidgets() {
  if (Platform.OS !== 'android') return
  try {
    const [
      { BalanceWidget },
      { MonthFlowWidget },
      { WalletsWidget },
      { QuickGlanceWidget },
      balance,
      month,
      wallets,
      glance,
    ] = await Promise.all([
      import('./BalanceWidget'),
      import('./MonthFlowWidget'),
      import('./WalletsWidget'),
      import('./QuickGlanceWidget'),
      loadBalanceWidgetData(),
      loadMonthFlowWidgetData(),
      loadWalletsWidgetData(),
      loadQuickGlanceWidgetData(),
    ])

    await Promise.all([
      safeRequest(BALANCE_WIDGET_NAME, (info) => (
        <BalanceWidget {...balance} size={{ width: info.width, height: info.height }} />
      )),
      safeRequest(MONTH_FLOW_WIDGET_NAME, (info) => (
        <MonthFlowWidget {...month} size={{ width: info.width, height: info.height }} />
      )),
      safeRequest(WALLETS_WIDGET_NAME, (info) => (
        <WalletsWidget {...wallets} size={{ width: info.width, height: info.height }} />
      )),
      safeRequest(QUICK_GLANCE_WIDGET_NAME, (info) => (
        <QuickGlanceWidget {...glance} size={{ width: info.width, height: info.height }} />
      )),
    ])
  } catch (err) {
    console.warn('[CashTrail] widget update failed', err)
  }
}

/** @deprecated use updateAllWidgets — kept for existing imports */
export async function updateBalanceWidgets() {
  return updateAllWidgets()
}
