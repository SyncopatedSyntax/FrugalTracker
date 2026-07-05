# FrugalTracker

A fast, **offline-first personal expense tracker** built as an installable mobile PWA — in the
spirit of Spendee, but manual-entry only and fully private. All data lives on your device
(IndexedDB); nothing is sent to a server.

## Features

- **⚡ Quick one-handed entry** — big numeric keypad, most-used categories first, a full entry in
  as few as three taps.
- **💸 Expenses & income** — track both; see totals and net.
- **🗂 Custom categories** — user-definable with emoji + color; reorder, archive, and auto-created
  on import when needed.
- **🏷 Tags & search** — free-form tags with autocomplete; search/filter by type, category, tag,
  note keyword, and date range.
- **📊 Insights** — Monthly / Yearly / All-time dashboards with a spending timeline and a
  by-category donut + ranked breakdown.
- **🎯 Budgets** — monthly limits per category (or overall) with progress and over-budget warnings.
- **🌍 Multi-currency** — each entry keeps its own currency; totals convert to a base currency via
  an editable exchange-rate table (with optional online refresh).
- **📥 Spendee import** — upload a Spendee CSV; columns are auto-detected with a preview and a
  mapping step, sign handling (negative = expense), and de-duplication.
- **💾 Backup** — full JSON export/restore and CSV export.
- **📱 PWA** — installs to the home screen and works completely offline.
- **🌗 Light / dark / system** themes.

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · Dexie.js (IndexedDB) · `vite-plugin-pwa` (Workbox) ·
React Router · PapaParse.

## Develop

```bash
npm install
npm run dev        # start the dev server
npm run build      # typecheck + production build to dist/
npm run preview    # preview the production build
```

## Data & privacy

Everything is stored locally in your browser's IndexedDB. To move between devices or keep a backup,
use **More → Backup & export** (JSON is lossless and re-importable).

## Deployment

Static SPA — deploys to any static host (configured here for Vercel via `vercel.json`).
