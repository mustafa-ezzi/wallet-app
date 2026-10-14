/** "Hey Trai" only counts at the start of a phrase the app is already listening for. */

const WAKE = /^(?:hey|hi|hello|ok|okay)[\s,]+(?:trai|tray|try|tri)\b[\s,!.?-]*(.*)$/i

export function wakeCommand(transcript: string): string | null {
  const text = transcript.replace(/\s+/g, ' ').trim()
  const match = WAKE.exec(text)
  if (!match) return null
  return match[1].replace(/\s+/g, ' ').trim().slice(0, 500)
}
