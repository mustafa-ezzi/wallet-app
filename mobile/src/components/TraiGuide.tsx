import { useEffect, useState } from 'react'
import { DeviceEventEmitter, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { hasSeenTraiGuide, markTraiGuideSeen } from '@/src/features/traiGuide'
import { track } from '@/src/lib/analytics'
import { useColors } from '@/src/theme/ThemeContext'

const traiIcon = require('../../assets/images/trai-icon.jpg')

const STEPS = [
  {
    title: 'This is Trai',
    body: 'The green button at the bottom left is your bookkeeper. Tap it to type, or say Hey Trai while the app is open.',
  },
  {
    title: 'Say Hey Trai',
    body: 'Say “Hey Trai, add an expense of Rs 250.” Trai keeps listening. If it needs a wallet, say the name, like Cash or Meezan.',
  },
  {
    title: 'What Trai can do',
    body: 'Add an expense or income, mark a bill paid, or move money between your wallets. You can also ask “what’s my balance?” or “how was my month?”',
  },
  {
    title: 'It saves only when you say yes',
    body: 'Trai shows a card first. “Yes, save it” writes the row. “No” throws the card away. “Stop” only turns the microphone off.',
  },
]

const HOLE = 72
const ICON = 52

/** Local testing. Does not clear the “already seen” flag for a normal launch. */
export const FORCE_TRAI_GUIDE_EVENT = 'WalletTrails:force-trai-guide'

/**
 * One-time walkthrough on the first home screen. Rings the Trai button
 * and explains Hey Trai. Does not open the microphone.
 */
export function TraiGuide({ bottom }: { bottom: number }) {
  const colors = useColors()
  const { width, height } = useWindowDimensions()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        if (cancelled || (await hasSeenTraiGuide())) return
        track('trai_guide_shown')
        setVisible(true)
      })()
    }, 700)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FORCE_TRAI_GUIDE_EVENT, () => {
      setStep(0)
      setVisible(true)
    })
    return () => sub.remove()
  }, [])

  if (!visible) return null

  const holeLeft = Math.max(8, 20 - (HOLE - ICON) / 2)
  const holeBottom = Math.max(8, bottom - (HOLE - ICON) / 2)
  const holeTop = height - holeBottom - HOLE
  const current = STEPS[step]
  const last = step === STEPS.length - 1
  const dim = 'rgba(15, 31, 24, 0.72)'

  const finish = (skipped: boolean) => {
    setVisible(false)
    track('trai_guide_dismissed', { step: step + 1, skipped })
    void markTraiGuideSeen()
  }

  return (
    <View style={styles.fill} accessibilityViewIsModal>
      <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(0, holeTop), backgroundColor: dim }]} />
      <View pointerEvents="none" style={[styles.dim, { top: holeTop, left: 0, width: holeLeft, height: HOLE, backgroundColor: dim }]} />
      <View pointerEvents="none" style={[styles.dim, { top: holeTop, left: holeLeft + HOLE, right: 0, height: HOLE, backgroundColor: dim }]} />
      <View pointerEvents="none" style={[styles.dim, { top: holeTop + HOLE, left: 0, right: 0, bottom: 0, backgroundColor: dim }]} />

      <View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            left: holeLeft,
            bottom: holeBottom,
            width: HOLE,
            height: HOLE,
            borderRadius: HOLE / 2,
            borderColor: colors.primarySoft,
          },
        ]}
      >
        <Image source={traiIcon} style={styles.icon} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>
      <View style={[styles.holeBlock, { left: holeLeft, bottom: holeBottom, width: HOLE, height: HOLE, borderRadius: HOLE / 2 }]} />

      <View
        style={[
          styles.card,
          {
            bottom: holeBottom + HOLE + 16,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            maxWidth: Math.min(width - 32, 420),
          },
        ]}
      >
        <Text style={[styles.kicker, { color: colors.primary }]}>
          Trai  ·  {step + 1} of {STEPS.length}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{current.body}</Text>
        <View style={styles.dots}>
          {STEPS.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                { backgroundColor: index === step ? colors.primary : colors.borderStrong },
              ]}
            />
          ))}
        </View>
        <View style={styles.actions}>
          {last ? <View /> : (
            <Pressable onPress={() => finish(true)} hitSlop={8} accessibilityLabel="Skip the Trai guide">
              <Text style={[styles.skip, { color: colors.textMuted }]}>Skip</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              if (last) finish(false)
              else setStep(value => value + 1)
            }}
            style={[styles.next, { backgroundColor: colors.primary }]}
            accessibilityLabel={last ? 'Done with the Trai guide' : 'Next Trai tip'}
          >
            <Text style={styles.nextLabel}>{last ? 'Got it' : 'Next'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
  },
  dim: { position: 'absolute' },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#047857',
  },
  icon: { width: ICON, height: ICON, borderRadius: ICON / 2 },
  holeBlock: { position: 'absolute' },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
  },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  title: { marginTop: 6, fontSize: 20, fontWeight: '800' },
  body: { marginTop: 8, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 6, marginTop: 14 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  actions: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: { fontSize: 14, fontWeight: '700', paddingVertical: 8 },
  next: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  nextLabel: { color: '#fff', fontWeight: '800', fontSize: 15 },
})
