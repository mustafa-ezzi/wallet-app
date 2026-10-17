/** "Hey Trai" only counts at the start of a phrase the page is already listening for. */

const WAKE = /^(?:hey|hi|hello|ok|okay|he)[\s,]*(?:trai|tray|trey|troy|try|tri|tree)i?\b[\s,!.?-]*(.*)$/i

export function wakeCommand(transcript: string): string | null {
  const text = transcript
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(hey|hi|hello|ok|okay)(trai|tray|trey|troy|try|tri|tree)\b/i, '$1 $2')
  const match = WAKE.exec(text)
  if (!match) return null
  return match[1].replace(/\s+/g, ' ').trim().slice(0, 500)
}
