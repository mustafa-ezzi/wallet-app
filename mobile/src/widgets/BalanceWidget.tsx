import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'

export type BalanceWidgetData = {
  balanceLabel: string
  subtitle: string
  walletCount: number
}

/** Home-screen Android widget — total CashTrail balance. */
export function BalanceWidget({ balanceLabel, subtitle, walletCount }: BalanceWidgetData) {
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
        padding: 16,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
        <TextWidget
          text="CashTrail"
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: '#6ee7b7',
            letterSpacing: 0.4,
          }}
        />
        <TextWidget
          text="BALANCE"
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: '#94a3b8',
          }}
        />
      </FlexWidget>

      <TextWidget
        text={balanceLabel}
        style={{
          fontSize: 28,
          fontWeight: '800',
          color: '#ffffff',
          marginTop: 10,
        }}
      />

      <TextWidget
        text={subtitle || (walletCount ? `${walletCount} wallet${walletCount === 1 ? '' : 's'}` : 'Open app to sync')}
        style={{
          fontSize: 12,
          fontWeight: '500',
          color: '#94a3b8',
          marginTop: 6,
        }}
      />
    </FlexWidget>
  )
}
