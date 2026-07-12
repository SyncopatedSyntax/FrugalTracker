import { useMemo, useState } from 'react'
import SubScreen from '@/components/SubScreen'
import Segmented from '@/components/Segmented'
import Sheet from '@/components/Sheet'
import CategoryFormSheet from './CategoryFormSheet'
import { ChevronDownIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/icons'
import { useCategories } from '@/hooks'
import { categoryTxCount, deleteCategory, updateCategory } from '@/db/repo'
import type { Category, TxType } from '@/db/types'

export default function CategoriesScreen() {
  const categories = useCategories(true)
  const [type, setType] = useState<TxType>('expense')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | undefined>()
  const [toDelete, setToDelete] = useState<Category | undefined>()
  const [deleteCount, setDeleteCount] = useState(0)

  const active = useMemo(
    () =>
      categories
        .filter((c) => c.type === type && !c.isArchived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, type],
  )
  const archived = useMemo(
    () => categories.filter((c) => c.type === type && c.isArchived),
    [categories, type],
  )

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= active.length) return
    const a = active[index]
    const b = active[j]
    await updateCategory(a.id, { sortOrder: b.sortOrder })
    await updateCategory(b.id, { sortOrder: a.sortOrder })
  }

  const openEdit = (c: Category) => {
    setEditing(c)
    setFormOpen(true)
  }

  const openNew = () => {
    setEditing(undefined)
    setFormOpen(true)
  }

  const askDelete = async (c: Category) => {
    setToDelete(c)
    setDeleteCount(await categoryTxCount(c.id))
  }

  return (
    <SubScreen
      title="Categories"
      right={
        <button
          onClick={openNew}
          className="grid h-10 w-10 place-items-center rounded-full text-primary hover:bg-primary/10"
          aria-label="Add category"
        >
          <PlusIcon size={22} />
        </button>
      }
    >
      <div className="px-4 py-4">
        <Segmented
          className="mb-4 w-full [&>button]:flex-1"
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
          value={type}
          onChange={setType}
        />

        <div className="overflow-hidden rounded-[1.375rem] bg-surface">
          {active.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-2 px-3 py-2.5"
              style={{ borderTop: i === 0 ? undefined : '1px solid rgb(var(--c-border) / 0.6)' }}
            >
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-muted disabled:opacity-25"
                  aria-label="Move up"
                >
                  <ChevronDownIcon size={16} className="rotate-180" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === active.length - 1}
                  className="text-muted disabled:opacity-25"
                  aria-label="Move down"
                >
                  <ChevronDownIcon size={16} />
                </button>
              </div>
              <span
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-lg"
                style={{ backgroundColor: c.color + '80' }}
              >
                {c.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block text-xs text-muted">{c.usageCount} uses</span>
              </span>
              <button
                onClick={() => openEdit(c)}
                className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface2"
                aria-label={`Edit ${c.name}`}
              >
                <PencilIcon size={18} />
              </button>
              <button
                onClick={() => updateCategory(c.id, { isArchived: 1 })}
                className="rounded-full px-2 py-1 text-xs font-medium text-muted hover:bg-surface2"
              >
                Archive
              </button>
            </div>
          ))}
          {active.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">No categories yet.</p>
          )}
        </div>

        {archived.length > 0 && (
          <>
            <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
              Archived
            </p>
            <div className="overflow-hidden rounded-[1.375rem] bg-surface">
              {archived.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2.5"
                  style={{ borderTop: i === 0 ? undefined : '1px solid rgb(var(--c-border) / 0.6)' }}
                >
                  <span
                    className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-lg opacity-60"
                    style={{ backgroundColor: c.color + '80' }}
                  >
                    {c.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{c.name}</span>
                  <button
                    onClick={() => updateCategory(c.id, { isArchived: 0 })}
                    className="rounded-full px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => askDelete(c)}
                    className="grid h-9 w-9 place-items-center rounded-full text-expense hover:bg-expense/10"
                    aria-label={`Delete ${c.name}`}
                  >
                    <TrashIcon size={18} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <CategoryFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        defaultType={type}
        editing={editing}
      />

      <Sheet
        open={!!toDelete}
        onClose={() => setToDelete(undefined)}
        title={`Delete “${toDelete?.name}”?`}
      >
        {deleteCount > 0 ? (
          <p className="text-sm text-muted">
            This category is used by {deleteCount}{' '}
            {deleteCount === 1 ? 'transaction' : 'transactions'}. Deleting it would leave them
            uncategorized. Keep it archived instead.
          </p>
        ) : (
          <p className="text-sm text-muted">This category has no transactions. Delete it?</p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setToDelete(undefined)}
            className="flex-1 rounded-[1.375rem] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={deleteCount > 0}
            onClick={async () => {
              if (toDelete) await deleteCategory(toDelete.id)
              setToDelete(undefined)
            }}
            className="flex-1 rounded-[1.375rem] bg-expense py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </Sheet>
    </SubScreen>
  )
}
