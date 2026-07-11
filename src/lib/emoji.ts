/** The first grapheme cluster of a string — i.e. exactly one visual
 * character, even for multi-codepoint emoji (ZWJ sequences, flags, skin-tone
 * modifiers). Used to turn a pasted emoji (or accidental extra text) into a
 * single icon instead of storing a whole string. */
export function firstGrapheme(s: string): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const first = segmenter.segment(s)[Symbol.iterator]().next()
    if (!first.done) return first.value.segment
  }
  // Fallback: at least keep surrogate pairs intact.
  return [...s][0] ?? s
}
