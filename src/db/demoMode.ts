import { buildBackup, restoreBackup } from '@/lib/backup'
import { buildDemoDataset } from '@/lib/demoData'
import { db } from './db'
import { getSettings } from './repo'
import { ensureSeeded } from './seed'

const FLAG_KEY = 'ft-demo-mode'

export function isDemoModeOn(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}

// localStorage doesn't notify same-tab listeners on write, so components that
// need to react to enter/exitDemoMode (the toggle screen, the persistent
// banner) subscribe here instead of polling.
const listeners = new Set<() => void>()
export function subscribeDemoMode(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function setFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG_KEY, '1')
    else localStorage.removeItem(FLAG_KEY)
  } catch {
    /* ignore storage errors */
  }
  listeners.forEach((fn) => fn())
}

/** Snapshot the user's real data, then swap every table over to a freshly
 * generated demo dataset. Appearance settings (theme, color theme, keypad
 * style, etc.) are left untouched — only the "financial" settings (base
 * currency, opening balance) come along with the demo data. */
export async function enterDemoMode(): Promise<void> {
  if (isDemoModeOn()) return
  const backup = await buildBackup()
  const settings = await getSettings()
  const demo = buildDemoDataset(settings.baseCurrency, settings.appTheme)

  await db.snapshot.put({ id: 'realData', data: backup, savedAt: Date.now() })
  await db.transaction(
    'rw',
    [db.settings, db.categories, db.tags, db.budgets, db.rates, db.transactions],
    async () => {
      await Promise.all([
        db.categories.clear(),
        db.tags.clear(),
        db.budgets.clear(),
        db.rates.clear(),
        db.transactions.clear(),
      ])
      await db.categories.bulkAdd(demo.categories)
      if (demo.tags.length) await db.tags.bulkAdd(demo.tags)
      await db.budgets.bulkAdd(demo.budgets)
      await db.rates.bulkAdd(demo.rates)
      await db.transactions.bulkAdd(demo.transactions)
      await db.settings.put({
        ...settings,
        openingBalance: demo.openingBalance,
        openingBalanceDate: demo.openingBalanceDate,
      })
    },
  )
  setFlag(true)
}

/** Restore the snapshot taken when Demo Mode was turned on, discarding
 * whatever changes were made to the demo dataset in the meantime. */
export async function exitDemoMode(): Promise<void> {
  if (!isDemoModeOn()) return
  const snap = await db.snapshot.get('realData')
  if (snap) {
    await restoreBackup(snap.data)
  } else {
    // No snapshot on record (shouldn't normally happen) — fall back to a
    // clean, empty state rather than leaving demo data in place forever.
    await Promise.all([
      db.categories.clear(),
      db.tags.clear(),
      db.budgets.clear(),
      db.rates.clear(),
      db.transactions.clear(),
      db.settings.clear(),
    ])
    await ensureSeeded()
  }
  await db.snapshot.delete('realData')
  setFlag(false)
}
