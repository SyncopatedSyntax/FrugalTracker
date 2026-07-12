import { useState } from 'react'
import SubScreen from '@/components/SubScreen'
import Sheet from '@/components/Sheet'
import { Toast, useToast } from '@/components/Toast'
import { ChevronDownIcon, CloudIcon, RefreshIcon, TrashIcon, UploadIcon } from '@/components/icons'
import { useDemoMode, useGithubConfig } from '@/hooks'
import { db } from '@/db/db'
import { backfillBaseAmounts } from '@/db/repo'
import { restoreBackup, type BackupFile } from '@/lib/backup'
import { backupNow, fetchGithubBackup, testConnection } from '@/lib/githubBackup'

const INTERVAL_OPTIONS = [
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Daily' },
  { hours: 168, label: 'Weekly' },
]

export default function GitHubBackupScreen() {
  const config = useGithubConfig()
  const isDemo = useDemoMode()
  const { message, show } = useToast()

  const [token, setToken] = useState('')
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('main')
  const [path, setPath] = useState('backups')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [pending, setPending] = useState<BackupFile | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const connect = async () => {
    if (!token.trim() || !owner.trim() || !repo.trim()) {
      show('Enter a token, owner and repo')
      return
    }
    setConnecting(true)
    const candidate = {
      token: token.trim(),
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || 'main',
      path: path.trim().replace(/^\/+|\/+$/g, '') || 'backups',
    }
    const result = await testConnection(candidate)
    if (result.ok) {
      await db.githubConfig.put({
        id: 'default',
        ...candidate,
        autoBackupEnabled: false,
        autoBackupIntervalHours: 24,
      })
      setToken('')
      show('Connected to GitHub')
    } else {
      show(result.error)
    }
    setConnecting(false)
  }

  const doBackup = async () => {
    setBackingUp(true)
    try {
      await backupNow()
      show('Backed up to GitHub')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Backup failed')
    }
    setBackingUp(false)
  }

  const startRestore = async () => {
    setRestoring(true)
    try {
      const data = await fetchGithubBackup()
      setPending(data)
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not fetch backup')
    }
    setRestoring(false)
  }

  const doRestore = async () => {
    if (!pending) return
    await restoreBackup(pending)
    await backfillBaseAmounts()
    setPending(null)
    show('Backup restored')
  }

  const setAutoBackup = async (enabled: boolean) => {
    await db.githubConfig.update('default', { autoBackupEnabled: enabled })
  }

  const setInterval_ = async (hours: number) => {
    await db.githubConfig.update('default', { autoBackupIntervalHours: hours })
  }

  const disconnect = async () => {
    await db.githubConfig.delete('default')
    setConfirmDisconnect(false)
    show('Disconnected')
  }

  return (
    <SubScreen title="GitHub backup">
      <div className="px-4 py-4">
        <div className="mb-4 rounded-[22px] bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <CloudIcon size={20} />
            <p className="text-sm font-semibold">Back up to your own private repo</p>
          </div>
          <p className="text-sm text-muted">
            Commits a full JSON backup and a transactions CSV to a private GitHub repo you control,
            so a copy survives even if this device is lost. Requires a fine-grained{' '}
            <span className="font-medium text-content">Personal Access Token</span> scoped to just
            that repo with <span className="font-medium text-content">Contents: Read and write</span>{' '}
            permission — create one at github.com/settings/personal-access-tokens/new.
          </p>
        </div>

        {!config ? (
          <div className="space-y-3">
            <Field label="Personal Access Token">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_…"
                className="w-full rounded-xl border border-border bg-surface2 px-3 py-3 text-base outline-none focus:border-primary"
                autoComplete="off"
              />
            </Field>
            <Field label="Owner / repo">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="owner"
                  className="w-1/2 rounded-xl border border-border bg-surface2 px-3 py-3 text-base outline-none focus:border-primary"
                />
                <input
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="repo"
                  className="w-1/2 rounded-xl border border-border bg-surface2 px-3 py-3 text-base outline-none focus:border-primary"
                />
              </div>
            </Field>

            <button
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-muted"
            >
              Advanced
              <ChevronDownIcon
                size={14}
                className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
            </button>
            {advancedOpen && (
              <div className="flex gap-2">
                <Field label="Branch" className="w-1/2">
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className="w-full rounded-xl border border-border bg-surface2 px-3 py-3 text-base outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Folder" className="w-1/2">
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="backups"
                    className="w-full rounded-xl border border-border bg-surface2 px-3 py-3 text-base outline-none focus:border-primary"
                  />
                </Field>
              </div>
            )}

            <button
              onClick={connect}
              disabled={connecting}
              className="w-full rounded-[22px] bg-primary py-3 text-base font-semibold text-primary-fg disabled:opacity-60"
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[22px] bg-surface">
              <div className="px-4 py-3.5">
                <p className="text-sm font-medium">
                  {config.owner}/{config.repo}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {config.lastBackupAt
                    ? `Last backup ${new Date(config.lastBackupAt).toLocaleString()} · ${
                        config.lastBackupStatus === 'error' ? 'failed' : 'succeeded'
                      }`
                    : 'No backup yet'}
                </p>
                {config.lastBackupStatus === 'error' && config.lastBackupError && (
                  <p className="mt-0.5 text-xs text-expense">{config.lastBackupError}</p>
                )}
              </div>
              <div
                className="flex items-center justify-between gap-3 px-4 py-3.5"
                style={{ borderTop: '1px solid rgb(var(--c-border) / 0.6)' }}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Automatic backup</span>
                  <span className="block truncate text-xs text-muted">On app open, if overdue</span>
                </span>
                <input
                  type="checkbox"
                  checked={config.autoBackupEnabled}
                  onChange={(e) => void setAutoBackup(e.target.checked)}
                  className="h-6 w-6 flex-shrink-0 accent-[rgb(var(--c-primary))]"
                  aria-label="Automatic backup"
                />
              </div>
              {config.autoBackupEnabled && (
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3.5"
                  style={{ borderTop: '1px solid rgb(var(--c-border) / 0.6)' }}
                >
                  <span className="text-sm font-medium">Frequency</span>
                  <select
                    value={config.autoBackupIntervalHours}
                    onChange={(e) => void setInterval_(Number(e.target.value))}
                    className="rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none"
                  >
                    {INTERVAL_OPTIONS.map((o) => (
                      <option key={o.hours} value={o.hours}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {isDemo && (
              <p className="text-center text-xs text-muted">
                Paused while Demo Mode is active — exit demo mode to back up or restore your real
                data.
              </p>
            )}

            <button
              onClick={doBackup}
              disabled={backingUp || isDemo}
              className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-primary py-3 text-base font-semibold text-primary-fg disabled:opacity-60"
            >
              <RefreshIcon size={18} className={backingUp ? 'animate-spin' : ''} />
              {backingUp ? 'Backing up…' : 'Back up now'}
            </button>

            <button
              onClick={startRestore}
              disabled={restoring || isDemo}
              className="flex w-full items-center justify-center gap-2 rounded-[22px] border border-border py-3 text-base font-semibold disabled:opacity-60"
            >
              <UploadIcon size={18} />
              {restoring ? 'Fetching…' : 'Restore from GitHub'}
            </button>

            <button
              onClick={() => setConfirmDisconnect(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[22px] py-3 text-sm font-medium text-expense"
            >
              <TrashIcon size={16} />
              Disconnect
            </button>
          </div>
        )}
      </div>

      <Toast message={message} />

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Restore this backup?">
        <p className="text-sm text-muted">
          This replaces all current data with the backup from GitHub
          {pending?.transactions ? ` (${pending.transactions.length} transactions)` : ''}. This
          can’t be undone.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setPending(null)}
            className="flex-1 rounded-[22px] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={doRestore}
            className="flex-1 rounded-[22px] bg-primary py-3 text-sm font-semibold text-primary-fg"
          >
            Restore
          </button>
        </div>
      </Sheet>

      <Sheet
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect GitHub?"
      >
        <p className="text-sm text-muted">
          Removes the saved token and connection from this device. The repo and its backups are
          left untouched.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setConfirmDisconnect(false)}
            className="flex-1 rounded-[22px] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={disconnect}
            className="flex-1 rounded-[22px] bg-expense py-3 text-sm font-semibold text-white"
          >
            Disconnect
          </button>
        </div>
      </Sheet>
    </SubScreen>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}
