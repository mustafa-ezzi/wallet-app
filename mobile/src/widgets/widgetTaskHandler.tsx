import type { WidgetTaskHandler } from 'react-native-android-widget'
import { BalanceWidget } from './BalanceWidget'
import { BALANCE_WIDGET_NAME, loadBalanceWidgetData } from './updateBalanceWidget'

export const widgetTaskHandler: WidgetTaskHandler = async ({
  widgetInfo,
  widgetAction,
  renderWidget,
}) => {
  if (widgetInfo.widgetName !== BALANCE_WIDGET_NAME) return
  if (widgetAction === 'WIDGET_DELETED') return

  const data = await loadBalanceWidgetData()
  renderWidget(<BalanceWidget {...data} />)
}
