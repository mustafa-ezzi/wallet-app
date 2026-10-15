/** Speech becomes a normal Trai message. Nothing audio is kept. */

export function transcriptMessage(transcript: string): string {
  return transcript.replace(/\s+/g, ' ').trim().slice(0, 500)
}

export function handsFreeAfter(result: { saved?: boolean; draft_id?: number; action?: { action?: string } | null }): boolean {
  if (result.saved) return false
  const action = result.action?.action
  if (action === 'ask') return true
  if (result.draft_id && action && action !== 'refuse') return true
  return false
}

export function stopHandsFree(transcript: string): boolean {
  const text = transcript.replace(/[.!?]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  return /^(?:stop listening|stop|never mind|nevermind|that is enough|thats enough)$/.test(text)
}

export function voiceErrorLine(code: string): string | null {
  if (code === 'aborted') return null
  if (code === 'not-allowed') return 'The microphone stayed off. Typing still works.'
  if (code === 'no-speech' || code === 'speech-timeout') {
    return "I didn't catch that. Try again, or type it."
  }
  if (code === 'unavailable' || code === 'language-not-supported' || code === 'service-not-allowed') {
    return "Voice isn't available here. Typing still works."
  }
  return "I couldn't hear that. Typing still works."
}
