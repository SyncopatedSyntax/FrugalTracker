import { db } from './db'
import type { Budget, Category, Settings, Transaction, TxType } from './types'
import { uid } from '@/lib/id'
import { DEFAULT_SETTINGS } from './seed'

export type NewTransaction = Omit<
  Transaction,
  'id' | 'createdAt' | 'updatedAt' | 'baseAmount' | 'baseRate'
>

/* ----------------------------- Transactions ----------------------------- */

/** Round away float noise (e.g. 100 * 1.1 === 110.00000000000001) without
 * being lossy for any realistic currency amount or rate. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** The rate to lock in for `currency` right now: 1 if it's already the base,
 * otherwise the live rate table's "1 unit of currency in base" value
 * (falling back to 1:1 if that currency has no known rate, same as the rest
 * of the app). */
async function currentRateTo(currency: string): Promise<{ base: string; rate: number }> {
  const settings = await getSettings()
  if (currency === settings.baseCurrency) return { base: settings.baseCurrency, rate: 1 }
  const r = await db.rates.get(currency)
  return { base: settings.baseCurrency, rate: r?.rate ?? 1 }
}

export async function addTransaction(input: NewTransaction): Promise<string> {
  const now = Date.now()
  const { rate } = await currentRateTo(input.currency)
  const tx: Transaction = {
    ...input,
    tags: normalizeTags(input.tags),
    id: uid(),
    createdAt: now,
    updatedAt: now,
    baseRate: rate,
    baseAmount: round6(input.amount * rate),
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
  opts?: {
    /** Explicit rate to lock in (1 unit of the transaction's currency in the
     * base currency) — e.g. the user edited it directly. When omitted: the
     * previously-locked rate is kept if the currency didn't change, or a
     * fresh live rate is fetched if it did. */
    baseRateOverride?: number
  },
): Promise<void> {
  await db.transaction(
    'rw',
    db.transactions,
    db.categories,
    db.tags,
    db.settings,
    db.rates,
    async () => {
      const prev = await db.transactions.get(id)
      if (!prev) return
      const nextTags = patch.tags ? normalizeTags(patch.tags) : prev.tags
      const nextCurrency = patch.currency ?? prev.currency
      const nextAmount = patch.amount ?? prev.amount
      const baseCurrency = (await getSettings()).baseCurrency

      let baseRate: number
      if (nextCurrency === baseCurrency) {
        baseRate = 1
      } else if (opts?.baseRateOverride != null) {
        baseRate = opts.baseRateOverride
      } else if (patch.currency && patch.currency !== prev.currency) {
        baseRate = (await currentRateTo(nextCurrency)).rate
      } else {
        baseRate = prev.baseRate
      }

      const next: Transaction = {
        ...prev,
        ...patch,
        tags: nextTags,
        updatedAt: Date.now(),
        baseRate,
        baseAmount: round6(nextAmount * baseRate),
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
    },
  )
}

/** Backfill `baseAmount`/`baseRate` on any transaction that predates this
 * feature (rows from before v0.9.2, or restored from an older backup),
 * using the current rate table as the best available approximation — those
 * amounts couldn't have been "locked in" at the time since the fields didn't
 * exist yet. Idempotent and cheap to call on every boot: touches nothing once
 * every row has been migrated. */
export async function backfillBaseAmounts(): Promise<void> {
  const settings = await getSettings()
  const rates = await db.rates.toArray()
  const rateOf = new Map(rates.map((r) => [r.currency, r.rate]))
  await db.transactions
    .filter((t) => t.baseAmount == null || t.baseRate == null)
    .modify((t) => {
      const rate = t.currency === settings.baseCurrency ? 1 : rateOf.get(t.currency) ?? 1
      t.baseRate = rate
      t.baseAmount = round6(t.amount * rate)
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
        await db.tags.update(existing.id, {
          usageCount: count,
          ...(delta > 0 ? { lastUsedAt: Date.now() } : {}),
        })
      }
    } else if (delta > 0) {
      await db.tags.add({ id: uid(), name: key, usageCount: delta, lastUsedAt: Date.now() })
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
 * Change the base currency and re-anchor everything denominated in "the base
 * currency" so it keeps its real-world value: the rates table, every
 * transaction's locked-in `baseAmount`/`baseRate`, every budget's `amount`
 * (+ its `currency` tag), and the opening balance. All divided by the same
 * factor the rates table itself is re-anchored by, so a $500 budget becomes
 * the equivalent amount in the new base rather than keeping the number 500.
 *
 * If the new base has no known rate (divisor falls back to 1:1), nothing is
 * rescaled — same pre-existing limitation as the rates table itself: with no
 * known exchange rate between the old and new base, there's no correct
 * factor to apply.
 */
export async function changeBaseCurrency(newBase: string): Promise<void> {
  await db.transaction('rw', db.settings, db.rates, db.transactions, db.budgets, async () => {
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
      await db.transactions.toCollection().modify((t) => {
        t.baseRate = round6(t.baseRate / divisor)
        t.baseAmount = round6(t.baseAmount / divisor)
      })
      await db.budgets.toCollection().modify((b) => {
        b.amount = round6(b.amount / divisor)
        b.currency = newBase
      })
    }
    await db.rates.put({ currency: newBase, rate: 1, updatedAt: Date.now() })
    await db.settings.put({
      ...settings,
      baseCurrency: newBase,
      openingBalance:
        divisor && divisor !== 1 ? round6(settings.openingBalance / divisor) : settings.openingBalance,
    })
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
