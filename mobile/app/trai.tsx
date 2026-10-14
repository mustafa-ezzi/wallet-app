import { useEffect } from 'react'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { queueTraiAsk } from '@/src/lib/traiLaunch'

const QUESTIONS: Record<string, string> = {
  recent: 'What was my recent transaction?',
  balance: "What's my balance?",
  month: 'How was my month?',
}

/** Home-screen Trai widget opens the chat here. */
export default function TraiLink() {
  const params = useLocalSearchParams<{ ask?: string | string[] }>()
  const ask = Array.isArray(params.ask) ? params.ask[0] : params.ask
  const message = QUESTIONS[ask || ''] || ''
  useEffect(() => {
    queueTraiAsk(message)
  }, [message])
  return <Redirect href="/(tabs)" />
}
