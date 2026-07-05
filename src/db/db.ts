import Dexie, { type Table } from 'dexie'
import type {
  Budget,
  Category,
  Rate,
  Settings,
  Tag,
  Transaction,
} from './types'

export class FrugalDB extends Dexie {
  transactions!: Table<Transaction, string>
  categories!: Table<Category, string>
  tags!: Table<Tag, string>
  budgets!: Table<Budget, string>
  settings!: Table<Settings, string>
  rates!: Table<Rate, string>

  constructor() {
    super('frugaltracker')
    this.version(1).stores({
      // *tags = multi-entry index for tag search; [type+date] = compound for insights.
      transactions:
        'id, type, currency, categoryId, date, createdAt, *tags, [type+date]',
      categories: 'id, type, sortOrder, isArchived',
      tags: 'id, &name, usageCount',
      budgets: 'id, categoryId',
      settings: 'id',
      rates: 'currency',
    })
  }
}

export const db = new FrugalDB()
