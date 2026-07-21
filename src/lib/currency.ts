export interface CurrencyInfo {
  code: string
  name: string
  symbol: string
}

/** Common currencies for the picker. Any ISO code still works for formatting. */
export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
]

const infoMap = new Map(CURRENCIES.map((c) => [c.code, c]))

export function currencyInfo(code: string): CurrencyInfo {
  return infoMap.get(code) ?? { code, name: code, symbol: code }
}

export function currencySymbol(code: string): string {
  return currencyInfo(code).symbol
}

const fmtCache = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = currency + JSON.stringify(opts)
  let f = fmtCache.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        // Outside en-US, Intl's default currency symbol for USD is "US$" (or
        // "$US", "USD"...), since "$" alone is ambiguous with other dollar
        // currencies in most locales. USD is unambiguous enough in practice
        // that the app always shows it as plain "$" regardless of locale —
        // narrowSymbol gives exactly that. Left as the (correctly
        // disambiguating, e.g. "CA$"/"A$") default for every other currency,
        // so multi-currency users can still tell dollar currencies apart.
        ...(currency === 'USD' ? { currencyDisplay: 'narrowSymbol' } : {}),
        ...opts,
      })
    } catch {
      f = new Intl.NumberFormat(undefined, opts)
    }
    fmtCache.set(key, f)
  }
  return f
}

/** Full currency-formatted string, e.g. "$1,234.50". */
export function formatMoney(amount: number, currency: string): string {
  return formatter(currency, {}).format(amount)
}

/** Whole-number currency, e.g. "$1,250" — for round figures like budget
 * suggestions, where decimals are noise and K-compacting would misstate the
 * exact amount the control fills in. */
export function formatMoneyWhole(amount: number, currency: string): string {
  return formatter(currency, { maximumFractionDigits: 0 }).format(amount)
}

/** Compact for tight spaces, e.g. "$1.2K". */
export function formatMoneyCompact(amount: number, currency: string): string {
  const abs = Math.abs(amount)
  if (abs >= 1000) {
    return formatter(currency, { notation: 'compact', maximumFractionDigits: 1 }).format(
      amount,
    )
  }
  return formatter(currency, { maximumFractionDigits: abs < 100 ? 2 : 0 }).format(amount)
}

const decimalsCache = new Map<string, number>()

/** Number of decimal places a currency conventionally uses (2, or 0 for JPY etc.). */
export function currencyDecimals(currency: string): number {
  let d = decimalsCache.get(currency)
  if (d === undefined) {
    try {
      const parts = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).resolvedOptions()
      d = parts.maximumFractionDigits ?? 2
    } catch {
      d = 2
    }
    decimalsCache.set(currency, d)
  }
  return d
}
