import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import { transcriptMessage, voiceErrorLine } from '@/src/lib/traiVoice'

type Props = {
  busy: boolean
  primary: string
  border: string
  stopRef: MutableRefObject<() => void>
  onTranscript: (text: string) => void
  onPartial: (text: string) => void
  onNotice: (text: string) => void
  onListening: (listening: boolean) => void
}

/** Device speech-to-text. The recording stays on the phone; Trai only receives the words. */
export function TraiMicButton({
  busy,
  primary,
  border,
  stopRef,
  onTranscript,
  onPartial,
  onNotice,
  onListening,
}: Props) {
  const [listening, setListening] = useState(false)
  const heardRef = useRef('')
  const ignoreEndRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)
  const onPartialRef = useRef(onPartial)
  const onNoticeRef = useRef(onNotice)
  const onListeningRef = useRef(onListening)
  onTranscriptRef.current = onTranscript
  onPartialRef.current = onPartial
  onNoticeRef.current = onNotice
  onListeningRef.current = onListening

  const halt = () => {
    ignoreEndRef.current = true
    setListening(false)
    onListeningRef.current(false)
    try {
      ExpoSpeechRecognitionModule.abort()
    } catch {
      // Recognition was not running.
    }
  }
  stopRef.current = halt

  useEffect(() => () => {
    ignoreEndRef.current = true
    try {
      ExpoSpeechRecognitionModule.abort()
    } catch {
      // Recognition was not running.
    }
  }, [])

  useSpeechRecognitionEvent('start', () => {
    setListening(true)
    onListeningRef.current(true)
  })
  useSpeechRecognitionEvent('end', () => {
    setListening(false)
    onListeningRef.current(false)
    const message = heardRef.current
    heardRef.current = ''
    if (ignoreEndRef.current) {
      ignoreEndRef.current = false
      return
    }
    if (message) onTranscriptRef.current(message)
  })
  useSpeechRecognitionEvent('result', (event) => {
    const message = transcriptMessage(event.results?.[0]?.transcript || '')
    heardRef.current = message
    onPartialRef.current(message)
  })
  useSpeechRecognitionEvent('error', (event) => {
    const keepTranscript = event.error === 'no-speech' || event.error === 'speech-timeout'
    if (!keepTranscript) heardRef.current = ''
    const line = voiceErrorLine(event.error)
    if (line && !heardRef.current) onNoticeRef.current(line)
  })

  const toggle = async () => {
    if (busy) return
    if (listening) {
      ExpoSpeechRecognitionModule.stop()
      return
    }
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        onNoticeRef.current(voiceErrorLine('unavailable') || '')
        return
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!permission.granted) {
        onNoticeRef.current(voiceErrorLine('not-allowed') || '')
        return
      }
      heardRef.current = ''
      ignoreEndRef.current = false
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
      })
    } catch {
      onNoticeRef.current(voiceErrorLine('unavailable') || '')
    }
  }

  return (
    <Pressable
      style={[styles.mic, { borderColor: listening ? '#f97316' : border, backgroundColor: listening ? '#f97316' : 'transparent', opacity: busy ? 0.5 : 1 }]}
      disabled={busy}
      onPress={() => void toggle()}
      accessibilityLabel={listening ? 'Stop and send' : 'Speak to Trai'}
    >
      <Ionicons name={listening ? 'stop' : 'mic'} size={18} color={listening ? '#fff' : primary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  mic: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
})
