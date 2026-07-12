import { db } from './db'
import { isDemoModeOn } from './demoMode'
import { addTransaction, normalizeTags } from './repo'
import type { RecurringTransaction } from './types'
import { uid } from '@/lib/id'
import { nextOccurrence } from '@/lib/recurrence'
import { todayISO } from '@/lib/date'

export type NewRecurringTransaction = Omit<
  RecurringTransaction,
  'id' | 'createdAt' | 'updatedAt' | 'nextDueDate'
>

/** Recurring rules are real financial data (included in backups and Demo
 * Mode's snapshot swap — see `lib/backup.ts`/`db/demoMode.ts`), so managing
 * one while Demo Mode is active would either leak a rule into the demo
 * dataset or have it silently discarded the moment demo mode exits. */
function assertNotDemo(): void {
  if (isDemoModeOn()) {
    throw new Error('Cannot manage recurring transactions while Demo Mode is active')
  }
}

export async function addRecurringTransaction(input: NewRecurringTransaction): Promise<string> {
  assertNotDemo()
  const now = Date.now()
  const rule: RecurringTransaction = {
    ...input,
    tags: normalizeTags(input.tags),
    id: uid(),
    nextDueDate: input.startDate,
    createdAt: now,
    updatedAt: now,
  }
  await db.recurringTransactions.add(rule)
  // Catches the rule up immediately if its start date is already due, rather
  // than waiting for the next app-open check.
  await generateDueRecurringTransactions()
  return rule.id
}

export async function updateRecurringTransaction(
  id: string,
  patch: Partial<NewRecurringTransaction>,
): Promise<void> {
  assertNotDemo()
  const prev = await db.recurringTransactions.get(id)
  if (!prev) return
  const next: RecurringTransaction = {
    ...prev,
    ...patch,
    tags: patch.tags ? normalizeTags(patch.tags) : prev.tags,
    updatedAt: Date.now(),
  }
  await db.recurringTransactions.put(next)
  await generateDueRecurringTransactions()
}

export async function deleteRecurringTransaction(id: string): Promise<void> {
  assertNotDemo()
  await db.recurringTransactions.delete(id)
}

/** Caps how many occurrences a single rule backfills in one pass — a safety
 * net against a pathological case (e.g. a daily rule left unopened for
 * years), not a limit real usage should ever hit. */
const MAX_BACKFILL_PER_RULE = 500

/** Materializes every due occurrence of every recurring rule into real
 * transactions, reusing `addTransaction()` so generated entries get the same
 * category/tag bookkeeping as a manual save. Nothing exists in
 * `db.transactions` for a rule until its due date is reached — recurring
 * rules live only in their own table until then. Skipped entirely while
 * Demo Mode is active, so a rule can never generate into the swapped-in demo
 * tables. Returns how many transactions were generated, for a toast. */
export async function generateDueRecurringTransactions(): Promise<number> {
  if (isDemoModeOn()) return 0
  const today = todayISO()
  const rules = await db.recurringTransactions.where('nextDueDate').belowOrEqual(today).toArray()
  let generated = 0
  for (const rule of rules) {
    let due = rule.nextDueDate
    let iterations = 0
    while (
      due <= today &&
      (!rule.endDate || due <= rule.endDate) &&
      iterations < MAX_BACKFILL_PER_RULE
    ) {
      await addTransaction({
        type: rule.type,
        amount: rule.amount,
        currency: rule.currency,
        categoryId: rule.categoryId,
        note: rule.note,
        tags: rule.tags,
        date: due,
      })
      generated++
      due = nextOccurrence(due, rule.frequency)
      iterations++
    }
    if (due !== rule.nextDueDate) {
      await db.recurringTransactions.update(rule.id, { nextDueDate: due })
    }
  }
  return generated
}
