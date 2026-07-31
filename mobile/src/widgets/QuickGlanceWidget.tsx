import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'

export type QuickGlanceWidgetData = {
  balanceLabel: string
  txCountLabel: string
}

/** Small 2×1 glance widget — balance + recent activity cue. */
export function QuickGlanceWidget({ balanceLabel, txCountLabel }: QuickGlanceWidgetData) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: '#047857',
        borderRadius: 20,
        padding: 14,
      }}
    >
      <TextWidget
        text="CashTrail"
        style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.4 }}
      />
      <TextWidget
        text={balanceLabel}
        style={{ fontSize: 22, fontWeight: '800', color: '#ffffff', marginTop: 4 }}
      />
      <TextWidget
        text={txCountLabel}
        style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 4 }}
      />
    </FlexWidget>
  )
}
