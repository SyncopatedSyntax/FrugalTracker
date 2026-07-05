import Papa from 'papaparse'
import { db } from '@/db/db'
import type { Category, Transaction, TxType } from '@/db/types'
import { uid } from './id'
import { CATEGORY_PALETTE } from './palette'

export type FieldKey = 'date' | 'amount' | 'category' | 'currency' | 'note' | 'labels' | 'type'

export const FIELD_LABELS: Record<FieldKey, string> = {
  date: 'Date',
  amount: 'Amount',
  category: 'Category',
  currency: 'Currency',
  note: 'Note',
  labels: 'Labels / Tags',
  type: 'Type (optional)',
}

export type Mapping = Record<FieldKey, string | null>

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

const CAT_COLORS = CATEGORY_PALETTE

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })
  const headers = (result.meta.fields ?? []).filter((h) => h && h.length > 0)
  const rows = (result.data as Record<string, string>[]).filter((r) =>
    Object.values(r).some((v) => v != null && String(v).trim() !== ''),
  )
  return { headers, rows }
}

const CANDIDATES: Record<FieldKey, string[]> = {
  date: ['date', 'day', 'datetime', 'time', 'transaction date'],
  amount: ['amount', 'value', 'sum', 'price', 'total'],
  category: ['category name', 'category', 'categoryname', 'cat'],
  currency: ['currency', 'curr', 'ccy'],
  note: ['note', 'notes', 'description', 'memo', 'comment'],
  labels: ['labels', 'label', 'tags', 'tag', 'hashtags'],
  type: ['type', 'kind', 'transaction type'],
}

export function autoMap(headers: string[]): Mapping {
  const lower = headers.map((h) => ({ h, l: h.toLowerCase().trim() }))
  const pick = (field: FieldKey): string | null => {
    for (const cand of CANDIDATES[field]) {
      const exact = lower.find((x) => x.l === cand)
      if (exact) return exact.h
    }
    for (const cand of CANDIDATES[field]) {
      const partial = lower.find((x) => x.l.includes(cand))
      if (partial) return partial.h
    }
    return null
  }
  return {
    date: pick('date'),
    amount: pick('amount'),
    category: pick('category'),
    currency: pick('currency'),
    note: pick('note'),
    labels: pick('labels'),
    type: pick('type'),
  }
}

/** Parse a variety of date strings into local "YYYY-MM-DD". */
export function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim().split(/[T ]/)[0]
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const parts = s.split(/[./-]/).map((p) => p.trim())
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const nums = parts.map(Number)
    // Identify the year (4-digit or >31).
    let yi = nums.findIndex((n, i) => parts[i].length === 4 || n > 31)
    if (yi === -1) yi = 2
    const year = nums[yi] < 100 ? 2000 + nums[yi] : nums[yi]
    const rest = nums.filter((_, i) => i !== yi)
    let day: number
    let month: number
    if (rest[0] > 12) {
      day = rest[0]
      month = rest[1]
    } else if (rest[1] > 12) {
      month = rest[0]
      day = rest[1]
    } else {
      // Ambiguous — assume day-first (Spendee's common export).
      day = rest[0]
      month = rest[1]
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const t = Date.parse(raw)
  if (!Number.isNaN(t)) {
    const dt = new Date(t)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }
  return null
}

/** Parse an amount that may include currency symbols and grouping. Returns signed number. */
export function parseNumber(raw: string): number | null {
  if (raw == null) return null
  let s = String(raw).trim().replace(/[^0-9.,-]/g, '')
  if (!s) return null
  const neg = s.startsWith('-') || /-$/.test(s)
  s = s.replace(/-/g, '')
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // Last separator is the decimal one.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) {
    const after = s.split(',')[1] ?? ''
    s = after.length === 3 && !s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.')
  }
  const n = parseFloat(s)
  if (Number.isNaN(n)) return null
  return neg ? -n : n
}

export function parseLabels(raw: string): string[] {
  if (!raw) return []
  const s = raw.trim()
  if (!s) return []
  let parts: string[]
  if (s.includes(',') || s.includes(';')) {
    // Comma/semicolon separated (Spendee, most exporters). Multi-word labels
    // like "RC Cars" are already a single cell, so only these split them.
    parts = s.split(/[,;]/)
  } else if (/^#\S+(\s+#\S+)+$/.test(s)) {
    // Space-separated hashtags from other apps, e.g. "#food #home".
    parts = s.split(/\s+/)
  } else {
    // A single label, which may legitimately contain spaces ("RC Cars").
    parts = [s]
  }
  return parts.map((t) => t.replace(/^#/, '').trim()).filter(Boolean)
}

export interface PreviewRow {
  date: string
  type: TxType
  amount: number
  currency: string
  categoryName: string
  note: string
  tags: string[]
  valid: boolean
  error?: string
}

export function buildPreview(
  rows: Record<string, string>[],
  mapping: Mapping,
  defaultCurrency: string,
): PreviewRow[] {
  return rows.map((row) => {
    const rawDate = mapping.date ? row[mapping.date] : ''
    const rawAmount = mapping.amount ? row[mapping.amount] : ''
    const date = parseDate(rawDate ?? '')
    const amountSigned = parseNumber(rawAmount ?? '')
    const currency = (mapping.currency ? row[mapping.currency] : '')?.trim().toUpperCase() ||
      defaultCurrency
    const categoryName = (mapping.category ? row[mapping.category] : '')?.trim() || 'Uncategorized'
    const note = (mapping.note ? row[mapping.note] : '')?.trim() || ''
    const tags = parseLabels(mapping.labels ? row[mapping.labels] : '')

    let type: TxType
    const typeRaw = (mapping.type ? row[mapping.type] : '')?.toLowerCase() ?? ''
    if (typeRaw.includes('inc')) type = 'income'
    else if (typeRaw.includes('exp')) type = 'expense'
    else type = (amountSigned ?? 0) >= 0 ? 'income' : 'expense'

    let valid = true
    let error: string | undefined
    if (!date) {
      valid = false
      error = 'Bad date'
    } else if (amountSigned == null) {
      valid = false
      error = 'Bad amount'
    }

    return {
      date: date ?? '',
      type,
      amount: Math.abs(amountSigned ?? 0),
      currency,
      categoryName,
      note,
      tags,
      valid,
      error,
    }
  })
}

export interface ImportResult {
  imported: number
  skipped: number
  categoriesCreated: number
  invalid: number
}

const dedupeKey = (r: {
  date: string
  type: TxType
  amount: number
  currency: string
  note: string
  categoryName: string
}) =>
  [r.date, r.type, r.amount.toFixed(2), r.currency, r.note.toLowerCase(), r.categoryName.toLowerCase()].join(
    '|',
  )

export async function runImport(
  preview: PreviewRow[],
  dedupe: boolean,
): Promise<ImportResult> {
  const valid = preview.filter((r) => r.valid)
  const invalid = preview.length - valid.length

  const categories = await db.categories.toArray()
  const catKey = (name: string, type: TxType) => `${type}|${name.trim().toLowerCase()}`
  const catByKey = new Map(categories.map((c) => [catKey(c.name, c.type), c]))
  const catNameById = new Map(categories.map((c) => [c.id, c.name]))

  let existing: Set<string> | null = null
  if (dedupe) {
    const all = await db.transactions.toArray()
    existing = new Set(
      all.map((t) =>
        dedupeKey({
          date: t.date,
          type: t.type,
          amount: t.amount,
          currency: t.currency,
          note: t.note,
          categoryName: catNameById.get(t.categoryId) ?? '',
        }),
      ),
    )
  }

  const now = Date.now()
  const newCats: Category[] = []
  const newTxs: Transaction[] = []
  const catUsage = new Map<string, number>()
  const tagUsage = new Map<string, number>()
  let created = 0
  let imported = 0
  let skipped = 0
  let colorIdx = 0
  let order = 10_000

  for (const r of valid) {
    const key = catKey(r.categoryName, r.type)
    let cat = catByKey.get(key)
    if (!cat) {
      cat = {
        id: uid(),
        name: r.categoryName,
        icon: r.type === 'income' ? '➕' : '📦',
        color: CAT_COLORS[colorIdx++ % CAT_COLORS.length],
        type: r.type,
        sortOrder: order++,
        usageCount: 0,
        isArchived: 0,
      }
      catByKey.set(key, cat)
      newCats.push(cat)
      created++
    }

    if (existing) {
      // Only skip rows that already exist in the database (re-importing the same
      // file). We deliberately do NOT dedupe within the file itself: two entries
      // on the same day with the same amount/category/note are distinct
      // transactions (Spendee keeps the time), and dropping one loses real data.
      const k = dedupeKey(r)
      if (existing.has(k)) {
        skipped++
        continue
      }
    }

    newTxs.push({
      id: uid(),
      type: r.type,
      amount: r.amount,
      currency: r.currency,
      categoryId: cat.id,
      note: r.note,
      tags: r.tags,
      date: r.date,
      createdAt: now,
      updatedAt: now,
    })
    imported++
    catUsage.set(cat.id, (catUsage.get(cat.id) ?? 0) + 1)
    for (const t of r.tags) {
      const tl = t.toLowerCase()
      tagUsage.set(tl, (tagUsage.get(tl) ?? 0) + 1)
    }
  }

  await db.transaction('rw', db.categories, db.tags, db.transactions, async () => {
    if (newCats.length) await db.categories.bulkAdd(newCats)
    for (const [id, delta] of catUsage) {
      const c = await db.categories.get(id)
      if (c) await db.categories.update(id, { usageCount: c.usageCount + delta })
    }
    for (const [name, delta] of tagUsage) {
      const ex = await db.tags.where('name').equals(name).first()
      if (ex) {
        await db.tags.update(ex.id, { usageCount: ex.usageCount + delta, lastUsedAt: now })
      } else {
        await db.tags.add({ id: uid(), name, usageCount: delta, lastUsedAt: now })
      }
    }
    if (newTxs.length) await db.transactions.bulkAdd(newTxs)
  })

  return { imported, skipped, categoriesCreated: created, invalid }
}
