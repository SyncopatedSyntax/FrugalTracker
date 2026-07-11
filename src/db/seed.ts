import { db } from './db'
import type { Category, Settings, TxType } from './types'
import { uid } from '@/lib/id'

interface SeedCat {
  name: string
  icon: string
  color: string
  type: TxType
}

export const DEFAULT_EXPENSE_CATEGORIES: SeedCat[] = [
  { name: 'Food & Drink', icon: '🍔', color: '#C08268', type: 'expense' }, // terracotta
  { name: 'Groceries', icon: '🛒', color: '#BFA05A', type: 'expense' }, // olive gold
  { name: 'Transport', icon: '🚗', color: '#7D93A8', type: 'expense' }, // dusty blue
  { name: 'Coffee', icon: '☕', color: '#8A6E55', type: 'expense' }, // brown
  { name: 'Shopping', icon: '🛍️', color: '#A78BA0', type: 'expense' }, // mauve
  { name: 'Bills', icon: '💡', color: '#D1A54E', type: 'expense' }, // honey
  { name: 'Rent', icon: '🏠', color: '#8F7396', type: 'expense' }, // plum
  { name: 'Entertainment', icon: '🎬', color: '#5E9490', type: 'expense' }, // teal
  { name: 'Health', icon: '🏥', color: '#6C8F6E', type: 'expense' }, // sage
  { name: 'Travel', icon: '✈️', color: '#82A9BD', type: 'expense' }, // sky
  { name: 'Subscriptions', icon: '📱', color: '#6E85A0', type: 'expense' }, // denim
  { name: 'Fitness', icon: '🏋️', color: '#7C9473', type: 'expense' }, // moss
  { name: 'Personal Care', icon: '💇', color: '#C08A93', type: 'expense' }, // rose
  { name: 'Gifts', icon: '🎁', color: '#B56A5B', type: 'expense' }, // clay
  { name: 'Education', icon: '📚', color: '#C9A876', type: 'expense' }, // sand
  { name: 'Pets', icon: '🐾', color: '#6F9B7B', type: 'expense' }, // fern
  { name: 'Other', icon: '📦', color: '#767B70', type: 'expense' }, // slate
]

export const DEFAULT_INCOME_CATEGORIES: SeedCat[] = [
  { name: 'Salary', icon: '💵', color: '#7C9473', type: 'income' }, // moss
  { name: 'Business', icon: '💼', color: '#6E85A0', type: 'income' }, // denim
  { name: 'Investments', icon: '📈', color: '#5E9490', type: 'income' }, // teal
  { name: 'Gifts', icon: '🎁', color: '#D1A54E', type: 'income' }, // honey
  { name: 'Other Income', icon: '➕', color: '#A6A28C', type: 'income' }, // stone
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
  theme: 'system',
  firstDayOfWeek: 1,
  seededDefaults: 1,
  openingBalance: 0,
  openingBalanceDate: '',
  calculatorMode: 'inline',
  keypadReach: 'center',
  customEmojis: [],
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
