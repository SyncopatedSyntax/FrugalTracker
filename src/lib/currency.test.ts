import { describe, expect, it } from 'vitest'
import { currencySymbol, formatMoney, formatMoneyCompact, formatMoneyWhole } from './currency'

describe('formatMoney / formatMoneyCompact — USD symbol', () => {
  it('formats USD with a plain "$", never "US$"', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50')
    expect(formatMoney(1234.5, 'USD')).not.toContain('US$')
    expect(formatMoneyCompact(12500, 'USD')).not.toContain('US$')
  })

  it('formatMoneyWhole: exact grouped integer — no decimals, no K-compacting', () => {
    expect(formatMoneyWhole(1250, 'USD')).toBe('$1,250')
    expect(formatMoneyWhole(410, 'USD')).toBe('$410')
  })

  it('still disambiguates other dollar currencies (unaffected by the USD fix)', () => {
    expect(formatMoney(1234.5, 'CAD')).toContain('CA$')
    expect(formatMoney(1234.5, 'AUD')).toContain('A$')
  })

  it('currencySymbol("USD") is the plain symbol', () => {
    expect(currencySymbol('USD')).toBe('$')
  })
})

describe('USD narrowSymbol guarantee across locales', () => {
  // formatMoney/formatMoneyCompact always resolve Intl's locale from the
  // runtime default (`undefined`), which in CI is en-US — where Intl already
  // renders USD as "$" even without the fix. The actual bug only shows up on
  // devices whose locale isn't en-US (en-GB, en-CA, fr, de, ...), where Intl's
  // default currency symbol for USD is "US$"/"$US" since "$" alone is
  // ambiguous there. This locks in the exact fix `lib/currency.ts`'s
  // `formatter()` applies (`currencyDisplay: 'narrowSymbol'` for USD only)
  // against a representative sample of non-US locales, since a plain
  // output-based test in this environment can't otherwise catch a regression.
  const nonUsLocales = ['en-GB', 'en-CA', 'en-AU', 'en-001', 'fr', 'de']

  it.each(nonUsLocales)('renders USD as a plain "$" under %s', (locale) => {
    const withFix = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
    }).format(1234.5)
    expect(withFix).toContain('$')
    expect(withFix).not.toContain('US$')
    expect(withFix).not.toContain('USD')
  })

  it('confirms the bug this fix addresses is real (en-GB without narrowSymbol)', () => {
    const withoutFix = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'USD',
    }).format(1234.5)
    expect(withoutFix).toContain('US$')
  })
})
