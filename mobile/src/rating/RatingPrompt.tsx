import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PrimaryButton } from '@/src/components/ui'
import api from '@/src/api/client'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'
import { track } from '@/src/lib/analytics'
import {
  markRatingDismissed,
  markRatingShown,
  markRatingSubmitted,
  prepareRatingPromptForTest,
  recordAppOpen,
} from './streak'
import { shareCashTrailLink } from './shareCashTrail'
import { CASHTRAIL_SHARE_URL } from './storage'

type Step = 'stars' | 'feedback' | 'share'

export const FORCE_RATING_EVENT = 'cashtrail:force-rating'

/**
 * Shows once after 4 consecutive calendar-day opens.
 * ≥4 stars → what’s nice / what to change; &lt;4 → troubles faced; then share link.
 * Settings can emit FORCE_RATING_EVENT to preview without waiting.
 */
export function RatingPrompt() {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => makeStyles(colors), [colors])

  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<Step>('stars')
  const [stars, setStars] = useState(0)
  const [nice, setNice] = useState('')
  const [change, setChange] = useState('')
  const [trouble, setTrouble] = useState('')
  const [busy, setBusy] = useState(false)

  const openPrompt = useCallback(async () => {
    await markRatingShown()
    track('rating_prompt_shown')
    setStep('stars')
    setStars(0)
    setNice('')
    setChange('')
    setTrouble('')
    setVisible(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        const { shouldShowPrompt } = await recordAppOpen()
        if (cancelled || !shouldShowPrompt) return
        await openPrompt()
      })()
    }, 1800)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [openPrompt])

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FORCE_RATING_EVENT, () => {
      void (async () => {
        await prepareRatingPromptForTest()
        await openPrompt()
      })()
    })
    return () => sub.remove()
  }, [openPrompt])

  const closeDismiss = useCallback(async () => {
    await markRatingDismissed()
    track('rating_prompt_dismissed')
    setVisible(false)
  }, [])

  const onPickStars = (n: number) => {
    setStars(n)
  }

  const goFeedback = () => {
    if (stars < 1) return
    setStep('feedback')
  }

  const submitFeedback = async () => {
    setBusy(true)
    try {
      const body =
        stars >= 4
          ? `Rating: ${stars}/5\n\nWhat’s nice:\n${nice.trim() || '—'}\n\nWhat should change:\n${change.trim() || '—'}`
          : `Rating: ${stars}/5\n\nTroubles faced:\n${trouble.trim() || '—'}`

      try {
        await api.post('/support/threads/', {
          subject: `App rating ${stars}/5`,
          body,
          category: 'other',
        })
      } catch {
        /* offline / rate limit — still continue */
      }

      await markRatingSubmitted(stars)
      track('rating_prompt_submitted', { stars })
      setStep('share')
    } finally {
      setBusy(false)
    }
  }

  const onShare = async () => {
    setBusy(true)
    try {
      await shareCashTrailLink()
      track('rating_prompt_shared')
    } finally {
      setBusy(false)
      setVisible(false)
    }
  }

  const onSkipShare = () => {
    setVisible(false)
  }

  if (!visible) return null

  const bottomPad = Math.max(insets.bottom, 16)
  const cardAlign = step === 'feedback' ? 'center' : 'flex-end'

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void closeDismiss()}>
      <KeyboardAvoidingView
        style={styles.avoidRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={[styles.backdrop, { justifyContent: cardAlign }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => void closeDismiss()} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: bottomPad },
            ]}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              {step === 'stars' ? (
                <>
                  <Text style={[styles.kicker, { color: colors.primary }]}>Quick check-in</Text>
                  <Text style={[styles.title, { color: colors.text }]}>How’s CashTrail?</Text>
                  <Text style={[styles.sub, { color: colors.textMuted }]}>
                    You’ve opened the app a few days in a row — we’d love a quick rating.
                  </Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Pressable
                        key={n}
                        onPress={() => onPickStars(n)}
                        hitSlop={6}
                        style={styles.starBtn}
                      >
                        <Text style={[styles.star, { color: n <= stars ? '#F5A623' : colors.borderStrong }]}>
                          ★
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <PrimaryButton title="Continue" onPress={goFeedback} disabled={stars < 1} />
                  <Pressable onPress={() => void closeDismiss()} style={styles.later}>
                    <Text style={{ color: colors.textMuted, fontWeight: '700', textAlign: 'center' }}>
                      Not now
                    </Text>
                  </Pressable>
                </>
              ) : null}

              {step === 'feedback' ? (
                <>
                  <Text style={[styles.title, { color: colors.text }]}>
                    {stars >= 4 ? 'Glad it’s working' : 'Sorry it’s rough'}
                  </Text>
                  {stars >= 4 ? (
                    <>
                      <Text style={[styles.label, { color: colors.textMuted }]}>What’s nice?</Text>
                      <TextInput
                        value={nice}
                        onChangeText={setNice}
                        placeholder="What do you like?"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                      />
                      <Text style={[styles.label, { color: colors.textMuted }]}>What should change?</Text>
                      <TextInput
                        value={change}
                        onChangeText={setChange}
                        placeholder="Any improvements?"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={[styles.label, { color: colors.textMuted }]}>What troubles did you face?</Text>
                      <TextInput
                        value={trouble}
                        onChangeText={setTrouble}
                        placeholder="Tell us what went wrong…"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, minHeight: 110 }]}
                      />
                    </>
                  )}
                  <PrimaryButton title="Next" onPress={() => void submitFeedback()} loading={busy} />
                </>
              ) : null}

              {step === 'share' ? (
                <>
                  <Text style={[styles.title, { color: colors.text }]}>Thanks</Text>
                  <Text style={[styles.sub, { color: colors.textMuted }]}>
                    Know someone who needs clearer money tracking? Share CashTrail.
                  </Text>
                  <Text style={[styles.linkHint, { color: colors.primaryDark }]} numberOfLines={1}>
                    {CASHTRAIL_SHARE_URL}
                  </Text>
                  <PrimaryButton title="Share link" onPress={() => void onShare()} loading={busy} />
                  <Pressable onPress={onSkipShare} style={styles.later}>
                    <Text style={{ color: colors.textMuted, fontWeight: '700', textAlign: 'center' }}>
                      Done
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function makeStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    avoidRoot: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: spacing.md,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'flex-end',
    },
    card: {
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.lg,
      gap: 4,
    },
    kicker: {
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    title: {
      ...typography.title,
      fontSize: 22,
      marginBottom: 6,
    },
    sub: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
    },
    starsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 18,
      marginTop: 4,
    },
    starBtn: { padding: 4 },
    star: { fontSize: 36 },
    label: {
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      borderWidth: 1,
      borderRadius: radii.md,
      padding: 12,
      minHeight: 72,
      textAlignVertical: 'top',
      fontSize: 15,
      marginBottom: 4,
    },
    linkHint: {
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 14,
      marginTop: 4,
    },
    later: { paddingVertical: 14 },
  })
}
