import Dexie, { type Table } from 'dexie'
import type {
  Budget,
  Category,
  DemoSnapshot,
  GithubBackupConfig,
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
  /** Holds the user's real data while Demo Mode is active — see `db/demoMode.ts`. */
  snapshot!: Table<DemoSnapshot, string>
  /** GitHub backup connection & token — intentionally excluded from
   * `buildBackup()`/`restoreBackup()`, see `lib/githubBackup.ts`. */
  githubConfig!: Table<GithubBackupConfig, string>

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
    this.version(2).stores({
      transactions:
        'id, type, currency, categoryId, date, createdAt, *tags, [type+date]',
      categories: 'id, type, sortOrder, isArchived',
      tags: 'id, &name, usageCount',
      budgets: 'id, categoryId',
      settings: 'id',
      rates: 'currency',
      snapshot: 'id',
    })
    this.version(3).stores({
      transactions:
        'id, type, currency, categoryId, date, createdAt, *tags, [type+date]',
      categories: 'id, type, sortOrder, isArchived',
      tags: 'id, &name, usageCount',
      budgets: 'id, categoryId',
      settings: 'id',
      rates: 'currency',
      snapshot: 'id',
      githubConfig: 'id',
    })
  }
}

export const db = new FrugalDB()
