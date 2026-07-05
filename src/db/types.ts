export type TxType = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  /** Emoji used as the category glyph. */
  icon: string
  /** Hex color, e.g. "#ef4444". */
  color: string
  type: TxType
  sortOrder: number
  /** Bumped on each use so most-used categories surface first. */
  usageCount: number
  /** 0 = active, 1 = archived (numeric so Dexie can index it). */
  isArchived: 0 | 1
}

export interface Transaction {
  id: string
  type: TxType
  /** Positive magnitude, expressed in `currency`. */
  amount: number
  /** ISO 4217 code, e.g. "USD". */
  currency: string
  categoryId: string
  note: string
  tags: string[]
  /** Local calendar date, "YYYY-MM-DD". */
  date: string
  createdAt: number
  updatedAt: number
}

export interface Tag {
  id: string
  name: string
  usageCount: number
}

export interface Budget {
  id: string
  /** null = overall budget across all categories. */
  categoryId: string | null
  period: 'monthly'
  /** Limit expressed in base currency. */
  amount: number
  currency: string
}

export type ThemePref = 'light' | 'dark' | 'system'

export interface Settings {
  id: 'app'
  baseCurrency: string
  theme: ThemePref
  /** 0 = Sunday, 1 = Monday. */
  firstDayOfWeek: 0 | 1
  /** Whether the Quick-Add keypad decimal step is enabled (reserved). */
  seededDefaults: 0 | 1
  /** Net-worth starting balance, in base currency, as of `openingBalanceDate`. */
  openingBalance: number
  /** ISO date the opening balance applies from; '' = use earliest transaction. */
  openingBalanceDate: string
}

export interface Rate {
  /** ISO 4217 code (primary key). */
  currency: string
  /** Value of 1 unit of `currency` expressed in the base currency. */
  rate: number
  updatedAt: number
}
