import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SubScreen from '@/components/SubScreen'
import Sheet from '@/components/Sheet'
import { Toast, useToast } from '@/components/Toast'
import { ChevronRightIcon, CloudIcon, DownloadIcon, UploadIcon, TrashIcon } from '@/components/icons'
import {
  exportCSV,
  exportJSON,
  isValidBackup,
  restoreBackup,
  summarizeRestore,
  type BackupFile,
} from '@/lib/backup'
import { db } from '@/db/db'
import { ensureSeeded } from '@/db/seed'
import { backfillBaseAmounts } from '@/db/repo'
import { useGithubConfig, useTransactionCount } from '@/hooks'

export default function DataScreen() {
  const { message, show } = useToast()
  const count = useTransactionCount() ?? 0
  const githubConfig = useGithubConfig()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<BackupFile | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  // A restored backup never carries a GitHub Personal Access Token (it's
  // intentionally excluded from every backup format) — if this device isn't
  // already connected, prompt to reconnect and re-enter it.
  const [showReconnect, setShowReconnect] = useState(false)

  const onRestoreFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (!isValidBackup(data)) {
        show('Not a valid FrugalTracker backup')
        return
      }
      setPending(data)
    } catch {
      show('Could not read that file')
    }
  }

  const doRestore = async () => {
    if (!pending) return
    try {
      const report = await restoreBackup(pending)
      // Backups made before v0.9.2 won't have baseAmount/baseRate on their rows.
      await backfillBaseAmounts()
      setPending(null)
      const skipped = summarizeRestore(report)
      show(skipped ? `Backup restored · ${skipped}` : 'Backup restored')
      // Wait for the toast above to clear before opening the sheet — both are
      // fixed-position overlays and would otherwise visually collide.
      if (!githubConfig) window.setTimeout(() => setShowReconnect(true), 1800)
    } catch (err) {
      setPending(null)
      show(err instanceof Error ? err.message : 'Restore failed')
    }
  }

  const doClear = async () => {
    await Promise.all([
      db.transactions.clear(),
      db.categories.clear(),
      db.tags.clear(),
      db.budgets.clear(),
      db.rates.clear(),
      db.settings.clear(),
      db.recurringTransactions.clear(),
    ])
    await ensureSeeded()
    setConfirmClear(false)
    show('All data cleared')
  }

  return (
    <SubScreen title="Backup & export">
      <div className="px-4 py-4">
        <div className="mb-4 rounded-[1.375rem] bg-surface p-4">
          <p className="text-sm text-muted">
            You have <span className="font-semibold text-content">{count}</span>{' '}
            {count === 1 ? 'transaction' : 'transactions'} stored on this device.
          </p>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Export</p>
        <div className="overflow-hidden rounded-[1.375rem] bg-surface">
          <Row
            icon={<DownloadIcon size={20} />}
            title="Full backup (JSON)"
            desc="Everything, re-importable"
            onClick={() => exportJSON().then(() => show('Backup downloaded'))}
          />
          <Row
            icon={<DownloadIcon size={20} />}
            title="Transactions (CSV)"
            desc="Spreadsheet-friendly"
            border
            onClick={() => exportCSV().then(() => show('CSV downloaded'))}
          />
        </div>

        <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Off-device</p>
        <div className="overflow-hidden rounded-[1.375rem] bg-surface">
          <Link
            to="/more/github-backup"
            className="flex items-center gap-3 px-4 py-3.5 text-left active:bg-surface2"
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <CloudIcon size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">GitHub backup</span>
              <span className="block truncate text-xs text-muted">
                Back up &amp; restore via your own private repo
              </span>
            </span>
            <ChevronRightIcon size={18} className="text-muted" />
          </Link>
        </div>

        <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Restore</p>
        <div className="overflow-hidden rounded-[1.375rem] bg-surface">
          <Row
            icon={<UploadIcon size={20} />}
            title="Restore from backup"
            desc="Replaces all current data"
            onClick={() => fileRef.current?.click()}
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onRestoreFile(f)
            e.target.value = ''
          }}
        />

        <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
          Danger zone
        </p>
        <button
          onClick={() => setConfirmClear(true)}
          className="flex w-full items-center gap-3 rounded-[1.375rem] bg-surface p-4 text-left text-expense active:bg-surface2"
        >
          <TrashIcon size={20} />
          <span className="flex-1">
            <span className="block text-sm font-medium">Delete all data</span>
            <span className="block text-xs text-expense/70">Reset to defaults</span>
          </span>
        </button>
      </div>

      <Toast message={message} />

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Restore this backup?">
        <p className="text-sm text-muted">
          This replaces all current data with the backup
          {pending?.transactions ? ` (${pending.transactions.length} transactions)` : ''}. This
          can’t be undone.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setPending(null)}
            className="flex-1 rounded-[1.375rem] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={doRestore}
            className="flex-1 rounded-[1.375rem] bg-primary py-3 text-sm font-semibold text-primary-fg"
          >
            Restore
          </button>
        </div>
      </Sheet>

      <Sheet
        open={showReconnect}
        onClose={() => setShowReconnect(false)}
        title="Reconnect GitHub backup?"
      >
        <p className="text-sm text-muted">
          Your Personal Access Token is never included in a backup, so GitHub backup isn't
          connected on this device. If you use it, reconnect and re-enter your token to resume
          off-device backups.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setShowReconnect(false)}
            className="flex-1 rounded-[1.375rem] border border-border py-3 text-sm font-semibold"
          >
            Later
          </button>
          <Link
            to="/more/github-backup"
            onClick={() => setShowReconnect(false)}
            className="flex-1 rounded-[1.375rem] bg-primary py-3 text-center text-sm font-semibold text-primary-fg"
          >
            Set up
          </Link>
        </div>
      </Sheet>

      <Sheet open={confirmClear} onClose={() => setConfirmClear(false)} title="Delete all data?">
        <p className="text-sm text-muted">
          Every transaction, category, budget and setting will be erased and reset to defaults.
          Consider exporting a backup first.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setConfirmClear(false)}
            className="flex-1 rounded-[1.375rem] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={doClear}
            className="flex-1 rounded-[1.375rem] bg-expense py-3 text-sm font-semibold text-white"
          >
            Delete everything
          </button>
        </div>
      </Sheet>
    </SubScreen>
  )
}

function Row({
  icon,
  title,
  desc,
  onClick,
  border,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  onClick: () => void
  border?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface2"
      style={{ borderTop: border ? '1px solid rgb(var(--c-border) / 0.6)' : undefined }}
    >
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{desc}</span>
      </span>
    </button>
  )
}
