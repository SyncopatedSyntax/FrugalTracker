import Sheet from '@/components/Sheet'
import { formatMoney } from '@/lib/currency'

/** What the rings are measuring against, which changes both the wording and
 * the arithmetic worth explaining. */
export type RingBasis = 'budget' | 'average' | 'none'

interface Props {
  open: boolean
  onClose: () => void
  /** Expense rings compare against a prorated monthly figure; income rings
   * compare against the same stretch of last year. */
  mode: 'expense' | 'income'
  /** Expense only — income ignores these three. */
  basis?: RingBasis
  /** The monthly budget or rolling average the targets are derived from. */
  monthly?: number
  base: string
  /** The category the panel is scoped to, or "All categories". */
  scope?: string
}

/** Explains what the Add screen's three rings compare and how the numbers are
 * derived. The panel shows a bare "478%" against a prorated target that is
 * never spelled out on screen, which reads as alarming without the context
 * that it is measured against a *part* of a month, not a whole one. */
export default function BudgetInfoSheet({
  open,
  onClose,
  mode,
  basis = 'none',
  monthly = 0,
  base,
  scope = '',
}: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="How these rings work" className="max-h-[80vh]">
      {mode === 'income' ? <IncomeHelp /> : <ExpenseHelp basis={basis} monthly={monthly} base={base} scope={scope} />}
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      {children}
    </div>
  )
}

function Formula({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 rounded-xl bg-surface2 px-3 py-2 last:mb-0">
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{children}</p>
    </div>
  )
}

function ExpenseHelp({
  basis,
  monthly,
  base,
  scope,
}: {
  basis: RingBasis
  monthly: number
  base: string
  scope: string
}) {
  if (basis === 'none') {
    return (
      <p className="text-sm leading-relaxed text-muted">
        These rings compare what you've spent so far against a monthly target — either a budget you
        set for this category, or your own average monthly spend on it. {scope} has neither yet, so
        there's nothing to measure against and each ring shows a dash. Set a budget, or record a
        month or two of spending, and they'll start filling in.
      </p>
    )
  }

  const amount = formatMoney(monthly, base)

  return (
    <>
      <p className="text-sm leading-relaxed">
        Each ring is what you've spent on <span className="font-semibold">{scope}</span> so far this
        week, month and year — measured against the slice of a monthly figure that should have been
        spent by now, not the whole month's worth.
      </p>

      <Section title={basis === 'budget' ? 'The monthly figure' : 'The monthly figure (no budget set)'}>
        {basis === 'budget' ? (
          <p className="text-sm leading-relaxed text-muted">
            Your budget for {scope}: <span className="font-semibold tabular-nums text-content">{amount}</span> a
            month.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted">
            No budget is set, so this uses what you actually spend:{' '}
            <span className="font-semibold tabular-nums text-content">{amount}</span> a month on average over
            the last 12 <em>complete</em> months. The current month is left out so a half-finished
            month can't drag the average down, and the window shrinks to however much history you
            have.
          </p>
        )}
      </Section>

      <Section title="How each target is worked out">
        <Formula label="Week">
          {amount} × (days into this week ÷ days in this month)
        </Formula>
        <Formula label="Month">
          {amount} × (today's date ÷ days in this month)
        </Formula>
        <Formula label="Year">
          {amount} × (whole months finished this year + today's date ÷ days in this month)
        </Formula>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Everything is scaled off the one monthly figure, which is why even the weekly target is
          counted in days of this month rather than as a quarter of it. The small print under each
          ring is spent / target.
        </p>
      </Section>

      <Section title="The percentage and the colours">
        <p className="text-sm leading-relaxed text-muted">
          Spent ÷ target. Below 80% the ring stays in the category's own colour, from 80% it turns
          amber, and past 100% it turns red. The ring stops at one full lap rather than looping
          round again, so the number in the middle is the honest one — a reading of 300% means
          three times what the target allows for this far into the month, not three laps of it.
        </p>
      </Section>

      <Section title="What counts">
        <p className="text-sm leading-relaxed text-muted">
          Expenses only, {scope === 'All categories' ? 'across every category' : `in ${scope}`},
          converted to {base}. Week starts on whichever day you picked in settings; year runs from
          1 January.
        </p>
      </Section>
    </>
  )
}

function IncomeHelp() {
  return (
    <>
      <p className="text-sm leading-relaxed">
        For income there's no budget to measure against, so each ring compares what you've earned so
        far this week, month and year against{' '}
        <span className="font-semibold">the same stretch of last year</span>.
      </p>

      <Section title="How each comparison is worked out">
        <Formula label="Week">income since the start of this week vs the same dates a year ago</Formula>
        <Formula label="Month">income since the 1st vs the 1st to this date a year ago</Formula>
        <Formula label="Year">income since 1 January vs 1 January to this date a year ago</Formula>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Both ends of the range shift back exactly one year, keeping the day of the month, so
          you're always comparing a like-for-like stretch. The figure under each ring is this
          year's total.
        </p>
      </Section>

      <Section title="The percentage and the colours">
        <p className="text-sm leading-relaxed text-muted">
          This year ÷ last year. Here, more is the good outcome, so hitting 100% turns the ring
          green rather than red — 140% means you've earned 40% more than by this point last year.
          If there was no income in that stretch last year, there's nothing to compare and the ring
          shows a dash.
        </p>
      </Section>
    </>
  )
}
