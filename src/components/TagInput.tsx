import { useState } from 'react'
import { cn } from '@/lib/cn'
import { XIcon } from './icons'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  placeholder?: string
}

export default function TagInput({ tags, onChange, suggestions = [], placeholder }: Props) {
  const [text, setText] = useState('')

  const add = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setText('')
      return
    }
    onChange([...tags, t])
    setText('')
  }

  const remove = (t: string) => onChange(tags.filter((x) => x !== t))

  const lower = text.trim().toLowerCase()
  const unused = suggestions.filter(
    (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()),
  )
  // With no text typed yet, offer the most recently-used tags as one-tap
  // candidates; once typing starts, narrow to matches.
  const matches = lower
    ? unused.filter((s) => s.toLowerCase().includes(lower)).slice(0, 6)
    : unused.slice(0, 8)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface2 px-2 py-2">
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
