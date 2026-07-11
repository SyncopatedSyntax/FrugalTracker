import { useEffect, useState } from 'react'
import Sheet from '@/components/Sheet'
import Segmented from '@/components/Segmented'
import { cn } from '@/lib/cn'
import type { Category, TxType } from '@/db/types'
import { addCategory, updateCategory, updateSettings } from '@/db/repo'
import { useSettings } from '@/hooks'
import { categoryPalette } from '@/lib/palette'
import { firstGrapheme } from '@/lib/emoji'

/** Starting set of common budgeting icons. Users can add their own beyond
 * this via the "Add your own" field below the grid — those are persisted in
 * Settings.customEmojis so the picker grows over time. */
const EMOJIS = [
  '🍔', '🛒', '🚗', '☕', '🛍️', '💡', '🏠', '🎬', '🏥', '✈️',
  '📱', '🏋️', '💇', '🎁', '📚', '🐾', '📦', '🍺', '🍕', '🍜',
  '⛽', '🚕', '🚌', '🎮', '🎵', '🎨', '💊', '🧾', '💳', '💰',
  '💵', '💼', '📈', '➕', '🏦', '👕', '👟', '💄', '🧴', '🧻',
  '🔧', '💻', '📷', '🎟️', '🍷', '🌮', '🥗', '🍦', '🚿', '🌐',
]

interface Props {
  open: boolean
  onClose: () => void
  defaultType: TxType
  editing?: Category
  onSaved?: (id: string) => void
}

export default function CategoryFormSheet({
  open,
  onClose,
  defaultType,
  editing,
  onSaved,
}: Props) {
  const settings = useSettings()
  const COLORS = categoryPalette(settings.appTheme)
  const defaultColor = COLORS[COLORS.length - 1]

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📦')
  const [color, setColor] = useState(defaultColor)
  const [type, setType] = useState<TxType>(defaultType)
  const [customEmojiText, setCustomEmojiText] = useState('')

  const customEmojis = settings.customEmojis.filter((e) => !EMOJIS.includes(e))

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setIcon(editing.icon)
      setColor(editing.color)
      setType(editing.type)
    } else {
      setName('')
      setIcon('📦')
      setColor(defaultColor)
      setType(defaultType)
    }
    setCustomEmojiText('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultType])

  const addCustomEmoji = () => {
    const value = firstGrapheme(customEmojiText.trim())
    if (!value) return
    setIcon(value)
    setCustomEmojiText('')
    if (!EMOJIS.includes(value) && !settings.customEmojis.includes(value)) {
      updateSettings({ customEmojis: [...settings.customEmojis, value] })
    }
  }

  const canSave = name.trim().length > 0

  const save = async () => {
    if (!canSave) return
    if (editing) {
      await updateCategory(editing.id, { name: name.trim(), icon, color })
      onSaved?.(editing.id)
    } else {
      const id = await addCategory({ name, icon, color, type })
      onSaved?.(id)
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit category' : 'New category'}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-full text-3xl"
            style={{ backgroundColor: color + '22' }}
          >
            {icon}
          </span>
          <input
            autoFocus={!editing}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            className="flex-1 rounded-xl border border-border bg-surface2 px-3 py-3 text-base outline-none focus:border-primary"
          />
        </div>

        {!editing && (
          <Segmented
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            value={type}
            onChange={setType}
          />
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Icon</p>
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setIcon(e)}
                className={cn(
                  'grid h-9 place-items-center rounded-lg text-xl',
                  icon === e ? 'bg-primary/15 ring-1 ring-primary' : 'hover:bg-surface2',
                )}
              >
                {e}
              </button>
            ))}
          </div>

          {customEmojis.length > 0 && (
            <>
              <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Your custom icons
              </p>
              <div className="grid grid-cols-8 gap-1">
                {customEmojis.map((e) => (
                  <button
                    key={e}
                    onClick={() => setIcon(e)}
                    className={cn(
                      'grid h-9 place-items-center rounded-lg text-xl',
                      icon === e ? 'bg-primary/15 ring-1 ring-primary' : 'hover:bg-surface2',
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-3 flex items-center gap-2">
            <input
              value={customEmojiText}
              onChange={(e) => setCustomEmojiText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustomEmoji()
                }
              }}
              placeholder="Add your own emoji…"
              maxLength={16}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface2 px-2.5 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={addCustomEmoji}
              disabled={!customEmojiText.trim()}
              className="flex-shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-fg disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Color</p>
          <div className="grid grid-cols-9 gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'h-8 w-8 rounded-full transition-transform',
                  color === c && 'ring-2 ring-content ring-offset-2 ring-offset-surface',
                )}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <button
          onClick={save}
          disabled={!canSave}
          className="w-full rounded-[22px] bg-primary py-3.5 text-base font-semibold text-primary-fg disabled:opacity-40"
        >
          {editing ? 'Save changes' : 'Create category'}
        </button>
      </div>
    </Sheet>
  )
}
