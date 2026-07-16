import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { buildPreview, runImport, type Mapping } from './spendeeImport'
import { parseISO } from './date'

const MAPPING: Mapping = {
  date: 'Date',
  amount: 'Amount',
  category: 'Category',
  currency: null,
  note: 'Note',
  labels: 'Labels',
  type: null,
}

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.categories.clear(),
    db.tags.clear(),
    db.settings.clear(),
    db.rates.clear(),
  ])
})

async function tag(name: string) {
  return db.tags.where('name').equals(name.toLowerCase()).first()
}

describe('runImport — tag lastUsedAt', () => {
  it("uses each row's own transaction date, not the moment the import runs", async () => {
    const rows = [
      { Date: '2018-05-01', Amount: '-12.50', Category: 'Food', Note: '', Labels: 'vacation' },
    ]
    const preview = buildPreview(rows, MAPPING, 'USD')
    await runImport(preview, false)
    const t = await tag('vacation')
    expect(t?.lastUsedAt).toBe(parseISO('2018-05-01').getTime())
  })

  it('takes the latest date across multiple rows in the same file for one tag', async () => {
    const rows = [
      { Date: '2018-05-01', Amount: '-12.50', Category: 'Food', Note: '', Labels: 'vacation' },
      { Date: '2021-11-20', Amount: '-8.00', Category: 'Food', Note: '', Labels: 'vacation' },
      { Date: '2015-01-01', Amount: '-3.00', Category: 'Food', Note: '', Labels: 'vacation' },
    ]
    const preview = buildPreview(rows, MAPPING, 'USD')
    await runImport(preview, false)
    const t = await tag('vacation')
    expect(t?.lastUsedAt).toBe(parseISO('2021-11-20').getTime())
    expect(t?.usageCount).toBe(3)
  })

  it('never moves an existing tag backwards when the imported rows are older', async () => {
    await db.tags.add({
      id: 'existing',
      name: 'vacation',
      usageCount: 1,
      lastUsedAt: parseISO('2026-01-01').getTime(),
    })
    const rows = [
      { Date: '2010-01-01', Amount: '-12.50', Category: 'Food', Note: '', Labels: 'vacation' },
    ]
    const preview = buildPreview(rows, MAPPING, 'USD')
    await runImport(preview, false)
    const t = await tag('vacation')
    expect(t?.lastUsedAt).toBe(parseISO('2026-01-01').getTime())
    expect(t?.usageCount).toBe(2)
  })

  it('advances an existing tag when the imported rows are newer', async () => {
    await db.tags.add({
      id: 'existing',
      name: 'vacation',
      usageCount: 1,
      lastUsedAt: parseISO('2015-01-01').getTime(),
    })
    const rows = [
      { Date: '2026-03-15', Amount: '-12.50', Category: 'Food', Note: '', Labels: 'vacation' },
    ]
    const preview = buildPreview(rows, MAPPING, 'USD')
    await runImport(preview, false)
    const t = await tag('vacation')
    expect(t?.lastUsedAt).toBe(parseISO('2026-03-15').getTime())
  })
})
