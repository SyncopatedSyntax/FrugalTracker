import { describe, expect, it } from 'vitest'
import { APP_THEMES, CATEGORY_PALETTES, categoryPalette, paletteColor, type AppTheme } from './palette'

describe('APP_THEMES / CATEGORY_PALETTES', () => {
  it('has a category palette for every listed theme', () => {
    for (const t of APP_THEMES) {
      expect(CATEGORY_PALETTES[t.id]).toBeDefined()
      expect(CATEGORY_PALETTES[t.id].length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate colors within a single theme palette', () => {
    for (const t of APP_THEMES) {
      const colors = CATEGORY_PALETTES[t.id]
      expect(new Set(colors).size).toBe(colors.length)
    }
  })
})

describe('categoryPalette', () => {
  it('returns the matching theme palette', () => {
    expect(categoryPalette('coral')).toBe(CATEGORY_PALETTES.coral)
  })

  it('falls back to sage for an unrecognized value (e.g. an old backup)', () => {
    expect(categoryPalette('made-up' as AppTheme)).toBe(CATEGORY_PALETTES.sage)
  })
})

describe('paletteColor', () => {
  it('indexes into the theme palette', () => {
    expect(paletteColor('botanical', 0)).toBe(CATEGORY_PALETTES.botanical[0])
    expect(paletteColor('botanical', 2)).toBe(CATEGORY_PALETTES.botanical[2])
  })

  it('cycles once the index exceeds the palette length', () => {
    const len = CATEGORY_PALETTES.ocean.length
    expect(paletteColor('ocean', len)).toBe(CATEGORY_PALETTES.ocean[0])
    expect(paletteColor('ocean', len + 3)).toBe(CATEGORY_PALETTES.ocean[3])
  })
})
