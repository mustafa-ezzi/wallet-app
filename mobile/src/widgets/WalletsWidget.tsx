import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'

export type WalletRow = {
  name: string
  balanceLabel: string
}

export type WalletsWidgetData = {
  rows: WalletRow[]
  totalLabel: string
}

/** Widget listing top wallets + total. */
export function WalletsWidget({ rows, totalLabel }: WalletsWidgetData) {
  const display = rows.slice(0, 3)

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#04333b',
        borderRadius: 22,
        padding: 14,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget text="Wallets" style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }} />
        <TextWidget text={totalLabel} style={{ fontSize: 12, fontWeight: '700', color: '#6ee7b7' }} />
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'column', flexGap: 6, marginTop: 10 }}>
        {display.length === 0 ? (
          <TextWidget
            text="Open CashTrail to sync wallets"
            style={{ fontSize: 12, fontWeight: '500', color: '#94a3b8' }}
          />
        ) : (
          display.map((row) => (
            <FlexWidget
              key={row.name}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#0b4a52',
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <TextWidget
                text={row.name}
                style={{ fontSize: 12, fontWeight: '700', color: '#e2e8f0' }}
              />
              <TextWidget
                text={row.balanceLabel}
                style={{ fontSize: 12, fontWeight: '800', color: '#ffffff' }}
              />
            </FlexWidget>
          ))
        )}
      </FlexWidget>
    </FlexWidget>
  )
}
