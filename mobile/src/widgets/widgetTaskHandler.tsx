import type { WidgetTaskHandler } from 'react-native-android-widget'
import { BalanceWidget } from './BalanceWidget'
import { MonthFlowWidget } from './MonthFlowWidget'
import { QuickGlanceWidget } from './QuickGlanceWidget'
import { WalletsWidget } from './WalletsWidget'
import {
  BALANCE_WIDGET_NAME,
  MONTH_FLOW_WIDGET_NAME,
  QUICK_GLANCE_WIDGET_NAME,
  WALLETS_WIDGET_NAME,
  loadBalanceWidgetData,
  loadMonthFlowWidgetData,
  loadQuickGlanceWidgetData,
  loadWalletsWidgetData,
} from './updateWidgets'

export const widgetTaskHandler: WidgetTaskHandler = async ({
  widgetInfo,
  widgetAction,
  renderWidget,
}) => {
  if (widgetAction === 'WIDGET_DELETED') return

  switch (widgetInfo.widgetName) {
    case BALANCE_WIDGET_NAME: {
      const data = await loadBalanceWidgetData()
      renderWidget(<BalanceWidget {...data} />)
      break
    }
    case MONTH_FLOW_WIDGET_NAME: {
      const data = await loadMonthFlowWidgetData()
      renderWidget(<MonthFlowWidget {...data} />)
      break
    }
    case WALLETS_WIDGET_NAME: {
      const data = await loadWalletsWidgetData()
      renderWidget(<WalletsWidget {...data} />)
      break
    }
    case QUICK_GLANCE_WIDGET_NAME: {
      const data = await loadQuickGlanceWidgetData()
      renderWidget(<QuickGlanceWidget {...data} />)
      break
    }
    default:
      break
  }
}
