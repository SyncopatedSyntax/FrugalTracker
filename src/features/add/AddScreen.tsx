import { useEffect, useMemo, useRef, useState } from 'react'
import Segmented from '@/components/Segmented'
import CurrencyPickerSheet from '@/components/CurrencyPickerSheet'
import TagInput, { addTag } from '@/components/TagInput'
import Sheet from '@/components/Sheet'
import { Toast, useToast } from '@/components/Toast'
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  TagIcon,
} from '@/components/icons'
import CategoryGrid from './CategoryGrid'
import AmountKeypad from './AmountKeypad'
import BudgetPanel from './BudgetPanel'
import CategoryFormSheet from '@/features/categories/CategoryFormSheet'
import { useCategoriesByType, useSettings, useTags } from '@/hooks'
import { addTransaction } from '@/db/repo'
import { currencyDecimals, currencySymbol } from '@/lib/currency'
import { formatTypedAmount, parseAmount } from '@/lib/amount'
import { formatShortDate, todayISO } from '@/lib/date'
import type { TxType } from '@/db/types'
import { cn } from '@/lib/cn'

function dateLabel(iso: string): string {
  return iso === todayISO() ? 'Today' : formatShortDate(iso)
}

type Step = 0 | 1 | 2

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function AddScreen() {
  const settings = useSettings()
  const tagSuggestions = useTags().map((t) => t.name)
  const { message, show } = useToast()

  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [date, setDate] = useState(todayISO())

  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [catFormOpen, setCatFormOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [newTagOpen, setNewTagOpen] = useState(false)
  const [newTagText, setNewTagText] = useState('')

  // The 3-step thumb-zone flow: 0 = amount, 1 = category, 2 = tags/date/note.
  // `unlocked` is the highest step rendered — steps beyond it don't exist in
  // the DOM yet, so there is nothing to swipe forward into prematurely.
  // Swiping back over already-rendered steps works for free via native
  // scroll-snap; `step` just mirrors the current scroll position.
  const [step, setStep] = useState<Step>(0)
  const [unlocked, setUnlocked] = useState<Step>(0)
  const trackRef = useRef<HTMLDivElement>(null)
  // Tracks the live `step` for the delayed unlock-reset in `save()` below —
  // a ref (not the `step` state itself) so that closure doesn't go stale if
  // the user starts a new entry before the delay elapses.
  const stepRef = useRef<Step>(0)
  useEffect(() => {
    stepRef.current = step
  }, [step])

  const activeCurrency = currency ?? settings.baseCurrency
  const decimals = currencyDecimals(activeCurrency)
  const symbol = currencySymbol(activeCurrency)

  const cats = useCategoriesByType(type)
  const sortedCats = useMemo(
    () => [...cats].sort((a, b) => b.usageCount - a.usageCount || a.sortOrder - b.sortOrder),
    [cats],
  )

  // Clear selection if the chosen category isn't in the current type list.
  useEffect(() => {
    if (categoryId && !cats.some((c) => c.id === categoryId)) setCategoryId(null)
  }, [cats, categoryId])

  // Safety net: never leave the tags/date/note step reachable without a
  // valid category (e.g. the Expense/Income toggle just invalidated it).
  useEffect(() => {
    if (step === 2 && !categoryId) setStep(1)
  }, [step, categoryId])

  // Shared between the two effects below so a fresh transition can invalidate
  // a stale debounce timer left over from the previous one (see settle()).
  const settleTimerRef = useRef<number>()

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    // A new transition is starting: any pending debounced `settle` below is
    // necessarily stale (it was armed by the *previous* transition's scroll
    // ticks and hasn't fired yet) — left alone, it can fire moments from now
    // using the pre-transition scrollLeft and stomp the step we just set.
    window.clearTimeout(settleTimerRef.current)
    el.scrollTo({ left: step * el.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [step, unlocked])

  // Sync `step` from the track's scroll position, but only once scrolling has
  // *settled* (via `scrollend`, with a debounced fallback) — not on every
  // intermediate tick. Reacting mid-animation would race our own programmatic
  // scrollTo above: early frames of an in-flight scroll report the old
  // position, which would otherwise get written back into `step` and cancel
  // the transition before it reaches its target.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const settle = () => {
      if (el.clientWidth === 0) return
      const idx = Math.round(el.scrollLeft / el.clientWidth) as Step
      setStep((prev) => (prev === idx ? prev : idx))
    }
    const onScroll = () => {
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = window.setTimeout(settle, 120)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', settle)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', settle)
      window.clearTimeout(settleTimerRef.current)
    }
  }, [])

  const amt = parseAmount(amount)
  const canSave = amt > 0 && !!categoryId

  const goNext = () => {
    if (!(amt > 0)) return
    setUnlocked(1)
    setStep(1)
  }

  const selectCategory = (id: string) => {
    setCategoryId(id)
    setUnlocked(2)
    setStep(2)
  }

  const save = async () => {
    if (!canSave || !categoryId) return
    await addTransaction({
      type,
      amount: amt,
      currency: activeCurrency,
      categoryId,
      note: note.trim(),
      tags,
      date,
    })
    navigator.vibrate?.(12)
    show(type === 'expense' ? 'Expense saved' : 'Income saved')
    setAmount('')
    setCategoryId(null)
    setNote('')
    setTags([])
    setNewTagText('')
    setDate(todayISO())
    setStep(0)
    // Let the slide-back settle before dropping steps 2 & 3 from the DOM, so
    // the reset never shows as an abrupt cut mid-transition. Guarded on
    // stepRef so that if the user has already advanced into a new entry
    // before this fires, it doesn't clobber that in-progress step.
    window.setTimeout(() => {
      if (stepRef.current === 0) setUnlocked(0)
    }, 350)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top part: reacts to the entry in progress (all-categories until a
          category is picked, then that category's budget/average) */}
      <div className="safe-top">
        <BudgetPanel type={type} categoryId={categoryId} />
      </div>

      {/* Middle band: type toggle + currency stacked to one side, sharing a
          single row with the live amount instead of three stacked rows —
          frees up more height for the step track below. */}
      <div className="flex items-center justify-center gap-4 px-4 pt-3">
        <div className="flex flex-col items-center gap-1.5">
          <Segmented
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            value={type}
            onChange={setType}
            activeClass={cn('text-white shadow', type === 'expense' ? 'bg-expense' : 'bg-income')}
          />
          <button
            onClick={() => setCurrencyOpen(true)}
            className="rounded-full bg-surface2 px-3 py-1 text-xs font-semibold text-muted active:scale-95"
          >
            {activeCurrency}
          </button>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-medium text-muted">{symbol}</span>
          <span
            className={cn(
              'text-5xl font-bold tabular-nums',
              amt > 0 ? 'text-content' : 'text-muted/60',
            )}
          >
            {formatTypedAmount(amount)}
          </span>
        </div>
      </div>

      {/* Purely visual step progress — navigation is by swipe, not tapping */}
      <div className="flex justify-center gap-1.5 py-2.5">
        {([0, 1, 2] as const).map((i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === step ? 'w-5 bg-primary' : 'w-1.5 bg-border',
            )}
          />
        ))}
      </div>

      {/* Swipeable 3-step track, fills the thumb zone */}
      <div
        ref={trackRef}
        className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {/* Step 0: amount keypad — fills the thumb zone exactly (no gap, no clip) */}
        <div className="h-full w-full flex-shrink-0 snap-start">
          <AmountKeypad
            fill
            value={amount}
            onChange={setAmount}
            decimals={decimals}
            onSubmit={goNext}
            submitDisabled={!(amt > 0)}
            submitLabel="Next"
            submitIcon={ChevronRightIcon}
            accent={type}
          />
        </div>

        {/* Step 1: category */}
        {unlocked >= 1 && (
          <div className="relative h-full w-full flex-shrink-0 snap-start overflow-y-auto px-3 pt-2 no-scrollbar">
            <ChevronLeftIcon size={16} className="absolute left-1.5 top-1.5 text-muted/40" />
            {sortedCats.length === 0 && (
              <p className="mb-3 text-center text-sm text-muted">
                No {type} categories yet. Tap “New” to create one.
              </p>
            )}
            <CategoryGrid
              categories={sortedCats}
              selectedId={categoryId}
              onSelect={selectCategory}
              onAddNew={() => setCatFormOpen(true)}
            />
          </div>
        )}

        {/* Step 2: New tag / Note / Date sit in one compact row at the top —
            each opens a sheet — so the recent-tags grid below gets nearly all
            the remaining space and can scroll as long as needed. No scrolling
            needed to reach Save. */}
        {unlocked >= 2 && (
          <div className="relative flex h-full w-full flex-shrink-0 snap-start flex-col">
            <ChevronLeftIcon size={16} className="absolute left-1.5 top-1.5 text-muted/40" />
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pt-6">
              <div className="flex flex-shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => setNewTagOpen(true)}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface2 px-2 text-sm font-medium text-content active:scale-[0.98]"
                >
                  <TagIcon size={15} className="flex-shrink-0 text-muted" />
                  <span className="truncate">New tag</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNoteOpen(true)}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface2 px-2 text-sm font-medium text-content active:scale-[0.98]"
                >
                  <PencilIcon size={15} className="flex-shrink-0 text-muted" />
                  <span className="truncate">{note.trim() || 'Note'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDateOpen(true)}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface2 px-2 text-sm font-medium text-content active:scale-[0.98]"
                >
                  <CalendarIcon size={15} className="flex-shrink-0 text-muted" />
                  <span className="truncate">{dateLabel(date)}</span>
                </button>
              </div>
              <TagInput fill tags={tags} onChange={setTags} suggestions={tagSuggestions} />
            </div>
            <div className="flex-shrink-0 px-4 pb-2 pt-2">
              <button
                type="button"
                onClick={save}
                disabled={!canSave}
                className={cn(
                  'flex h-14 w-full items-center justify-center gap-2 rounded-[22px] text-lg font-semibold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none',
                  type === 'expense' ? 'bg-expense' : 'bg-income',
                )}
              >
                <CheckIcon size={22} />
                {type === 'expense' ? 'Add expense' : 'Add income'}
              </button>
            </div>
          </div>
        )}
      </div>

      <Toast message={message} />

      <CurrencyPickerSheet
        open={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        value={activeCurrency}
        onSelect={setCurrency}
      />

      <CategoryFormSheet
        open={catFormOpen}
        onClose={() => setCatFormOpen(false)}
        defaultType={type}
        onSaved={(id) => selectCategory(id)}
      />

      <Sheet
        open={newTagOpen}
        onClose={() => {
          setNewTagOpen(false)
          setNewTagText('')
        }}
        title="New tag"
      >
        <input
          type="text"
          autoFocus
          value={newTagText}
          onChange={(e) => setNewTagText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              setTags((t) => addTag(t, newTagText))
              setNewTagText('')
            }
          }}
          placeholder="Type a tag…"
          className="w-full rounded-xl border border-border bg-surface2 px-3.5 py-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => {
            setTags((t) => addTag(t, newTagText))
            setNewTagText('')
            setNewTagOpen(false)
          }}
          className="mt-4 w-full rounded-[22px] bg-primary py-3 text-base font-semibold text-primary-fg"
        >
          Done
        </button>
      </Sheet>

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Note">
        <input
          type="text"
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setNoteOpen(false)}
          placeholder="What was it for?"
          className="w-full rounded-xl border border-border bg-surface2 px-3.5 py-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setNoteOpen(false)}
          className="mt-4 w-full rounded-[22px] bg-primary py-3 text-base font-semibold text-primary-fg"
        >
          Done
        </button>
      </Sheet>

      <Sheet open={dateOpen} onClose={() => setDateOpen(false)} title="Date">
        <input
          type="date"
          autoFocus
          value={date}
          max={todayISO()}
          onChange={(e) => {
            setDate(e.target.value || todayISO())
            setDateOpen(false)
          }}
          className="w-full rounded-xl border border-border bg-surface2 px-3.5 py-3 text-sm outline-none focus:border-primary"
        />
      </Sheet>
    </div>
  )
}
