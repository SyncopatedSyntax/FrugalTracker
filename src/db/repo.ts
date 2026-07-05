import { db } from './db'
import type { Budget, Category, Settings, Transaction, TxType } from './types'
import { uid } from '@/lib/id'
import { DEFAULT_SETTINGS } from './seed'

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>

/* ----------------------------- Transactions ----------------------------- */

export async function addTransaction(input: NewTransaction): Promise<string> {
  const now = Date.now()
  const tx: Transaction = {
    ...input,
    tags: normalizeTags(input.tags),
    id: uid(),
    createdAt: now,
    updatedAt: now,
  }
  await db.transaction('rw', db.transactions, db.categories, db.tags, async () => {
    await db.transactions.add(tx)
    await bumpCategory(tx.categoryId, 1)
    await bumpTags(tx.tags, 1)
  })
  return tx.id
}

export async function updateTransaction(
  id: string,
  patch: Partial<NewTransaction>,
): Promise<void> {
  await db.transaction('rw', db.transactions, db.categories, db.tags, async () => {
    const prev = await db.transactions.get(id)
    if (!prev) return
    const nextTags = patch.tags ? normalizeTags(patch.tags) : prev.tags
    const next: Transaction = {
      ...prev,
      ...patch,
      tags: nextTags,
      updatedAt: Date.now(),
    }
    await db.transactions.put(next)
    if (patch.categoryId && patch.categoryId !== prev.categoryId) {
      await bumpCategory(prev.categoryId, -1)
      await bumpCategory(next.categoryId, 1)
    }
    if (patch.tags) {
      await bumpTags(prev.tags, -1)
      await bumpTags(nextTags, 1)
    }
  })
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.categories, db.tags, async () => {
    const prev = await db.transactions.get(id)
    if (!prev) return
    await db.transactions.delete(id)
    await bumpCategory(prev.categoryId, -1)
    await bumpTags(prev.tags, -1)
  })
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

async function bumpCategory(categoryId: string, delta: number): Promise<void> {
  const cat = await db.categories.get(categoryId)
  if (!cat) return
  await db.categories.update(categoryId, {
    usageCount: Math.max(0, cat.usageCount + delta),
  })
}

async function bumpTags(tags: string[], delta: number): Promise<void> {
  for (const name of tags) {
    const key = name.toLowerCase()
    const existing = await db.tags.where('name').equals(key).first()
    if (existing) {
      const count = Math.max(0, existing.usageCount + delta)
      if (count === 0 && delta < 0) {
        await db.tags.delete(existing.id)
      } else {
        await db.tags.update(existing.id, { usageCount: count })
      }
    } else if (delta > 0) {
      await db.tags.add({ id: uid(), name: key, usageCount: delta })
    }
  }
}

/* ------------------------------ Categories ------------------------------ */

export async function addCategory(
  input: Pick<Category, 'name' | 'icon' | 'color' | 'type'>,
): Promise<string> {
  const maxOrder = await db.categories.orderBy('sortOrder').last()
  const cat: Category = {
    id: uid(),
    name: input.name.trim(),
    icon: input.icon,
    color: input.color,
    type: input.type,
    sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
    usageCount: 0,
    isArchived: 0,
  }
  await db.categories.add(cat)
  return cat.id
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'isArchived' | 'sortOrder'>>,
): Promise<void> {
  await db.categories.update(id, patch)
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.categories.update(orderedIds[i], { sortOrder: i })
    }
  })
}

/** Delete a category. If it has transactions, callers should reassign first. */
export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id)
}

export async function categoryTxCount(id: string): Promise<number> {
  return db.transactions.where('categoryId').equals(id).count()
}

/* -------------------------------- Budgets ------------------------------- */

export async function setBudget(input: Omit<Budget, 'id'> & { id?: string }): Promise<void> {
  const id = input.id ?? uid()
  await db.budgets.put({ ...input, id })
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id)
}

/* ------------------------------- Settings ------------------------------- */

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'app' })
}

/**
 * Change the base currency and re-anchor all stored rates so they remain
 * "value of 1 unit in the new base". Ensures the new base has rate 1.
 */
export async function changeBaseCurrency(newBase: string): Promise<void> {
  await db.transaction('rw', db.settings, db.rates, async () => {
    const settings = await getSettings()
    const oldBase = settings.baseCurrency
    if (oldBase === newBase) return
    const newBaseRate = await db.rates.get(newBase)
    const divisor = newBaseRate?.rate ?? 1
    if (divisor && divisor !== 1) {
      const all = await db.rates.toArray()
      for (const r of all) {
        await db.rates.update(r.currency, {
          rate: r.rate / divisor,
          updatedAt: Date.now(),
        })
      }
    }
    await db.rates.put({ currency: newBase, rate: 1, updatedAt: Date.now() })
    await db.settings.put({ ...settings, baseCurrency: newBase })
  })
}

/* -------------------------------- Rates --------------------------------- */

export async function setRate(currency: string, rate: number): Promise<void> {
  await db.rates.put({ currency, rate, updatedAt: Date.now() })
}

export async function deleteRate(currency: string): Promise<void> {
  await db.rates.delete(currency)
}

export type { TxType }
