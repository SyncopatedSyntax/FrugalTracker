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
  { name: 'Food & Drink', icon: '🍔', color: '#ef4444', type: 'expense' },
  { name: 'Groceries', icon: '🛒', color: '#f97316', type: 'expense' },
  { name: 'Transport', icon: '🚗', color: '#3b82f6', type: 'expense' },
  { name: 'Coffee', icon: '☕', color: '#a16207', type: 'expense' },
  { name: 'Shopping', icon: '🛍️', color: '#ec4899', type: 'expense' },
  { name: 'Bills', icon: '💡', color: '#eab308', type: 'expense' },
  { name: 'Rent', icon: '🏠', color: '#8b5cf6', type: 'expense' },
  { name: 'Entertainment', icon: '🎬', color: '#06b6d4', type: 'expense' },
  { name: 'Health', icon: '🏥', color: '#10b981', type: 'expense' },
  { name: 'Travel', icon: '✈️', color: '#0ea5e9', type: 'expense' },
  { name: 'Subscriptions', icon: '📱', color: '#6366f1', type: 'expense' },
  { name: 'Fitness', icon: '🏋️', color: '#84cc16', type: 'expense' },
  { name: 'Personal Care', icon: '💇', color: '#d946ef', type: 'expense' },
  { name: 'Gifts', icon: '🎁', color: '#f43f5e', type: 'expense' },
  { name: 'Education', icon: '📚', color: '#14b8a6', type: 'expense' },
  { name: 'Pets', icon: '🐾', color: '#a3620a', type: 'expense' },
  { name: 'Other', icon: '📦', color: '#64748b', type: 'expense' },
]

export const DEFAULT_INCOME_CATEGORIES: SeedCat[] = [
  { name: 'Salary', icon: '💵', color: '#22c55e', type: 'income' },
  { name: 'Business', icon: '💼', color: '#0ea5e9', type: 'income' },
  { name: 'Investments', icon: '📈', color: '#8b5cf6', type: 'income' },
  { name: 'Gifts', icon: '🎁', color: '#f59e0b', type: 'income' },
  { name: 'Other Income', icon: '➕', color: '#64748b', type: 'income' },
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
