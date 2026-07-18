# FrugalTracker — Codebase Review & Dev Reference

**Reviewed:** 2026-07-10, at v0.9.0 (branch `claude/expense-tracker-pwa-319tcf`). **Updated:** same day, at v0.9.2, once B2 was fixed (see §2); updated again at v0.9.3 once B1, B3, T1, P1, P2, and U1 were fixed; updated again at v0.9.14 once P3 was fixed; updated again at v1.0.3 once U7 (recurring transactions, shipped v0.9.23) and B9 (native date-input rendering, shipped v1.0.2) were accounted for.
**Scope:** full pass over the data layer (`src/db`), pure libs (`src/lib`), all feature screens, shared components, and the PWA shell. Findings are grouped by kind and tagged by severity. Everything below is still open **except B1, B2, B3, B9, T1, P1, P2, P3, U1, and U7**, which are now fixed — the rest remains the backlog and reference for future work.

---

## 1. Architecture snapshot (orientation for future devs)

- **Stack:** React 18 + Vite + TS, Tailwind (CSS-variable tokens, `darkMode: 'class'`), Dexie v4 on IndexedDB, `vite-plugin-pwa` (Workbox, `autoUpdate` + `skipWaiting`), React Router.
- **Data flow:** all reads go through `useLiveQuery` hooks in `src/hooks/index.ts`; all writes go through `src/db/repo.ts`. Screens never touch Dexie directly (except `DataScreen`'s clear/restore, via `lib/backup.ts`).
- **Money model:** `Transaction.amount` is a positive magnitude + `currency`; sign comes from `type`. Since v0.9.2, every transaction also locks in `baseAmount`/`baseRate` at save/edit time (see §2 B2 — resolved) — aggregation reads that locked snapshot, not a live conversion, so a later exchange-rate edit never rewrites historical totals. `lib/convert.ts`'s `toBase`/`convert` are now only used to *compute* a fresh snapshot at write time (`rates` table stores "1 unit of X in base"; base always rate 1; missing rate falls back to 1:1 by design).
- **Dates:** local-calendar `"YYYY-MM-DD"` strings everywhere; `lib/date.ts` is deliberately UTC-free (`toISO`/`parseISO` use local fields). **Any `new Date(isoString)` elsewhere is a smell** — see B1 (resolved v0.9.3) for what it broke and how it was fixed (`shiftYears`, a day-preserving year shift, alongside the existing month-anchored `addYears`).
- **Native `<input type="date">` is never styled and shown directly** — always use the invisible-overlay pill pattern (`EditTransactionScreen.tsx`, `AddScreen.tsx`, `RecurringScreen.tsx`): a fully custom, non-native `div` shows the formatted date, and the real `<input type="date">` sits on top at `absolute inset-0 opacity-0`, invisible but still focusable to drive the OS picker. See B9 (§2, resolved v1.0.2) — some mobile WebKit builds render the native control's own segments+icon wider than the box it's given regardless of CSS, and headless-Chromium testing (the only browser automation available in this environment) does not reproduce it, so a raw date input can measure clean here and still overflow on a real phone.
- **Pure logic lives in `src/lib`** (`calc.ts`, `budgetMath.ts`, `spendeeImport.ts`, `date.ts`, `filters.ts` in transactions, `compute.ts`/`period.ts` in insights) and is unit-testable without React — `calc.ts`, `budgetMath.ts`, and `date.ts` now have Vitest coverage (§5, T1); `spendeeImport.ts` and `filters.ts` still don't.
- **App shell:** `#root` is `position: fixed; inset: 0` (the iOS-standalone viewport bug fix — see prompt.md §29–33 for the full saga; don't regress this). Every screen manages its own inner scroll region. Status bar style is `black` on iOS on purpose (`black-translucent` shrinks the web view and re-opens the bottom-gap bug).

---

## 2. Bugs (correctness)

### B1 · RESOLVED (v0.9.3) — "Income vs last year" compared against the wrong date range
Was: `lib/budgetMath.ts → sameRangeLastYear()` shifted a range back a year with `addYears(new Date(range.startISO), -1)`. Two problems compounded: `addYears()` is a month-anchor helper that resets the day-of-month to 1 (turned *June 29 – July 5* into *June 1 – July 1* of last year), and `new Date('2026-06-29')` parses as UTC midnight, so timezones west of UTC were off by a day before the shift even ran. The same raw-`new Date(iso)` smell was also in `rollingMonthlyAverage()`'s `new Date(earliestTxDate)`, which could mis-clamp the averaging window by a month at month boundaries.

**Fix:** added `date.ts → shiftYears(d, n)`, a day-preserving year shift (clamps Feb 29 → Feb 28 for a non-leap target year) built from local `Date` components, never a raw ISO string parse. `sameRangeLastYear()` now does `shiftYears(parseISO(range.startISO), -1)`; `rollingMonthlyAverage()` now parses `earliestTxDate` with `parseISO` instead of `new Date(...)`. Regression-tested in `budgetMath.test.ts` with `process.env.TZ` forced to `America/New_York` so the fix is verified against the exact west-of-UTC off-by-one this bug depended on (confirmed the old code reproduces the bug under that TZ; the new code doesn't).

### B2 · RESOLVED (v0.9.2) — Changing base currency silently re-denominated budgets and opening balance; transaction amounts weren't locked in at all
Originally: `changeBaseCurrency()` re-anchored the rates table only, leaving `Budget.amount` and `Settings.openingBalance` numerically unchanged (a "$500" budget silently became "C$500"). Investigating it surfaced a bigger, related gap: transaction amounts were converted to base **live, at read time** — editing an exchange rate months later silently rewrote every past total that touched that currency, with no way to "lock in" a rate as of when an entry was logged.

**Fix implemented:** `Transaction` gained `baseAmount`/`baseRate` — computed once at `addTransaction`/import time from the live rate table and stored permanently; every aggregation site (`compute.ts`, `budgetMath.ts`, `BudgetsScreen`, `TransactionsScreen`, `TransactionRow`) now reads `t.baseAmount` directly instead of re-converting via `toBase(t.amount, t.currency, rates)`, so a later rate edit no longer touches historical figures. `updateTransaction` keeps the previously-locked rate when only the amount changes, fetches a fresh live rate if the currency changes, and accepts an explicit `baseRateOverride` — surfaced in `EditTransactionScreen` as an editable "1 EUR = _ USD" field (defaults to the locked rate, editable, with a "≈ $X locked in" preview). `changeBaseCurrency` now rescales `Budget.amount` (+ sets its `currency`), `Settings.openingBalance`, and every transaction's `baseAmount`/`baseRate` by the same factor the rates table itself is re-anchored by — all in one atomic transaction. A `backfillBaseAmounts()` migration (idempotent, runs on every boot and after a backup restore) fills in the fields for rows that predate this feature, using today's rate table as the best available approximation (historical per-transaction rates were never recorded, so this is a one-time backfill, not a retroactive lock).

**A real bug found while building the fix:** `updateTransaction`'s `db.transaction(...)` call didn't declare `db.settings`/`db.rates` as participating tables, but the new code read from them inside that transaction (to resolve the base currency and live rates) — Dexie silently rolled back the *entire* transaction when that happened, so edits to amount/currency/category were dropped with no error surfaced to the user (only a console `NotFoundError`). Fixed by adding both tables to the transaction's declaration. This is a sharp Dexie edge: **any table read or written inside a `db.transaction(...)` callback must be listed in that call's arguments**, even for a simple `.get()`.

Verified end-to-end in headless Chromium: added a €100 transaction (rate 1.1) → locked `baseAmount=110`; changed the live EUR rate to 1.5 → the transaction's stored amount stayed `110` (not `150`); edited the amount only (100→200) → kept the locked rate (`baseAmount=220`, not 300); edited the rate explicitly to 1.5 → `baseAmount=300`; switched base currency USD→EUR (divisor 1.5) → a 500-unit budget became `333.33` EUR, opening balance `1000`→`666.67`, and the transaction's `baseAmount` `300`→`200` with `baseRate` reset to `1`. Also verified the legacy-row backfill (a hand-inserted row with no `baseAmount` field was correctly backfilled on the next boot) and a full-app smoke test (Add/Activity/Insights/Budgets/Edit screens, multi-currency data) — zero console errors throughout.

### B3 · RESOLVED (v0.9.3) — Week proration ignored the first-day-of-week setting
Was: `budgetMath.ts → prorateMonthly()` hardcoded `startOfWeek(now, 1)` (Monday), while the ring's numerator (`periodRange('week', …, firstDayOfWeek)`) honored the user's Sunday/Monday setting — Sunday-start users got a mismatched week ring (spend measured from Sunday, target prorated from Monday).

**Fix:** `prorateMonthly` now takes `firstDayOfWeek: 0 | 1` and uses it in place of the hardcoded `1`; `BudgetPanel`'s `ExpenseCompare` (which already had `firstDayOfWeek` as a prop) passes it through. Covered in `budgetMath.test.ts` for both anchor days.

### B9 · RESOLVED (v1.0.2) — Native date inputs rendered oversized on real mobile Safari; invisible to headless-Chromium testing, took 3 rounds to actually fix
Was: `RecurringScreen.tsx`'s Start/End date fields used raw `<input type="date">` elements. Reported three times against what looked, in headless Chromium at every viewport tested (320/393/440/512px), like a clean, non-overflowing layout each time: "stacking on top of each other" (v1.0.0 trigger), then "still scroll[s] horizontally" after the first fix, then "still wider than the screen" after the second. The actual cause: some mobile WebKit builds size the native date control's own segments+calendar-icon at a width they decide internally, ignoring the `width: 100%`/box-sizing given to it — and headless Chromium (the only browser automation available in this environment) simply doesn't reproduce that behavior, so a screen that measures perfectly here can still fail on a real device.

**Round 1 (v1.0.0):** treated it as a layout bug — two `flex-1` date inputs squeezed to 50% width, fighting their own intrinsic minimum content width. Restacked into a single column. Verified clean in headless Chromium; wasn't actually fixed on-device.
**Round 2 (v1.0.1):** added `overflow-x-hidden` to `Sheet.tsx`'s outer dialog panel and inner scroll area as a containment floor. Stopped the page-level horizontal scroll, but the native control was still rendering wider than its box — just clipped instead of causing scroll.
**Fix (v1.0.2):** stopped trying to tame the native control's own rendering and switched to the pattern already proven elsewhere in this app (`EditTransactionScreen.tsx`, `AddScreen.tsx`): a fully custom, non-native `div` "pill" shows the formatted date (`dateLabel(iso)`: "Today" or a short date) plus a calendar icon, with the real `<input type="date">` stacked on top via `absolute inset-0 opacity-0 cursor-pointer` — invisible, but still focusable/tappable, so it captures the tap and opens the OS's native picker while every visible pixel is our own markup, immune to any native-control sizing quirk. Applied to `RecurringScreen.tsx`'s Starts/Ends fields.

**Lesson for future date inputs:** never add a raw styled `<input type="date">` to this app — start with the invisible-overlay pill pattern from the first commit (copy `EditTransactionScreen.tsx`/`AddScreen.tsx`/`RecurringScreen.tsx`). A clean headless-Chromium pass is not sufficient evidence a date input renders correctly on real mobile Safari; treat it as inconclusive for this specific class of bug until confirmed on an actual device.

**Verified:** rendered pill boxes measured 292px inside a 320px viewport (zero overflow); clicking the invisible input opens without error; setting a date through the input correctly updates the visible pill label and flows through to successfully creating a rule.

### B5 · LOW — Amount survives a currency switch with too many decimals
On the Add screen, typing `12.34` then switching currency to JPY (0 decimals) keeps `12.34` as the entry; it can be saved with sub-unit decimals in a currency that has none. Pre-dates the calculator. **Fix:** on currency change, round `calc.cur` (and Edit screen's `amount`) to the new `currencyDecimals`.

### B6 · LOW — Full-screen calculator accepts malformed decimals
`CalculatorSheet` has no guard against a second `.` in one number; `"1.2.3"` tokenizes as `1.2` silently (the tokenizer consumes the whole digit-dot run with one `parseFloat`). **Fix:** track "current number has a dot" in `push('.')`, like the inline pad does.

### B7 · LOW — Cosmetics in money formatting
`formatMoneyCompact`: values like `999.6` format with 0 decimals → "1,000" (crosses the compact threshold visually). Also `exportCSV`'s sort comparator never returns 0 for equal dates (unstable order between same-day rows). Both harmless; noted for polish.

### B8 · LOW — `updateSettings` is a non-transactional read-modify-write
Two rapid `updateSettings` calls can clobber each other (last write wins over a stale read). Practically rare (single user, single tab), but wrapping in `db.transaction('rw', db.settings, …)` is a one-liner.

---

## 3. UX / product gaps & suggestions

| # | Area | Note |
|---|------|------|
| U1 | Calculator sheet | ~~A negative result leaves **Use amount** disabled with no explanation.~~ **Resolved (v0.9.3):** an inline hint below the keypad now explains why — "Enter a calculation" when nothing's typed yet, "Result must be greater than zero" when it resolves to ≤ 0 — reserving its own line so the layout doesn't jump when the hint appears/disappears. |
| U2 | Calculator sheet | After **Use amount**, the user still has to press **Next**. Consider auto-advancing to the category step (matches the "result is the amount" mental model). |
| U3 | Reach mode | The on-the-fly gutter flip is session-only by design; the Settings value re-asserts on reload. Consider persisting the flip (it *is* an expressed preference) or at least keeping it for the app session across tab switches (it currently resets if settings re-emit). |
| U4 | Edit screen | ~~`EditTransactionScreen` uses the plain keypad — no calculator, no reach; a mismatch with Add.~~ **Resolved (v0.9.5):** rather than reaching for keypad parity, the edit screen was rebuilt as a purpose-fit **single-screen form** — correcting an entry is a different job from logging one, so every field (amount, currency, locked rate, category grid, date, note, tags) is now visible and directly editable at once instead of behind a keypad + a "Details" sheet. Amount is a native decimal input (decimals clamped per currency); the locked-rate row + base-equivalent preview are preserved. No keypad/calculator/reach on this screen by design. |
| U5 | Tag casing | The tags table lowercases names (`bumpTags`), so suggestions/labels show "rc cars" while transactions preserve "RC Cars". Store a `display` casing on the tag row (first-seen, like `labelBreakdown` does) for consistent chips. |
| U6 | Rates | Correction to an earlier draft of this review: online refresh *does* exist (`CurrenciesScreen`'s "Update online" button fetches `open.er-api.com`) — the README's claim is accurate, not drift. Real gap: it has no offline/error affordance beyond a toast, and no "last updated" staleness indicator on the rates list itself (only in the per-currency edit sheet's underlying `updatedAt`, which isn't surfaced in the UI). |
| U7 | Recurring transactions | ~~Most-requested Spendee feature likely to be missed: scheduled/recurring entries (rent, subscriptions). The data model would need a `recurrence` table + materialization on launch.~~ **Resolved (v0.9.23):** implemented as `RecurringTransaction` (own Dexie table `db.recurringTransactions`, schema v4) with a dedicated `RecurringScreen.tsx` under More, frequency math in `lib/date.ts`/`db/recurring.ts` (daily/weekly/biweekly/monthly/yearly, missed occurrences backfilled), and `generateDueRecurringTransactions()` materializing due entries via the normal `addTransaction()` path on app open. Included in `buildBackup()`/`restoreBackup()` and Demo Mode's snapshot-and-swap. |
| U8 | iOS status bar | `black` status-bar style shows a black strip in light theme. Acceptable trade-off (see §1), but a future option: theme-aware `theme-color` meta (`media="(prefers-color-scheme: …)"` pair or JS-updated) so at least browser-tab/Android chrome matches. Do **not** return to `black-translucent`. |
| U9 | Deleting a category with transactions | Verified handled: `CategoriesScreen` disables the delete button while `categoryTxCount > 0`, so orphaned `categoryId`s can't happen through the UI (only via a malformed backup restore — see §7). A "reassign transactions then delete" flow would still be a nice upgrade over a disabled button. |
| U10 | Backup versioning | `BackupFile.version = 1` is written but never checked on restore. Add a version gate + migration hook before the schema evolves further. |
| U11 | Analytics depth over time | Insights was strong on the current period but thin on *trends*. A product-review roadmap (approved) adds, in order: **category detail screen** (12-mo trend + MoM/YoY — resolved v1.1.0, `CategoryDetailScreen.tsx` at `/insights/category/:id`, helpers `monthlySeriesFor`/`deltaVs` in `compute.ts`), a period **savings-rate** stat (resolved v1.2.0 — `savingsRate()` in `compute.ts`, shown on the Overview view under Income/Expenses), a **budget-views** package (resolved v1.4.0 — `BudgetsScreen.tsx` is now a sortable/filterable all-budgets overview, rows drill into `BudgetDetailScreen.tsx` at `/more/budgets/:id` showing cumulative-YTD pace + a 12-month spent-vs-limit history; helpers `budgetHistory()`/`budgetYtdPace()` in `budgetMath.ts`; shared `BudgetFormSheet.tsx`), and a **calendar heatmap** Insights view (resolved v1.3.0 — `CalendarHeatmap.tsx`, a 4th "Calendar" Insights view; helper `dailyTotals()` in `compute.ts`; month-navigating grid shaded by daily expense, honors `firstDayOfWeek`, tap a day → its transactions). All four roadmap phases are now shipped. Tag/label detail parity and accounts/transfers remain explicitly out of scope. |

---

## 4. Performance notes

- **P1 · RESOLVED (v0.9.3) — BudgetPanel recomputed on every keystroke.** Was: every digit press re-rendered `AddScreen`, so `BudgetPanel` re-ran `sumInRange` ×3 + `rollingMonthlyAverage` over *all* transactions on every keystroke. **Fix:** wrapped the default export in `React.memo(BudgetPanel)` — its props (`type`, `categoryId`) are primitives, and its own `useLiveQuery` hooks already re-render it correctly whenever the underlying data actually changes, so memoizing loses nothing.
- **P2 · RESOLVED (v0.9.3) — `currencyDecimals()` built an uncached `Intl.NumberFormat` per call**, and it was called on every AddScreen render. **Fix:** added a `Map<string, number>` cache keyed by currency code, mirroring the existing `formatter()` cache in the same file.
- **P3 · RESOLVED (v0.9.14) — `useAllTransactions()` loaded and sorted the whole table** on every screen that used it (Activity, Insights, BudgetPanel).
  **Fix:** `InsightsScreen` now fetches `useTransactionsInRange(fetchStart, period.endISO)`, where `fetchStart` is the earliest of the viewed period's start, the opening-balance date (if set), and the account's true earliest transaction (itself now a cheap indexed lookup — `useEarliestTransactionDate()`, `db.transactions.orderBy('date').first()` — instead of reducing over every row). This is provably identical to the old full-table fetch for every consumer: `periodTxs` only ever needed `[period.startISO, period.endISO]`; the wealth chart's cumulative `balanceSeries` discards anything before `openingDateISO` internally regardless of what it's handed, so widening the fetch to include the opening-balance date (rather than truncating exactly at the period boundary) reproduces the exact same running balance. "All time" view still (correctly) fetches full history — that's inherent to what it's asking for, not something to optimize away. `BudgetPanel` now fetches `useTransactionsInRange('<Jan 1 of last year>', today)` — every ring on it (this/last year's week, month, or year to date, plus the trailing-12-month rolling average) is provably bounded within that window. Activity (`TransactionsScreen`) still fetches full history via `useAllTransactions()` (search/filter genuinely need it), but now only mounts a page of rows at a time (60, with a "Load more" button), resetting on every new search/filter — the actual scaling risk there was DOM cost, not the Dexie read.
  **Verified:** re-ran the exact Demo Mode dataset (deterministic, ~700 transactions over 26 months) through the same Year/Year-1/Year-2/All-time navigation from before this fix and confirmed every figure (Total Wealth, Cash flow, Income, Expenses) came back byte-identical; confirmed BudgetPanel's rings still render correctly; confirmed Activity's search still finds matches (e.g. `#vacation`) anywhere across the full history despite only 60 rows being mounted, and "Load more" reveals further rows correctly. `npm run build` and `npx vitest run` (80 tests) both clean, zero console errors.
- **P4 — Sequential awaits in loops** (`bumpTags`, `reorderCategories`, import usage bumps) — all inside transactions, so they're fast enough; Dexie `bulkPut` would be marginally cleaner, not urgent.

---

## 5. Code health & tooling

- **T1 · RESOLVED (v0.9.3) — No tests.** Added Vitest (`npm test` → `vitest run`; `vitest.config.ts` mirrors the `@/*` alias from `tsconfig`/`vite.config`). 51 tests across three co-located suites: `lib/date.test.ts` (ISO round-trips, `startOfWeek` for both anchor days, `addDays`/`addMonths`/`addYears`, the new `shiftYears` incl. leap-year clamping, `daysInMonth`, day-header/short-date formatting), `lib/budgetMath.test.ts` (`periodRange`, `prorateMonthly` incl. the B3 firstDayOfWeek threading, `sameRangeLastYear` and `rollingMonthlyAverage` incl. the B1 regression forced under `TZ=America/New_York`, `sumInRange`), and `lib/calc.test.ts` (the inline state machine — iOS-style percent, chaining, operator-swap — and `evaluateExpression`'s shunting-yard: parentheses, precedence, malformed/half-typed tolerance, float-noise rounding). `lib/spendeeImport.ts` and `transactions/filters.ts` remain untested — good next candidates, not covered by this pass. Still no committed Playwright smoke test (verification remains ad-hoc, per-session).
- **T2 — No linter.** `npm run lint` is just `tsc --noEmit`. Add ESLint (typescript-eslint + react-hooks) — e.g. the intentional mount-only effect in `TransactionsScreen` and `BudgetsScreen`'s suppressed exhaustive-deps deserve explicit, checked suppressions.
- **T3 — `AmountKeypad` prop contract is awkward.** In calc mode, `value`/`onChange` are required but unused (`onChange={() => {}}` at the call site). Make the props a discriminated union (`{ mode: 'plain', value, onChange } | { mode: 'calc', calc }`) or split the component.
- **T4 — Dead code:** `applyKey` re-export in `AmountKeypad` (nothing imports it anymore; the logic lives in `lib/calc.ts → applyAmountKey`). `Settings.seededDefaults` is written but never read ("reserved").
- **T5 — Dexie schema discipline.** Still on `version(1)`. New *fields* (e.g. `calculatorMode`, `keypadReach`) need no migration (defaults merge in `useSettings`/`getSettings`), but any new *index* requires `version(2).stores(…)` — document this in the class when it first happens.
- **T6 — Error handling.** `save()`/repo writes have no try/catch; an IndexedDB failure (private-mode quota, eviction) fails silently. A tiny toast-on-rejection wrapper around repo calls, plus one React error boundary above the router, would cover the realistic failure modes.
- **T7 — README drift.** Describes Insights as "Monthly/Yearly/All-time" (now Week/Month/Year/All/Custom with Overview/Categories/Labels), and predates the budget dashboard, calculator, reach mode, and locked-in transaction rates (§2 B2). The "online refresh" claim is accurate (see U6 correction) — no fix needed there. Refresh the rest when convenient.

---

## 6. Accessibility

- **A1 —** `index.html` sets `maximum-scale=1.0, user-scalable=no`: pinch-zoom is blocked (modern iOS partially ignores it, Android doesn't). Given fixed-viewport UX this is a deliberate choice, but it's a WCAG 1.4.4 exception worth revisiting — consider allowing zoom and testing the shell.
- **A2 —** `Sheet.tsx` dialogs have `role="dialog"`/`aria-modal` and Escape handling but **no focus trap or focus restore**; keyboard/screen-reader focus can wander behind the overlay.
- **A3 —** Good coverage of `aria-label`s on icon buttons (keypad, gutter, filters). Gaps: donut slices and chart SVGs have no text alternative; the step-progress dots are purely visual (fine — they're decorative, but mark them `aria-hidden`).
- **A4 —** Color-only signals: over-budget is color + percentage (OK); expense/income amounts rely on color + sign (OK). No issues beyond the standard "verify contrast of `--c-muted` on `--c-surface2`" check in light theme.

---

## 7. Security & privacy

- Local-only by design; no network calls besides same-origin asset fetches and the SW update check. No `dangerouslySetInnerHTML`; imported CSV strings render as text (React-escaped) — no XSS vector found.
- IndexedDB and JSON backups are **unencrypted**: anyone with device access can read them. If "app lock" ever becomes a request, note that real at-rest encryption in a PWA is limited — set expectations accordingly.
- `restoreBackup` trusts the file shape beyond `isValidBackup`'s shallow check (no per-row validation). A hand-crafted JSON can insert malformed rows that later crash renders (e.g. `tags: null`). Cheap hardening: coerce/validate rows during restore.

---

## 8. Suggested priority order

1. ~~**B1** income-vs-last-year ranges~~ — **resolved in v0.9.3**, see §2.
2. ~~**B2** base-currency change re-denomination~~ — **resolved in v0.9.2**, see §2.
3. ~~**T1** Vitest setup with tests for `calc.ts`, `budgetMath.ts`, `date.ts`~~ — **resolved in v0.9.3**, see §5.
4. ~~**B3** week proration `firstDayOfWeek`~~ — **resolved in v0.9.3**, see §2.
5. ~~**P1/P2** BudgetPanel memoization + `currencyDecimals` cache~~ — **resolved in v0.9.3**, see §4.
6. ~~**U1**~~ **resolved in v0.9.3**, see §3; **U2** calculator-sheet auto-advance still open; **B5/B6** decimal edge cases still open.
7. **T6** error boundary + write-failure toasts.
8. **T7** README refresh (Insights sections, budget dashboard, calculator, reach mode, locked-in rates); then the bigger product items (U7 recurring, U3/U4 parity).

---

*Convention reminders for future sessions (from CLAUDE.md / repo history): append every prompt to `prompt.md` and include it in the commit; bump `package.json` version on every commit (surfaced in More → Version); verify changes in headless Chromium before committing; temp verification scripts don't get committed.*
