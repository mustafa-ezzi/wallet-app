import type { WidgetTaskHandler } from 'react-native-android-widget'
import { BalanceWidget } from './BalanceWidget'
import { MonthFlowWidget } from './MonthFlowWidget'
import { QuickGlanceWidget } from './QuickGlanceWidget'
import { TraiWidget } from './TraiWidget'
import { WalletsWidget } from './WalletsWidget'
import {
  BALANCE_WIDGET_NAME,
  MONTH_FLOW_WIDGET_NAME,
  QUICK_GLANCE_WIDGET_NAME,
  TRAI_WIDGET_NAME,
  WALLETS_WIDGET_NAME,
  loadBalanceWidgetData,
  loadMonthFlowWidgetData,
  loadQuickGlanceWidgetData,
  loadTraiWidgetData,
  loadWalletsWidgetData,
} from './updateWidgets'

export const widgetTaskHandler: WidgetTaskHandler = async ({
  widgetInfo,
  widgetAction,
  clickAction,
  clickActionData,
  renderWidget,
}) => {
  if (widgetAction === 'WIDGET_DELETED') return

  const size = { width: widgetInfo.width, height: widgetInfo.height }

  switch (widgetInfo.widgetName) {
    case BALANCE_WIDGET_NAME: {
      const data = await loadBalanceWidgetData()
      renderWidget(<BalanceWidget {...data} size={size} />)
      break
    }
    case MONTH_FLOW_WIDGET_NAME: {
      const data = await loadMonthFlowWidgetData()
      renderWidget(<MonthFlowWidget {...data} size={size} />)
      break
    }
    case WALLETS_WIDGET_NAME: {
      const data = await loadWalletsWidgetData()
      renderWidget(<WalletsWidget {...data} size={size} />)
      break
    }
    case QUICK_GLANCE_WIDGET_NAME: {
      const data = await loadQuickGlanceWidgetData()
      renderWidget(<QuickGlanceWidget {...data} size={size} />)
      break
    }
    case TRAI_WIDGET_NAME: {
      const data = await loadTraiWidgetData()
      const poked = widgetAction === 'WIDGET_CLICK' && clickAction === 'trai-poke'
      const raw = poked ? Number(clickActionData?.mood ?? 0) : 0
      const mood = Number.isFinite(raw) ? raw : 0
      renderWidget(<TraiWidget {...data} mood={mood} size={size} />)
      break
    }
    default:
      break
  }
}
