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

/** After a finished voice task, these answers mean Trai should sleep. */
export function declineAnother(transcript: string): boolean {
  const text = transcript.replace(/[.!?]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  return /^(?:no|no thanks|no thank you|no thankyou|nah|nope|nothing|nothing else|that is all|thats all|that is it|thats it|i am good|im good|all good|all done|thanks|thank you)$/.test(text)
}

/** Spoken line after a task is done, while the microphone stays open. */
export function anythingElse(reply: string): string {
  const text = reply.replace(/\s+/g, ' ').trim()
  const base = (text || 'Done.').replace(/[.?!]\s*$/, '')
  if (/anything else\??$/i.test(base)) return base.endsWith('?') ? base : `${base}?`
  return `${base}. Anything else?`
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
