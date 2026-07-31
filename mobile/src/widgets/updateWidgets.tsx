import React from 'react'
import { Platform } from 'react-native'
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

export async function loadBalanceWidgetData(): Promise<BalanceWidgetData> {
  try {
    const store = await getOfflineStore()
    const accounts = await store.listAccounts()
    const total = accounts.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0)
    return {
      balanceLabel: fmtBalance(total),
      subtitle: accounts.length
        ? `${accounts.length} wallet${accounts.length === 1 ? '' : 's'} · tap to open`
        : 'Open CashTrail to sync wallets',
      walletCount: accounts.length,
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
    }
  } catch {
    return {
      monthLabel: month,
      incomeLabel: '—',
      expenseLabel: '—',
      netLabel: '—',
      netPositive: true,
    }
  }
}

export async function loadWalletsWidgetData(): Promise<WalletsWidgetData> {
  try {
    const store = await getOfflineStore()
    const accounts = await store.listAccounts()
    const total = accounts.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0)
    const rows = [...accounts]
      .sort((a, b) => (Number(b.currentBalance) || 0) - (Number(a.currentBalance) || 0))
      .slice(0, 3)
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
    const [accounts, txs] = await Promise.all([store.listAccounts(), store.listTransactions()])
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
  render: () => React.ReactElement,
) {
  const { requestWidgetUpdate } = await import('react-native-android-widget')
  await requestWidgetUpdate({
    widgetName,
    renderWidget: render,
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
      safeRequest(BALANCE_WIDGET_NAME, () => <BalanceWidget {...balance} />),
      safeRequest(MONTH_FLOW_WIDGET_NAME, () => <MonthFlowWidget {...month} />),
      safeRequest(WALLETS_WIDGET_NAME, () => <WalletsWidget {...wallets} />),
      safeRequest(QUICK_GLANCE_WIDGET_NAME, () => <QuickGlanceWidget {...glance} />),
    ])
  } catch (err) {
    console.warn('[CashTrail] widget update failed', err)
  }
}

/** @deprecated use updateAllWidgets — kept for existing imports */
export async function updateBalanceWidgets() {
  return updateAllWidgets()
}
