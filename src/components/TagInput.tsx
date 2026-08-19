import { useState } from 'react'
import { cn } from '@/lib/cn'
import { PlusIcon, XIcon } from './icons'

/** Trims and de-dupes (case-insensitively) `raw` into `tags`; returns the
 * same array if it's blank or already present. Shared by TagInput's own
 * input and any host that adds tags through a different UI (e.g. a sheet). */
export function addTag(tags: string[], raw: string): string[] {
  const t = raw.trim()
  if (!t) return tags
  if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return tags
  return [...tags, t]
}

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  placeholder?: string
  /** Render as a pure browse/select grid that fills all available vertical
   * space and scrolls internally as needed, with no inline text input —
   * for hosts that offer a separate "new tag" entry point elsewhere. */
  fill?: boolean
  /** List every unused suggestion instead of capping to a short recent
   * list — for a dedicated tag-browsing host (e.g. a "Tags" sheet) where
   * seeing the full tag set is the point. */
  showAll?: boolean
  /** Focus the text input as soon as it mounts (non-fill mode only) — for a
   * host whose sole purpose is entering a tag (e.g. a dedicated "Add tag"
   * sheet), where the keyboard should already be up rather than requiring a
   * second tap. */
  autoFocus?: boolean
  /** Give the suggestions area a constant height (non-fill mode only)
   * instead of shrinking/growing with the match count. Without this, typing
   * a query that narrows the match list shrinks the host sheet — and since
   * a bottom sheet is anchored to its bottom edge, a shorter sheet pushes
   * its *top* (and the input row sitting there) further down, which on a
   * real device can shove the input behind the on-screen keyboard. A fixed
   * height keeps the input's position constant regardless of what's typed. */
  fixedHeight?: boolean
  /** Suggestion names, lowercased, to render tinted and (by the caller's
   * ordering) first — the tags recently used in the currently selected
   * category, so the ones you actually reach for in this context stand apart
   * from your whole tag vocabulary. */
  highlighted?: Set<string>
  /** Background for those tinted suggestions — pass
   * `category.color + alphaHex(settings.categoryIconAlpha)` so the highlight
   * carries the chosen category's own colour, matching the icon chips. */
  highlightBg?: string
}

export default function TagInput({
  tags,
  onChange,
  suggestions = [],
  placeholder,
  fill,
  showAll,
  autoFocus,
  fixedHeight,
  highlighted,
  highlightBg,
}: Props) {
  const [text, setText] = useState('')

  const add = (raw: string) => {
    onChange(addTag(tags, raw))
    setText('')
  }

  const remove = (t: string) => onChange(tags.filter((x) => x !== t))

  /** Tinted when this tag is one the selected category is usually tagged with.
   * Border and text come from classes; only the fill is dynamic, since the
   * colour belongs to the category rather than the theme. */
  const hot = (s: string) => !!highlightBg && !!highlighted?.has(s.toLowerCase())
  const hotStyle = (s: string) =>
    hot(s) ? { backgroundColor: highlightBg } : undefined

  const unused = suggestions.filter(
    (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()),
  )

  if (fill) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {tags.length > 0 && (
          <div className="mb-2 flex flex-shrink-0 flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary"
              >
                #{t}
                <button onClick={() => remove(t)} aria-label={`Remove ${t}`}>
                  <XIcon size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
          {unused.length > 0 ? (
            <>
              <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
                Recent
              </p>
              <div className="flex flex-wrap content-start gap-1.5">
                {unused.map((s) => (
                  <button
                    key={s}
                    onClick={() => add(s)}
                    style={hotStyle(s)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm active:scale-95 hover:border-primary hover:text-primary',
                      hot(s) ? 'border-transparent text-content' : 'border-border text-muted',
                    )}
                  >
                    #{s}
                  </button>
                ))}
              </div>
            </>
          ) : (
            tags.length === 0 && (
              <p className="pt-3 text-center text-xs text-muted">No recent tags yet</p>
            )
          )}
        </div>
      </div>
    )
  }

  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()
  const matches = lower
    ? unused.filter((s) => s.toLowerCase().includes(lower)).slice(0, showAll ? undefined : 6)
    : showAll
      ? unused
      : unused.slice(0, 8)
  // Typed text that doesn't already exist (as any case) as a tag, and isn't
  // already selected — offer an explicit, tappable way to create it instead
  // of relying on a mobile keyboard's Enter/return key alone.
  const canCreate =
    trimmed.length > 0 &&
    !unused.some((s) => s.toLowerCase() === lower) &&
    !tags.some((t) => t.toLowerCase() === lower)

  const inputRow = (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface2 px-2 py-2">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-xs font-medium text-primary"
        >
          #{t}
          <button onClick={() => remove(t)} aria-label={`Remove ${t}`}>
            <XIcon size={14} />
          </button>
        </span>
      ))}
      <input
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(text)
          } else if (e.key === 'Backspace' && !text && tags.length) {
            remove(tags[tags.length - 1])
          }
        }}
        placeholder={placeholder ?? 'Add tag…'}
        className="min-w-[6rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted"
      />
    </div>
  )

  const suggestionsLabel = !lower && (
    <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
      {showAll ? 'All tags' : 'Recent'}
    </p>
  )

  const suggestionsList = (
    <div className="flex flex-wrap content-start gap-1.5">
      {matches.map((s) => (
        <button
          key={s}
          onClick={() => add(s)}
          style={hotStyle(s)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs hover:border-primary hover:text-primary',
            hot(s) ? 'border-transparent text-content' : 'border-border text-muted',
          )}
        >
          #{s}
        </button>
      ))}
      {canCreate && (
        <button
          onClick={() => add(text)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <PlusIcon size={12} />
          Add “{trimmed}”
        </button>
      )}
    </div>
  )

  return (
    <div>
      {inputRow}
      {fixedHeight ? (
        <div className="mt-2 h-56 overflow-y-auto no-scrollbar">
          {suggestionsLabel}
          {matches.length > 0 || canCreate ? (
            suggestionsList
          ) : (
            <p className="pt-3 text-center text-xs text-muted">No matching tags</p>
          )}
        </div>
      ) : (
        (matches.length > 0 || canCreate) && (
          <div className="mt-2">
            {suggestionsLabel}
            {suggestionsList}
          </div>
        )
      )}
    </div>
  )
}
