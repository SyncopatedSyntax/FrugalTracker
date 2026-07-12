import type { BackupFile } from '@/lib/backup'
import type { AppTheme } from '@/lib/palette'

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
  /** `amount` converted to the base currency, locked in at save/edit time so
   * later exchange-rate changes never rewrite historical totals. Kept in
   * `currency`'s own base-relative units — rescaled in place if the base
   * currency itself changes (see `changeBaseCurrency`). Equals `amount` when
   * `currency` is already the base. */
  baseAmount: number
  /** The rate applied to produce `baseAmount`: 1 unit of `currency` = baseRate
   * units of the base currency, at lock-in time. 1 when currency is base. */
  baseRate: number
}

export interface Tag {
  id: string
  name: string
  usageCount: number
  /** Timestamp of the most recent time this tag was added to a transaction. */
  lastUsedAt: number
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

/** Inline = operators + AC/%/= live on the amount pad; full = a calc button
 * opens a standalone calculator screen (with parentheses). */
export type CalculatorMode = 'inline' | 'full'

/** Which edge the amount keypad hugs for one-handed use on big phones. */
export type KeypadReach = 'center' | 'left' | 'right'

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
  /** How math folds into the amount step. */
  calculatorMode: CalculatorMode
  /** One-handed keypad alignment for large screens. */
  keypadReach: KeypadReach
  /** Emoji the user has added to the category icon picker, beyond the
   * built-in starting set — grows over time, included in backups. */
  customEmojis: string[]
  /** App-wide color theme — both the app's own surface/accent colors and the
   * category color palette offered when picking a category color. Doesn't
   * retroactively recolor already-assigned categories. */
  appTheme: AppTheme
}

export interface Rate {
  /** ISO 4217 code (primary key). */
  currency: string
  /** Value of 1 unit of `currency` expressed in the base currency. */
  rate: number
  updatedAt: number
}

/** Snapshot of the user's real data, held only while Demo Mode is active (see
 * `db/demoMode.ts`) — a single row, in its own table so it's never touched by
 * the demo-data swap or included in JSON backups. */
export interface DemoSnapshot {
  id: 'realData'
  data: BackupFile
  savedAt: number
}
