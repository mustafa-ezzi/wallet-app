import { describe, expect, it } from 'vitest'
import { handsFreeAfter, stopHandsFree, transcriptMessage, voiceErrorLine } from './traiVoice'

describe('Trai voice', () => {
  it('turns a spoken sentence into the same text a typed sentence would send', () => {
    expect(transcriptMessage('  50 from cash for chips  ')).toBe('50 from cash for chips')
  })

  it('keeps a long transcript inside the message limit', () => {
    expect(transcriptMessage(` ${'a'.repeat(600)} `)).toHaveLength(500)
  })

  it('keeps the microphone open while Trai is waiting, and closes it after a save', () => {
    expect(handsFreeAfter({ action: { action: 'ask' } })).toBe(true)
    expect(handsFreeAfter({ draft_id: 4, action: { action: 'create_expense' } })).toBe(true)
    expect(handsFreeAfter({ saved: true, action: { action: 'create_expense' } })).toBe(false)
    expect(handsFreeAfter({ action: { action: 'month_summary' } })).toBe(false)
    expect(stopHandsFree('stop listening')).toBe(true)
    expect(stopHandsFree('yes save it')).toBe(false)
  })

  it('leaves typing available when the microphone is denied', () => {
    expect(voiceErrorLine('not-allowed')).toBe('The microphone stayed off. Typing still works.')
    expect(voiceErrorLine('speech-timeout')).toBe("I didn't catch that. Try again, or type it.")
    expect(voiceErrorLine('aborted')).toBeNull()
  })
})