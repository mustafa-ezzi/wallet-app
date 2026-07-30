import { Platform } from 'react-native'
import { getOfflineStore } from '@/src/offline/store'
import { fmtBalance } from '@/src/utils/format'
import type { BalanceWidgetData } from './BalanceWidget'

export const BALANCE_WIDGET_NAME = 'CashTrailBalance'

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

/** Push latest balance to every CashTrail Balance widget on the home screen. */
export async function updateBalanceWidgets() {
  if (Platform.OS !== 'android') return
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget')
    const { BalanceWidget } = await import('./BalanceWidget')
    const data = await loadBalanceWidgetData()
    await requestWidgetUpdate({
      widgetName: BALANCE_WIDGET_NAME,
      renderWidget: () => <BalanceWidget {...data} />,
      widgetNotFound: () => {
        /* no widgets placed yet — fine */
      },
    })
  } catch (err) {
    console.warn('[CashTrail] widget update failed', err)
  }
}
