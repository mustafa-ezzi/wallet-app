'use no memo'

import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import { W, truncate, widgetLayout, type WidgetSize } from './widgetTheme'

export type QuickGlanceWidgetData = {
  balanceLabel: string
  txCountLabel: string
}

/** Compact glance widget — switches to a horizontal layout when wide & short. */
export function QuickGlanceWidget({
  balanceLabel,
  txCountLabel,
  size,
}: QuickGlanceWidgetData & { size?: WidgetSize }) {
  const L = widgetLayout(size)
  const horizontal = L.wide && L.height < 110

  if (horizontal) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        accessibilityLabel={`WalletTrails ${balanceLabel}`}
        style={{
          height: 'match_parent',
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: W.bg,
          backgroundGradient: {
            from: '#065f46',
            to: W.bg,
            orientation: 'LEFT_RIGHT',
          },
          borderRadius: L.radius,
          borderWidth: 1,
          borderColor: W.border,
          padding: L.pad,
          flexGap: 10,
          overflow: 'hidden',
        }}
      >
        <FlexWidget
          style={{
            width: 5,
            height: 'match_parent',
            backgroundColor: W.accentSoft,
            borderRadius: 999,
          }}
        />
        <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <TextWidget
            text="WalletTrails"
            style={{ fontSize: L.brand, fontWeight: '800', color: W.accentSoft }}
          />
          <TextWidget
            text={truncate(txCountLabel, 28)}
            maxLines={1}
            truncate="END"
            style={{ fontSize: L.label, fontWeight: '600', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}
          />
        </FlexWidget>
        <TextWidget
          text={balanceLabel}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: Math.min(L.hero, 26),
            fontWeight: '800',
            color: W.white,
            adjustsFontSizeToFit: true,
          }}
        />
      </FlexWidget>
    )
  }

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={`WalletTrails ${balanceLabel}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#065f46',
        backgroundGradient: {
          from: '#047857',
          to: '#064e3b',
          orientation: 'TL_BR',
        },
        borderRadius: L.radius,
        borderWidth: 1,
        borderColor: '#0f766e',
        padding: L.pad,
        overflow: 'hidden',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextWidget
          text="WalletTrails"
          style={{
            fontSize: L.brand,
            fontWeight: '800',
            color: 'rgba(255,255,255,0.88)',
            letterSpacing: 0.3,
          }}
        />
        <FlexWidget
          style={{
            width: L.micro ? 6 : 8,
            height: L.micro ? 6 : 8,
            borderRadius: 999,
            backgroundColor: W.accentSoft,
          }}
        />
      </FlexWidget>

      <TextWidget
        text={balanceLabel}
        maxLines={1}
        truncate="END"
        style={{
          fontSize: L.hero,
          fontWeight: '800',
          color: W.white,
          adjustsFontSizeToFit: true,
          marginTop: L.compact ? 4 : 6,
        }}
      />

      <TextWidget
        text={truncate(txCountLabel, L.compact ? 22 : 32)}
        maxLines={1}
        truncate="END"
        style={{
          fontSize: L.label,
          fontWeight: '600',
          color: 'rgba(255,255,255,0.72)',
          marginTop: 2,
        }}
      />
    </FlexWidget>
  )
}
