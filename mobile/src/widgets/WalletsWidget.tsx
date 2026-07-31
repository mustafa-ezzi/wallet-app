'use no memo'

import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import { W, truncate, widgetLayout, type WidgetSize } from './widgetTheme'

export type WalletRow = {
  name: string
  balanceLabel: string
}

export type WalletsWidgetData = {
  rows: WalletRow[]
  totalLabel: string
}

/** Top wallets + total — shows more rows when the widget is taller. */
export function WalletsWidget({
  rows,
  totalLabel,
  size,
}: WalletsWidgetData & { size?: WidgetSize }) {
  const L = widgetLayout(size)
  const display = rows.slice(0, L.maxWallets)

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={`CashTrail wallets ${totalLabel}`}
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
        <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <TextWidget
            text="Wallets"
            style={{ fontSize: L.brand + 1, fontWeight: '800', color: W.white }}
          />
          <FlexWidget
            style={{
              backgroundColor: W.panel,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <TextWidget
              text={totalLabel}
              maxLines={1}
              truncate="END"
              style={{
                fontSize: L.label,
                fontWeight: '800',
                color: W.accentSoft,
                adjustsFontSizeToFit: true,
              }}
            />
          </FlexWidget>
        </FlexWidget>

        <FlexWidget style={{ flexDirection: 'column', flexGap: L.compact ? 5 : 6, marginTop: L.compact ? 8 : 10 }}>
          {display.length === 0 ? (
            <TextWidget
              text="Open CashTrail to sync wallets"
              style={{ fontSize: L.label, fontWeight: '500', color: W.muted }}
            />
          ) : (
            display.map((row, idx) => (
              <FlexWidget
                key={`${row.name}-${idx}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: idx % 2 === 0 ? W.panel : W.panelSoft,
                  borderRadius: L.compact ? 10 : 12,
                  paddingHorizontal: L.compact ? 8 : 10,
                  paddingVertical: L.compact ? 6 : 8,
                }}
              >
                <TextWidget
                  text={truncate(row.name, L.wide ? 22 : L.compact ? 12 : 16)}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: L.body - 1, fontWeight: '700', color: '#e2e8f0' }}
                />
                <TextWidget
                  text={row.balanceLabel}
                  maxLines={1}
                  truncate="END"
                  style={{
                    fontSize: L.body - 1,
                    fontWeight: '800',
                    color: W.white,
                    adjustsFontSizeToFit: true,
                  }}
                />
              </FlexWidget>
            ))
          )}
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  )
}
