# FrugalTracker — Codebase Review & Dev Reference

**Reviewed:** 2026-07-10, at v0.9.0 (branch `claude/expense-tracker-pwa-319tcf`).
**Scope:** full pass over the data layer (`src/db`), pure libs (`src/lib`), all feature screens, shared components, and the PWA shell. Findings are grouped by kind and tagged by severity. Nothing here has been fixed yet — this is the backlog and reference for future work.

---

## 1. Architecture snapshot (orientation for future devs)

- **Stack:** React 18 + Vite + TS, Tailwind (CSS-variable tokens, `darkMode: 'class'`), Dexie v4 on IndexedDB, `vite-plugin-pwa` (Workbox, `autoUpdate` + `skipWaiting`), React Router.
- **Data flow:** all reads go through `useLiveQuery` hooks in `src/hooks/index.ts`; all writes go through `src/db/repo.ts`. Screens never touch Dexie directly (except `DataScreen`'s clear/restore, via `lib/backup.ts`).
- **Money model:** `Transaction.amount` is a positive magnitude + `currency`; sign comes from `type`. All aggregation converts to the base currency via `lib/convert.ts` (`rates` table stores "1 unit of X in base"; base always rate 1; missing rate falls back to 1:1 by design).
- **Dates:** local-calendar `"YYYY-MM-DD"` strings everywhere; `lib/date.ts` is deliberately UTC-free (`toISO`/`parseISO` use local fields). **Any `new Date(isoString)` elsewhere is a smell** — see bugs B1/B4.
- **Pure logic lives in `src/lib`** (`calc.ts`, `budgetMath.ts`, `spendeeImport.ts`, `date.ts`, `filters.ts` in transactions, `compute.ts`/`period.ts` in insights) and is unit-testable without React — but there are currently **no tests** (§5).
- **App shell:** `#root` is `position: fixed; inset: 0` (the iOS-standalone viewport bug fix — see prompt.md §29–33 for the full saga; don't regress this). Every screen manages its own inner scroll region. Status bar style is `black` on iOS on purpose (`black-translucent` shrinks the web view and re-opens the bottom-gap bug).

---

## 2. Bugs (correctness)

### B1 · HIGH — "Income vs last year" compares against the wrong date range
`lib/budgetMath.ts → sameRangeLastYear()` shifts a range back a year with `addYears(new Date(range.startISO), -1)`. Two problems compound:

1. `date.ts → addYears()` is a **month-anchor helper**: it returns `new Date(y+n, month, 1)` — it resets the day-of-month to **1**. It's fine for `period.ts` stepping, but here it turns *June 29 – July 5* into *June 1 – July 1* of last year.
2. `new Date('2026-06-29')` parses as **UTC midnight**, so in timezones west of UTC the local date is already off by one before the shift. Same issue in `rollingMonthlyAverage()` (`new Date(earliestTxDate)`), where it can mis-clamp the window by a month at month boundaries (B4, folded in here).

**Effect:** the BudgetPanel's income rings ("vs last year") use a denominator from a wrong, usually much longer range — percentages are misleading. Week and month timeframes are badly wrong; year is subtly wrong (end date truncates to the 1st).
**Fix sketch:** parse with `parseISO`, shift with a day-preserving helper (`new Date(y-1, m, d)`, clamping Feb 29 → Feb 28), never raw `new Date(iso)`. Add unit tests around DST/leap/timezone-west cases.

### B2 · HIGH — Changing base currency silently re-denominates budgets and opening balance
`db/repo.ts → changeBaseCurrency()` re-anchors the **rates** table only. But two other stores hold amounts documented as "in base currency":

- `Budget.amount` (a `currency` field is stored at save time but **ignored everywhere** — `BudgetPanel` and `BudgetsScreen` use `amount` raw),
- `Settings.openingBalance`.

Switch base from USD to CAD and a "$500" budget becomes "C$500" — off by the FX factor; Total Wealth shifts too.
**Fix sketch:** inside `changeBaseCurrency`'s transaction, multiply `openingBalance` and every `Budget.amount` by the old→new factor (`1 / divisor`), and update `Budget.currency`. Alternatively convert budgets at read time using their stored `currency` — but then `openingBalance` still needs the write-time fix, so converting both at write time is simpler and keeps the "everything is base" invariant true.

### B3 · MEDIUM — Week proration ignores the first-day-of-week setting
`budgetMath.ts → prorateMonthly()` hardcodes `startOfWeek(now, 1)` (Monday). The ring's *numerator* (`periodRange('week', …, firstDayOfWeek)`) honors the user's Sunday/Monday setting, so Sunday-start users get a mismatched week ring (spend measured from Sunday, target prorated from Monday).
**Fix:** thread `firstDayOfWeek` through `prorateMonthly` (the callers in `BudgetPanel` already have it).

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
| U1 | Calculator sheet | A negative result leaves **Use amount** disabled with no explanation. Show a hint ("amount must be positive") or clamp at 0. |
| U2 | Calculator sheet | After **Use amount**, the user still has to press **Next**. Consider auto-advancing to the category step (matches the "result is the amount" mental model). |
| U3 | Reach mode | The on-the-fly gutter flip is session-only by design; the Settings value re-asserts on reload. Consider persisting the flip (it *is* an expressed preference) or at least keeping it for the app session across tab switches (it currently resets if settings re-emit). |
| U4 | Edit screen parity | `EditTransactionScreen` uses the plain keypad — no calculator, no reach. Fine as a scope decision, but users who learn "the pad is a calculator" will expect it here too. The keypad already supports it via props. |
| U5 | Tag casing | The tags table lowercases names (`bumpTags`), so suggestions/labels show "rc cars" while transactions preserve "RC Cars". Store a `display` casing on the tag row (first-seen, like `labelBreakdown` does) for consistent chips. |
| U6 | Rates | Exchange rates are manual-only. README even claims "optional online refresh," which doesn't exist (B/doc mismatch — fix README or build a fetch against a free FX API with offline fallback). |
| U7 | Recurring transactions | Most-requested Spendee feature likely to be missed: scheduled/recurring entries (rent, subscriptions). The data model would need a `recurrence` table + materialization on launch. |
| U8 | iOS status bar | `black` status-bar style shows a black strip in light theme. Acceptable trade-off (see §1), but a future option: theme-aware `theme-color` meta (`media="(prefers-color-scheme: …)"` pair or JS-updated) so at least browser-tab/Android chrome matches. Do **not** return to `black-translucent`. |
| U9 | Deleting a category with transactions | Verified handled: `CategoriesScreen` disables the delete button while `categoryTxCount > 0`, so orphaned `categoryId`s can't happen through the UI (only via a malformed backup restore — see §7). A "reassign transactions then delete" flow would still be a nice upgrade over a disabled button. |
| U10 | Backup versioning | `BackupFile.version = 1` is written but never checked on restore. Add a version gate + migration hook before the schema evolves further. |

---

## 4. Performance notes

- **P1 — BudgetPanel recomputes on every keystroke.** Every digit press re-renders `AddScreen`, so `BudgetPanel` re-runs `sumInRange` ×3 + `rollingMonthlyAverage` over *all* transactions. Fine at ~1k txs, wasteful at 10k+. `React.memo(BudgetPanel)` is enough (its props are primitives; `useLiveQuery` results are referentially stable between db writes), plus `useMemo` inside keyed on `[txs, rates, budgets, categoryId]`.
- **P2 — `currencyDecimals()` builds an uncached `Intl.NumberFormat` per call**, and it's called on every AddScreen render. Cache per currency code like `formatter()` already does.
- **P3 — `useAllTransactions()` loads and sorts the whole table** on every screen that uses it (Activity, Insights, BudgetPanel). This is the right simplicity trade-off now; if datasets grow (multi-year imports), move Insights/Activity to `useTransactionsInRange` + the existing `[type+date]` index, and paginate Activity.
- **P4 — Sequential awaits in loops** (`bumpTags`, `reorderCategories`, import usage bumps) — all inside transactions, so they're fast enough; Dexie `bulkPut` would be marginally cleaner, not urgent.

---

## 5. Code health & tooling

- **T1 — No tests.** The riskiest logic is all pure and trivially testable: `lib/calc.ts` (state machine + shunting-yard), `lib/budgetMath.ts` (B1/B3 would have been caught), `lib/date.ts`, `lib/spendeeImport.ts` (`parseDate`/`parseNumber`/`parseLabels`), `transactions/filters.ts`. Recommend Vitest + a committed Playwright smoke test (the project has only ever had ad-hoc, deleted verification scripts).
- **T2 — No linter.** `npm run lint` is just `tsc --noEmit`. Add ESLint (typescript-eslint + react-hooks) — e.g. the intentional mount-only effect in `TransactionsScreen` and `BudgetsScreen`'s suppressed exhaustive-deps deserve explicit, checked suppressions.
- **T3 — `AmountKeypad` prop contract is awkward.** In calc mode, `value`/`onChange` are required but unused (`onChange={() => {}}` at the call site). Make the props a discriminated union (`{ mode: 'plain', value, onChange } | { mode: 'calc', calc }`) or split the component.
- **T4 — Dead code:** `applyKey` re-export in `AmountKeypad` (nothing imports it anymore; the logic lives in `lib/calc.ts → applyAmountKey`). `Settings.seededDefaults` is written but never read ("reserved").
- **T5 — Dexie schema discipline.** Still on `version(1)`. New *fields* (e.g. `calculatorMode`, `keypadReach`) need no migration (defaults merge in `useSettings`/`getSettings`), but any new *index* requires `version(2).stores(…)` — document this in the class when it first happens.
- **T6 — Error handling.** `save()`/repo writes have no try/catch; an IndexedDB failure (private-mode quota, eviction) fails silently. A tiny toast-on-rejection wrapper around repo calls, plus one React error boundary above the router, would cover the realistic failure modes.
- **T7 — README drift.** Claims rate "online refresh" (doesn't exist), describes Insights as "Monthly/Yearly/All-time" (now Week/Month/Year/All/Custom with Overview/Categories/Labels), and predates the budget dashboard, calculator, and reach mode. Refresh when convenient.

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

1. **B1** income-vs-last-year ranges (visible-wrong numbers) + regression tests.
2. **B2** base-currency change re-denomination (silent data corruption).
3. **T1** Vitest setup with tests for `calc.ts`, `budgetMath.ts`, `date.ts` (locks in 1 & 2).
4. **B3** week proration `firstDayOfWeek`.
5. **P1/P2** BudgetPanel memoization + `currencyDecimals` cache (do together, both in the keystroke path).
6. **U1/U2** calculator-sheet polish; **B5/B6** decimal edge cases.
7. **T6** error boundary + write-failure toasts.
8. **U6/T7** rates story + README refresh; then the bigger product items (U7 recurring, U3/U4 parity).

---

*Convention reminders for future sessions (from CLAUDE.md / repo history): append every prompt to `prompt.md` and include it in the commit; bump `package.json` version on every commit (surfaced in More → Version); verify changes in headless Chromium before committing; temp verification scripts don't get committed.*
