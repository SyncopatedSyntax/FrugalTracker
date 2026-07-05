import { useState } from 'react'
import { cn } from '@/lib/cn'
import { XIcon } from './icons'

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
}

export default function TagInput({
  tags,
  onChange,
  suggestions = [],
  placeholder,
  fill,
}: Props) {
  const [text, setText] = useState('')

  const add = (raw: string) => {
    onChange(addTag(tags, raw))
    setText('')
  }

  const remove = (t: string) => onChange(tags.filter((x) => x !== t))

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
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Recent
              </p>
              <div className="flex flex-wrap content-start gap-1.5">
                {unused.map((s) => (
                  <button
                    key={s}
                    onClick={() => add(s)}
                    className="rounded-full border border-border px-3 py-1 text-sm text-muted active:scale-95 hover:border-primary hover:text-primary"
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

  const lower = text.trim().toLowerCase()
  const matches = lower
    ? unused.filter((s) => s.toLowerCase().includes(lower)).slice(0, 6)
    : unused.slice(0, 8)

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

  return (
    <div>
      {inputRow}
      {matches.length > 0 && (
        <div className="mt-2">
          {!lower && (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Recent
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {matches.map((s) => (
              <button
                key={s}
                onClick={() => add(s)}
                className={cn(
                  'rounded-full border border-border px-2.5 py-1 text-xs text-muted',
                  'hover:border-primary hover:text-primary',
                )}
              >
                #{s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
