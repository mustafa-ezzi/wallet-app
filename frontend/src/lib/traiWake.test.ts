import { describe, expect, it } from 'vitest'
import { wakeCommand } from './traiWake'

describe('Hey Trai', () => {
  it('keeps the rest of the sentence after the wake phrase', () => {
    expect(wakeCommand('hey trai add an expense of 250')).toBe('add an expense of 250')
  })

  it('treats the wake phrase alone as ready, with nothing else to send', () => {
    expect(wakeCommand('Hey Trai')).toBe('')
  })

  it('ignores a sentence that does not start with the wake phrase', () => {
    expect(wakeCommand('add hey trai later')).toBeNull()
  })
})
