'use no memo'

import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import { W, truncate, widgetLayout, type WidgetSize } from './widgetTheme'

export type BalanceWidgetData = {
  balanceLabel: string
  subtitle: string
  walletCount: number
  updatedLabel?: string
}

/** Home-screen Android widget — total WalletTrails balance (size-aware). */
export function BalanceWidget({
  balanceLabel,
  subtitle,
  walletCount,
  updatedLabel,
  size,
}: BalanceWidgetData & { size?: WidgetSize }) {
  const L = widgetLayout(size)
  const foot =
    subtitle
    || (walletCount ? `${walletCount} wallet${walletCount === 1 ? '' : 's'}` : 'Open app to sync')

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={`WalletTrails balance ${balanceLabel}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        backgroundColor: W.bgDeep,
        backgroundGradient: {
          from: W.bgDeep,
          to: W.bg,
          orientation: 'TL_BR',
        },
        borderRadius: L.radius,
        borderWidth: 1,
        borderColor: W.border,
        overflow: 'hidden',
      }}
    >
      <FlexWidget
        style={{
          width: L.micro ? 4 : 6,
          height: 'match_parent',
          backgroundColor: W.accent,
          backgroundGradient: {
            from: W.accentSoft,
            to: W.accent,
            orientation: 'TOP_BOTTOM',
          },
        }}
      />

      <FlexWidget
        style={{
          flex: 1,
          height: 'match_parent',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: L.pad,
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <FlexWidget
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: W.panel,
              borderRadius: 999,
              paddingHorizontal: L.compact ? 8 : 10,
              paddingVertical: L.compact ? 3 : 4,
              flexGap: 6,
            }}
          >
            <TextWidget
              text="WalletTrails"
              style={{ fontSize: L.brand, fontWeight: '800', color: W.accentSoft, letterSpacing: 0.3 }}
            />
            <TextWidget
              text="BALANCE"
              style={{ fontSize: L.label, fontWeight: '700', color: W.muted }}
            />
          </FlexWidget>
          {updatedLabel && !L.micro ? (
            <TextWidget
              text={updatedLabel}
              style={{ fontSize: L.label, fontWeight: '600', color: W.muted }}
            />
          ) : null}
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
            marginTop: L.compact ? 6 : 10,
          }}
        />

        <TextWidget
          text={truncate(foot, L.wide ? 42 : L.compact ? 28 : 36)}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: L.label,
            fontWeight: '600',
            color: W.muted,
            marginTop: L.compact ? 4 : 6,
          }}
        />
      </FlexWidget>
    </FlexWidget>
  )
}
