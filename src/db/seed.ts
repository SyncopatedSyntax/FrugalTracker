import { db } from './db'
import type { Category, Settings, TxType } from './types'
import { uid } from '@/lib/id'

interface SeedCat {
  name: string
  icon: string
  color: string
  type: TxType
}

// Colors are drawn from the Ocean Punch category palette (lib/palette.ts's
// default appTheme) so a fresh install's categories match the app's default
// theme out of the box, not left over from an earlier default theme.
export const DEFAULT_EXPENSE_CATEGORIES: SeedCat[] = [
  { name: 'Food & Drink', icon: '🍔', color: '#F48434', type: 'expense' }, // orange
  { name: 'Groceries', icon: '🛒', color: '#8AD61F', type: 'expense' }, // lime
  { name: 'Transport', icon: '🚗', color: '#129AE2', type: 'expense' }, // ocean blue
  { name: 'Coffee', icon: '☕', color: '#A05022', type: 'expense' }, // brown
  { name: 'Shopping', icon: '🛍️', color: '#A155E7', type: 'expense' }, // purple
  { name: 'Bills', icon: '💡', color: '#F0AC19', type: 'expense' }, // gold
  { name: 'Rent', icon: '🏠', color: '#905CEB', type: 'expense' }, // violet
  { name: 'Entertainment', icon: '🎬', color: '#E44444', type: 'expense' }, // red
  { name: 'Health', icon: '🏥', color: '#11D497', type: 'expense' }, // emerald
  { name: 'Travel', icon: '✈️', color: '#17BEE8', type: 'expense' }, // cyan
  { name: 'Subscriptions', icon: '📱', color: '#6861E5', type: 'expense' }, // indigo
  { name: 'Fitness', icon: '🏋️', color: '#1EB8AB', type: 'expense' }, // teal
  { name: 'Personal Care', icon: '💇', color: '#A155E7', type: 'expense' }, // purple
  { name: 'Gifts', icon: '🎁', color: '#E44444', type: 'expense' }, // red
  { name: 'Education', icon: '📚', color: '#6861E5', type: 'expense' }, // indigo
  { name: 'Pets', icon: '🐾', color: '#11D497', type: 'expense' }, // emerald
  { name: 'Other', icon: '📦', color: '#A05022', type: 'expense' }, // brown
]

export const DEFAULT_INCOME_CATEGORIES: SeedCat[] = [
  { name: 'Salary', icon: '💵', color: '#11D497', type: 'income' }, // emerald
  { name: 'Business', icon: '💼', color: '#6861E5', type: 'income' }, // indigo
  { name: 'Investments', icon: '📈', color: '#1EB8AB', type: 'income' }, // teal
  { name: 'Gifts', icon: '🎁', color: '#F0AC19', type: 'income' }, // gold
  { name: 'Other Income', icon: '➕', color: '#129AE2', type: 'income' }, // ocean blue
]

function buildCategories(): Category[] {
  const all = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]
  return all.map((c, i) => ({
    id: uid(),
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: c.type,
    sortOrder: i,
    usageCount: 0,
    isArchived: 0,
  }))
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  baseCurrency: 'USD',
  theme: 'dark',
  firstDayOfWeek: 1,
  seededDefaults: 1,
  openingBalance: 0,
  openingBalanceDate: '',
  calculatorMode: 'inline',
  keypadReach: 'center',
  customEmojis: [],
  appTheme: 'ocean',
}

/**
 * Populate default categories, settings, and a base rate on first launch.
 * Idempotent: only seeds tables that are empty / missing rows.
 */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.categories, db.settings, db.rates, async () => {
    const settings = await db.settings.get('app')
    if (!settings) {
      await db.settings.put(DEFAULT_SETTINGS)
    }
    const catCount = await db.categories.count()
    if (catCount === 0) {
      await db.categories.bulkAdd(buildCategories())
    }
    const base = (settings ?? DEFAULT_SETTINGS).baseCurrency
    const baseRate = await db.rates.get(base)
    if (!baseRate) {
      await db.rates.put({ currency: base, rate: 1, updatedAt: Date.now() })
    }
  })
}
