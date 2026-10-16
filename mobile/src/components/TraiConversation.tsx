import { useEffect, useRef } from 'react'
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import { stopHandsFree, transcriptMessage, voiceErrorLine } from '@/src/lib/traiVoice'

type Props = {
  active: boolean
  busy: boolean
  prompt: string
  partial: string
  primary: string
  ink: string
  muted: string
  onTranscript: (text: string) => void
  onPartial: (text: string) => void
  onNotice: (text: string) => void
  onStop: (holdReply?: boolean) => void
  hints: string[]
  variant?: 'strip' | 'hidden'
}

/** One spoken turn at a time, then Trai asks the next question and listens again. */
export function TraiConversation({
  active,
  busy,
  prompt,
  partial,
  primary,
  ink,
  muted,
  onTranscript,
  onPartial,
  onNotice,
  onStop,
  hints,
  variant = 'strip',
}: Props) {
  const activeRef = useRef(active)
  const onTranscriptRef = useRef(onTranscript)
  const onPartialRef = useRef(onPartial)
  const onNoticeRef = useRef(onNotice)
  const onStopRef = useRef(onStop)
  const sentRef = useRef(false)
  const missesRef = useRef(0)
  const pulse = useRef(new Animated.Value(1)).current
  activeRef.current = active
  onTranscriptRef.current = onTranscript
  onPartialRef.current = onPartial
  onNoticeRef.current = onNotice
  onStopRef.current = onStop

  const halt = () => {
    try {
      ExpoSpeechRecognitionModule.abort()
    } catch {
      // Recognition was not running.
    }
  }

  const arm = async () => {
    if (!activeRef.current || sentRef.current) return
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        onNoticeRef.current(voiceErrorLine('unavailable') || '')
        onStopRef.current(true)
        return
      }
      const current = await ExpoSpeechRecognitionModule.getPermissionsAsync()
      if (!current.granted) {
        const asked = current.canAskAgain === false ? current : await ExpoSpeechRecognitionModule.requestPermissionsAsync()
        if (!asked.granted) {
          onNoticeRef.current(voiceErrorLine('not-allowed') || '')
          onStopRef.current(true)
          return
        }
      }
      if (!activeRef.current || sentRef.current) return
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
        contextualStrings: ['Trai', 'yes save it', 'save it', ...hints].slice(0, 12),
      })
    } catch {
      if (!activeRef.current) return
      onNoticeRef.current(voiceErrorLine('unavailable') || '')
      onStopRef.current(true)
    }
  }

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current) return
    const message = transcriptMessage(event.results?.[0]?.transcript || '')
    onPartialRef.current(message)
    if (!event.isFinal || !message || sentRef.current) return
    missesRef.current = 0
    sentRef.current = true
    halt()
    if (stopHandsFree(message)) {
      onStopRef.current()
      return
    }
    onTranscriptRef.current(message)
  })
  useSpeechRecognitionEvent('error', (event) => {
    if (!activeRef.current || event.error === 'aborted') return
    if (event.error === 'no-speech' || event.error === 'speech-timeout') return
    const line = voiceErrorLine(event.error)
    if (line) onNoticeRef.current(line)
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'language-not-supported') {
      onStopRef.current(true)
    }
  })
  useSpeechRecognitionEvent('end', () => {
    if (!activeRef.current || sentRef.current) return
    missesRef.current += 1
    if (missesRef.current >= 3) {
      missesRef.current = 0
      onNoticeRef.current(voiceErrorLine('no-speech') || '')
      onStopRef.current(true)
      return
    }
    setTimeout(() => {
      if (activeRef.current && !sentRef.current) void arm()
    }, 350)
  })

  useEffect(() => {
    if (!active) {
      sentRef.current = false
      halt()
      return
    }
    sentRef.current = false
    missesRef.current = 0
    const timer = setTimeout(() => {
      void arm()
    }, 350)
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') onStopRef.current()
    })
    return () => {
      clearTimeout(timer)
      sub.remove()
      halt()
    }
  }, [active])

  useEffect(() => {
    if (variant === 'hidden' || !active || busy) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [active, busy, pulse, variant])

  if (variant === 'hidden') return null

  return (
    <View style={styles.wrap}>
      <View style={styles.orbBlock}>
        <Animated.View
          style={[
            styles.ring,
            { borderColor: primary, transform: [{ scale: busy ? 1 : pulse }], opacity: busy ? 0.35 : 0.9 },
          ]}
        />
        <View style={[styles.core, { backgroundColor: primary }]} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: primary, fontWeight: '800', fontSize: 13 }}>
          {busy ? 'Trai is thinking…' : 'Listening'}
        </Text>
        <Text style={{ color: ink, fontSize: 13 }} numberOfLines={2}>
          {partial || prompt || 'Say the rest, or “yes save it”.'}
        </Text>
      </View>
      <Pressable onPress={onStop} accessibilityLabel="Stop listening" hitSlop={8}>
        <Text style={{ color: muted, fontWeight: '700' }}>Stop</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  orbBlock: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  core: { width: 14, height: 14, borderRadius: 7 },
})
