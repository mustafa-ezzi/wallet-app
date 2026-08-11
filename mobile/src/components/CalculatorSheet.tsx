import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing } from '@/src/theme/colors'

/** Evaluate a simple +,-,*,/ expression without using eval(). */
export function evalExpression(expr: string): number | null {
  const clean = expr.replace(/[×xX]/g, '*').replace(/÷/g, '/').trim()
  if (!clean) return null
  const tokens = clean.match(/(\d+\.?\d*|\.\d+|[+\-*/])/g)
  if (!tokens) return null

  // Drop a trailing operator (e.g. "12+")
  while (tokens.length && /[+\-*/]/.test(tokens[tokens.length - 1])) tokens.pop()
  if (!tokens.length) return null

  const nums: number[] = []
  const ops: string[] = []
  let expectNumber = true
  for (const t of tokens) {
    if (/[+\-*/]/.test(t)) {
      if (expectNumber) return null
      ops.push(t)
      expectNumber = true
    } else {
      nums.push(parseFloat(t))
      expectNumber = false
    }
  }
  if (nums.length !== ops.length + 1) return null

  // First pass: * and /
  const n2: number[] = [nums[0]]
  const o2: string[] = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const next = nums[i + 1]
    if (op === '*') n2[n2.length - 1] *= next
    else if (op === '/') n2[n2.length - 1] = next === 0 ? NaN : n2[n2.length - 1] / next
    else {
      o2.push(op)
      n2.push(next)
    }
  }
  // Second pass: + and -
  let result = n2[0]
  for (let i = 0; i < o2.length; i++) {
    if (o2[i] === '+') result += n2[i + 1]
    else result -= n2[i + 1]
  }
  if (!Number.isFinite(result)) return null
  return Math.round(result * 100) / 100
}

const KEYS = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['.', '0', '=', '+'],
]

function opGlyph(k: string) {
  if (k === '*') return '×'
  if (k === '/') return '÷'
  return k
}

export function CalculatorSheet({
  visible,
  initial,
  onApply,
  onClose,
}: {
  visible: boolean
  initial?: string
  onApply: (value: string) => void
  onClose: () => void
}) {
  const colors = useColors()
  const [expr, setExpr] = useState('')

  useEffect(() => {
    if (visible) setExpr(initial && initial !== '0' ? initial : '')
  }, [visible, initial])

  const preview = evalExpression(expr)
  const hasOp = /[+\-*/]/.test(expr)

  const press = (k: string) => {
    if (k === '=') {
      const v = evalExpression(expr)
      if (v != null) setExpr(String(v))
      return
    }
    if (/[+\-*/]/.test(k)) {
      setExpr((prev) => {
        if (!prev) return k === '-' ? '-' : prev
        if (/[+\-*/]$/.test(prev)) return prev.slice(0, -1) + k
        return prev + k
      })
      return
    }
    if (k === '.') {
      setExpr((prev) => {
        const seg = prev.split(/[+\-*/]/).pop() ?? ''
        if (seg.includes('.')) return prev
        return prev === '' ? '0.' : prev + '.'
      })
      return
    }
    setExpr((prev) => prev + k)
  }

  const backspace = () => setExpr((prev) => prev.slice(0, -1))

  const apply = () => {
    const v = evalExpression(expr)
    onApply(v != null ? String(v) : '')
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(160)} style={styles.backdropWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          style={[styles.card, { backgroundColor: colors.surface }]}
        >
          <View style={[styles.display, { backgroundColor: colors.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.exprText} numberOfLines={1}>
                {expr || '0'}
              </Text>
              {hasOp && preview != null ? (
                <Text style={styles.previewText} numberOfLines={1}>
                  = {preview.toLocaleString()}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={backspace} hitSlop={10} style={styles.backspace}>
              <FontAwesome name="long-arrow-left" size={18} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.pad}>
            {KEYS.map((row, ri) => (
              <View key={ri} style={styles.padRow}>
                {row.map((k) => {
                  const isOp = /[+\-*/=]/.test(k)
                  return (
                    <Pressable
                      key={k}
                      onPress={() => press(k)}
                      style={({ pressed }) => [
                        styles.key,
                        { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.keyText,
                          { color: isOp ? colors.primary : colors.text },
                          k === '=' && { color: colors.primary, fontWeight: '900' },
                        ]}
                      >
                        {opGlyph(k)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.actionBtn} hitSlop={8}>
              <Text style={[styles.actionText, { color: colors.danger }]}>CANCEL</Text>
            </Pressable>
            <Pressable onPress={apply} style={styles.actionBtn} hitSlop={8}>
              <Text style={[styles.actionText, { color: colors.primary }]}>APPLY</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  display: {
    minHeight: 88,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  exprText: { color: '#fff', fontSize: 30, fontWeight: '800', textAlign: 'right' },
  previewText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700', textAlign: 'right', marginTop: 2 },
  backspace: { marginLeft: spacing.md, padding: 6 },
  pad: { paddingVertical: spacing.sm },
  padRow: { flexDirection: 'row' },
  key: {
    flex: 1,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    margin: 2,
  },
  keyText: { fontSize: 24, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  actionBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  actionText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
})
