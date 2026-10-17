import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import { wakeCommand } from '@/src/lib/traiWake'

type Props = {
  paused: boolean
  onArmed: (armed: boolean) => void
  onWake: (command: string) => void
}

/** Listens for "Hey Trai" while WalletTrails is open and the chat is closed. */
export function TraiWakeListener({ paused, onArmed, onWake }: Props) {
  const pausedRef = useRef(paused)
  const onArmedRef = useRef(onArmed)
  const onWakeRef = useRef(onWake)
  const shouldListen = useRef(false)
  const recognizing = useRef(false)
  const denied = useRef(false)
  const pendingWake = useRef<string | null>(null)
  const heardWake = useRef<string | null>(null)
  const handed = useRef(false)
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  pausedRef.current = paused
  onArmedRef.current = onArmed
  onWakeRef.current = onWake

  const clearRestart = () => {
    if (restartTimer.current) clearTimeout(restartTimer.current)
    restartTimer.current = null
  }

  const clearQuiet = () => {
    if (quietTimer.current) clearTimeout(quietTimer.current)
    quietTimer.current = null
  }

  const deliverWake = (command: string) => {
    if (handed.current || pausedRef.current) return
    handed.current = true
    clearQuiet()
    clearRestart()
    pendingWake.current = null
    heardWake.current = null
    shouldListen.current = false
    recognizing.current = false
    onArmedRef.current(false)
    onWakeRef.current(command)
  }

  const halt = (stopRecognizer: boolean) => {
    clearRestart()
    clearQuiet()
    recognizing.current = false
    onArmedRef.current(false)
    if (!stopRecognizer) return
    try {
      ExpoSpeechRecognitionModule.abort()
    } catch {
      // Recognition was not running.
    }
  }

  const arm = async () => {
    if (!shouldListen.current || recognizing.current || denied.current || pausedRef.current) return
    handed.current = false
    try {
      const current = await ExpoSpeechRecognitionModule.getPermissionsAsync()
      if (!current.granted) {
        if (current.canAskAgain === false) {
          denied.current = true
          shouldListen.current = false
          onArmedRef.current(false)
          return
        }
        const asked = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
        if (!asked.granted) {
          denied.current = true
          shouldListen.current = false
          onArmedRef.current(false)
          return
        }
      }
      if (!shouldListen.current || recognizing.current || pausedRef.current) return
      onArmedRef.current(true)
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: false,
        contextualStrings: ['hey Trai', 'hey tray', 'hey try', 'Trai'],
      })
    } catch {
      if (shouldListen.current) schedule()
    }
  }

  const schedule = () => {
    clearRestart()
    if (!shouldListen.current || pausedRef.current) return
    restartTimer.current = setTimeout(() => {
      void arm()
    }, 400)
  }

  useSpeechRecognitionEvent('start', () => {
    recognizing.current = true
    onArmedRef.current(true)
  })
  useSpeechRecognitionEvent('end', () => {
    recognizing.current = false
    const command = pendingWake.current ?? heardWake.current
    if (command !== null && !pausedRef.current) {
      deliverWake(command)
      return
    }
    if (shouldListen.current && !pausedRef.current) schedule()
  })
  useSpeechRecognitionEvent('error', (event) => {
    recognizing.current = false
    if (event.error === 'aborted') return
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'language-not-supported') {
      denied.current = true
      shouldListen.current = false
      onArmedRef.current(false)
      return
    }
    if (shouldListen.current && !pausedRef.current) schedule()
  })
  useSpeechRecognitionEvent('result', (event) => {
    if (pausedRef.current || !shouldListen.current || pendingWake.current !== null) return
    const command = wakeCommand(event.results?.[0]?.transcript || '')
    if (command === null) {
      heardWake.current = null
      clearQuiet()
      return
    }
    heardWake.current = command
    clearQuiet()
    if (event.isFinal) {
      pendingWake.current = command
      shouldListen.current = false
      try {
        ExpoSpeechRecognitionModule.abort()
      } catch {
        deliverWake(command)
      }
      return
    }
    // A normal-volume "hey Trai" often never becomes a final result. Open once the phrase sits still.
    quietTimer.current = setTimeout(() => {
      if (heardWake.current !== command || pausedRef.current || !shouldListen.current) return
      pendingWake.current = command
      shouldListen.current = false
      try {
        ExpoSpeechRecognitionModule.abort()
      } catch {
        deliverWake(command)
      }
    }, 450)
  })

  useEffect(() => {
    const sync = (state: string) => {
      const foreground = state === 'active'
      const active = foreground && !paused && !denied.current
      shouldListen.current = active
      if (active) void arm()
      else halt(!foreground)
    }
    sync(AppState.currentState)
    const sub = AppState.addEventListener('change', sync)
    return () => {
      sub.remove()
      shouldListen.current = false
      // Hands-free already owns the microphone. Aborting here cuts off the sentence after "Hey Trai".
      halt(!pausedRef.current)
    }
  }, [paused])

  return null
}
