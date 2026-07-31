import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'

export type MonthFlowWidgetData = {
  monthLabel: string
  incomeLabel: string
  expenseLabel: string
  netLabel: string
  netPositive: boolean
}

/** Compact widget — this month's money in / out / net. */
export function MonthFlowWidget({
  monthLabel,
  incomeLabel,
  expenseLabel,
  netLabel,
  netPositive,
}: MonthFlowWidgetData) {
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
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
        <TextWidget
          text="CashTrail"
          style={{ fontSize: 12, fontWeight: '700', color: '#6ee7b7' }}
        />
        <TextWidget
          text={monthLabel.toUpperCase()}
          style={{ fontSize: 11, fontWeight: '600', color: '#94a3b8' }}
        />
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'row', flexGap: 8, marginTop: 8 }}>
        <FlexWidget
          style={{
            flex: 1,
            backgroundColor: '#0b4a52',
            borderRadius: 14,
            padding: 10,
          }}
        >
          <TextWidget text="IN" style={{ fontSize: 10, fontWeight: '700', color: '#94a3b8' }} />
          <TextWidget
            text={incomeLabel}
            style={{ fontSize: 15, fontWeight: '800', color: '#6ee7b7', marginTop: 4 }}
          />
        </FlexWidget>
        <FlexWidget
          style={{
            flex: 1,
            backgroundColor: '#0b4a52',
            borderRadius: 14,
            padding: 10,
          }}
        >
          <TextWidget text="OUT" style={{ fontSize: 10, fontWeight: '700', color: '#94a3b8' }} />
          <TextWidget
            text={expenseLabel}
            style={{ fontSize: 15, fontWeight: '800', color: '#fda4af', marginTop: 4 }}
          />
        </FlexWidget>
      </FlexWidget>

      <TextWidget
        text={`Net ${netLabel}`}
        style={{
          fontSize: 13,
          fontWeight: '700',
          color: netPositive ? '#6ee7b7' : '#fda4af',
          marginTop: 8,
        }}
      />
    </FlexWidget>
  )
}
