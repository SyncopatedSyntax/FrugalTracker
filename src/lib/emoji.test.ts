import { describe, expect, it } from 'vitest'
import { firstGrapheme } from './emoji'

describe('firstGrapheme', () => {
  it('returns a simple single-codepoint emoji unchanged', () => {
    expect(firstGrapheme('🍔')).toBe('🍔')
  })

  it('takes only the first of several emoji', () => {
    expect(firstGrapheme('🍔🍕')).toBe('🍔')
  })

  it('keeps a ZWJ family sequence intact as one grapheme', () => {
    const family = '👨‍👩‍👧‍👦'
    expect(firstGrapheme(family)).toBe(family)
  })

  it('keeps a flag (regional indicator pair) intact', () => {
    expect(firstGrapheme('🇯🇵JP')).toBe('🇯🇵')
  })

  it('keeps a skin-tone-modified emoji intact', () => {
    expect(firstGrapheme('👍🏽 nice')).toBe('👍🏽')
  })

  it('falls back to the first plain character for non-emoji text', () => {
    expect(firstGrapheme('hello world')).toBe('h')
  })

  it('returns an empty string for empty input', () => {
    expect(firstGrapheme('')).toBe('')
  })
})
