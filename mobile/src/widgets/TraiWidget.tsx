'use no memo'

import React from 'react'
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget'
import { truncate, widgetLayout, type WidgetSize } from './widgetTheme'

const traiIcon = require('../../assets/images/trai-icon.jpg')

export const TRAI_MOOD_COUNT = 4

const MOODS = ['Hello', 'Counting', 'Found it', 'Your turn']

export type TraiWidgetData = {
  lines: string[]
}

type Ask = 'recent' | 'balance' | 'month'

const ASKS: { label: string; ask: Ask }[] = [
  { label: 'Latest', ask: 'recent' },
  { label: 'Balance', ask: 'balance' },
  { label: 'Month', ask: 'month' },
]

function bubble(lines: string[], mood: number): string {
  const list = lines.length ? lines : ['Poke me.']
  const index = ((mood % list.length) + list.length) % list.length
  return list[index]
}

/** Home-screen Trai. Poke the robot to change the line. The buttons open the chat. */
export function TraiWidget({
  lines,
  mood = 0,
  size,
}: TraiWidgetData & { mood?: number; size?: WidgetSize }) {
  const L = widgetLayout(size)
  const next = (mood + 1) % TRAI_MOOD_COUNT
  const face = L.micro ? 36 : 52
  const showButtons = L.height >= 128

  return (
    <FlexWidget
      accessibilityLabel="Trai"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#ecfdf5',
        borderRadius: L.radius,
        borderWidth: 1,
        borderColor: '#a7f3d0',
        padding: L.pad,
        flexGap: 8,
        overflow: 'hidden',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
        <ImageWidget
          image={traiIcon}
          imageWidth={face}
          imageHeight={face}
          radius={face / 2}
          resizeMode="cover"
          clickAction="trai-poke"
          clickActionData={{ mood: next }}
          style={{ width: face, height: face }}
        />
        <FlexWidget
          clickAction="trai-poke"
          clickActionData={{ mood: next }}
          style={{
            flex: 1,
            flexDirection: 'column',
            backgroundColor: '#ffffff',
            borderRadius: 16,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
        >
          <TextWidget
            text={MOODS[((mood % TRAI_MOOD_COUNT) + TRAI_MOOD_COUNT) % TRAI_MOOD_COUNT]}
            style={{ fontSize: 10, fontWeight: '800', color: '#059669' }}
          />
          <TextWidget
            text={truncate(bubble(lines, mood), L.wide ? 72 : 46)}
            maxLines={2}
            truncate="END"
            style={{ fontSize: L.compact ? 12 : 13, fontWeight: '700', color: '#064e3b', marginTop: 2 }}
          />
        </FlexWidget>
      </FlexWidget>
      {showButtons ? (
        <FlexWidget style={{ flexDirection: 'row', flexGap: 6, width: 'match_parent' }}>
          {ASKS.map(item => (
            <FlexWidget
              key={item.ask}
              clickAction="OPEN_URI"
              clickActionData={{ uri: `wallettrails://trai?ask=${item.ask}` }}
              style={{
                flex: 1,
                backgroundColor: '#047857',
                borderRadius: 999,
                paddingVertical: 7,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TextWidget
                text={item.label}
                style={{ fontSize: 11, fontWeight: '800', color: '#ffffff' }}
              />
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  )
}
