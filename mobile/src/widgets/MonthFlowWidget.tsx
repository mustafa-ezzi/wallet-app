'use no memo'

import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import { W, flowWeights, truncate, widgetLayout, type WidgetSize } from './widgetTheme'

export type MonthFlowWidgetData = {
  monthLabel: string
  incomeLabel: string
  expenseLabel: string
  netLabel: string
  netPositive: boolean
  incomeValue?: number
  expenseValue?: number
}

/** This month's money in / out / net with a proportional bar. */
export function MonthFlowWidget({
  monthLabel,
  incomeLabel,
  expenseLabel,
  netLabel,
  netPositive,
  incomeValue = 0,
  expenseValue = 0,
  size,
}: MonthFlowWidgetData & { size?: WidgetSize }) {
  const L = widgetLayout(size)
  const { inW, outW } = flowWeights(incomeValue, expenseValue)
  const rail = netPositive ? W.accent : W.danger

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={`WalletTrails month flow ${monthLabel}`}
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
          backgroundColor: rail,
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
          <TextWidget
            text="WalletTrails"
            style={{ fontSize: L.brand, fontWeight: '800', color: W.accentSoft }}
          />
          <TextWidget
            text={monthLabel.toUpperCase()}
            style={{ fontSize: L.label, fontWeight: '700', color: W.muted, letterSpacing: 0.6 }}
          />
        </FlexWidget>

        {!L.micro ? (
          <FlexWidget
            style={{
              flexDirection: 'row',
              height: L.compact ? 5 : 7,
              borderRadius: 999,
              overflow: 'hidden',
              backgroundColor: W.panel,
              marginTop: L.compact ? 6 : 8,
              flexGap: 2,
              flexGapColor: W.bgDeep,
            }}
          >
            <FlexWidget style={{ flex: inW, backgroundColor: W.accent, height: 'match_parent' }} />
            <FlexWidget style={{ flex: outW, backgroundColor: W.danger, height: 'match_parent' }} />
          </FlexWidget>
        ) : null}

        <FlexWidget style={{ flexDirection: 'row', flexGap: L.compact ? 6 : 8, marginTop: L.compact ? 6 : 8 }}>
          <FlexWidget
            style={{
              flex: 1,
              backgroundColor: W.panel,
              borderRadius: L.compact ? 10 : 12,
              padding: L.compact ? 8 : 10,
            }}
          >
            <TextWidget text="IN" style={{ fontSize: L.label, fontWeight: '800', color: W.muted }} />
            <TextWidget
              text={incomeLabel}
              maxLines={1}
              truncate="END"
              style={{
                fontSize: L.compact ? 13 : 15,
                fontWeight: '800',
                color: W.accentSoft,
                adjustsFontSizeToFit: true,
                marginTop: 3,
              }}
            />
          </FlexWidget>
          <FlexWidget
            style={{
              flex: 1,
              backgroundColor: W.panel,
              borderRadius: L.compact ? 10 : 12,
              padding: L.compact ? 8 : 10,
            }}
          >
            <TextWidget text="OUT" style={{ fontSize: L.label, fontWeight: '800', color: W.muted }} />
            <TextWidget
              text={expenseLabel}
              maxLines={1}
              truncate="END"
              style={{
                fontSize: L.compact ? 13 : 15,
                fontWeight: '800',
                color: W.danger,
                adjustsFontSizeToFit: true,
                marginTop: 3,
              }}
            />
          </FlexWidget>
        </FlexWidget>

        <FlexWidget
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: L.compact ? 6 : 8,
          }}
        >
          <TextWidget text="Net" style={{ fontSize: L.label, fontWeight: '700', color: W.muted }} />
          <TextWidget
            text={truncate(netLabel, 18)}
            maxLines={1}
            style={{
              fontSize: L.body,
              fontWeight: '800',
              color: netPositive ? W.accentSoft : W.danger,
              adjustsFontSizeToFit: true,
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  )
}
