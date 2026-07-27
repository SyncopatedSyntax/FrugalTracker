import { useEffect, useState } from 'react'
import SubScreen from '@/components/SubScreen'
import Sheet from '@/components/Sheet'
import { Toast, useToast } from '@/components/Toast'
import { ChevronDownIcon, CloudIcon, RefreshIcon, TrashIcon, UploadIcon } from '@/components/icons'
import { useDemoMode, useGithubConfig } from '@/hooks'
import { db } from '@/db/db'
import { backfillBaseAmounts } from '@/db/repo'
import { restoreBackup, summarizeRestore, type BackupFile } from '@/lib/backup'
import {
  backupNow,
  clearDebugLog,
  fetchGithubBackup,
  getDebugLog,
  testConnection,
  type DebugLogEntry,
} from '@/lib/githubBackup'

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

  const [debugOpen, setDebugOpen] = useState(false)
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([])
  const refreshDebugLog = () => setDebugLog(getDebugLog())

  useEffect(() => {
    if (debugOpen) refreshDebugLog()
  }, [debugOpen])

  const copyDebugLog = async () => {
    const log = getDebugLog()
    const header = [
      `FrugalTracker GitHub backup — debug log`,
      `Generated: ${new Date().toISOString()}`,
      config ? `Connected: ${config.owner}/${config.repo}@${config.branch} (path: ${config.path})` : 'Connected: no',
      `Online: ${navigator.onLine}`,
      `User agent: ${navigator.userAgent}`,
      '',
    ].join('\n')
    const body = log.length
      ? log.map((e) => `[${e.time}] ${e.status.toUpperCase().padEnd(5)} ${e.step}  ${e.detail}`).join('\n')
      : '(no log entries yet)'
    const text = `${header}${body}\n`
    try {
      await navigator.clipboard.writeText(text)
      show('Debug info copied')
    } catch {
      show('Could not copy — clipboard unavailable')
    }
  }

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
    refreshDebugLog()
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
    refreshDebugLog()
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
    refreshDebugLog()
  }

  const doRestore = async () => {
    if (!pending) return
    try {
      const report = await restoreBackup(pending)
      await backfillBaseAmounts()
      setPending(null)
      const skipped = summarizeRestore(report)
      show(skipped ? `Backup restored · ${skipped}` : 'Backup restored')
    } catch (err) {
      setPending(null)
      show(err instanceof Error ? err.message : 'Restore failed')
    }
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
        <div className="mb-4 rounded-[1.375rem] bg-surface p-4">
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
              <p className="mt-1.5 text-xs text-muted">
                Save this token somewhere safe, like a password manager. It's kept only on this
                device and is never included in a backup — JSON, CSV, or this GitHub backup itself
                — so you'll need to re-enter it if you ever reconnect from a new device.
              </p>
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
              className="w-full rounded-[1.375rem] bg-primary py-3 text-base font-semibold text-primary-fg disabled:opacity-60"
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[1.375rem] bg-surface">
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
              className="flex w-full items-center justify-center gap-2 rounded-[1.375rem] bg-primary py-3 text-base font-semibold text-primary-fg disabled:opacity-60"
            >
              <RefreshIcon size={18} className={backingUp ? 'animate-spin' : ''} />
              {backingUp ? 'Backing up…' : 'Back up now'}
            </button>

            <button
              onClick={startRestore}
              disabled={restoring || isDemo}
              className="flex w-full items-center justify-center gap-2 rounded-[1.375rem] border border-border py-3 text-base font-semibold disabled:opacity-60"
            >
              <UploadIcon size={18} />
              {restoring ? 'Fetching…' : 'Restore from GitHub'}
            </button>

            <button
              onClick={() => setConfirmDisconnect(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[1.375rem] py-3 text-sm font-medium text-expense"
            >
              <TrashIcon size={16} />
              Disconnect
            </button>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-[1.375rem] bg-surface">
          <button
            onClick={() => setDebugOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3.5"
          >
            <span className="text-sm font-medium">Debug log</span>
            <ChevronDownIcon
              size={16}
              className={debugOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </button>
          {debugOpen && (
            <div
              className="px-4 pb-4"
              style={{ borderTop: '1px solid rgb(var(--c-border) / 0.6)', paddingTop: '0.75rem' }}
            >
              <p className="mb-2 text-xs text-muted">
                Every connect/backup/restore network step, including failures that happen before any
                response comes back (e.g. a bare "Load failed"). Nothing here includes your token —
                safe to copy and share.
              </p>
              <div className="max-h-64 overflow-y-auto rounded-xl bg-surface2 p-2.5">
                {debugLog.length === 0 ? (
                  <p className="text-xs text-muted">No log entries yet — try connecting or backing up.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {debugLog
                      .slice()
                      .reverse()
                      .map((e, i) => (
                        <li key={i} className="font-mono text-[11px] leading-snug">
                          <span className="text-muted">{new Date(e.time).toLocaleTimeString()}</span>{' '}
                          <span className={e.status === 'error' ? 'text-expense' : 'text-income'}>
                            {e.status === 'error' ? 'ERR' : 'OK '}
                          </span>{' '}
                          <span className="text-content">{e.step}</span>
                          <br />
                          <span className="break-words text-muted">{e.detail}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={copyDebugLog}
                  className="flex-1 rounded-xl border border-border py-2.5 text-xs font-semibold"
                >
                  Copy debug info
                </button>
                <button
                  onClick={() => {
                    clearDebugLog()
                    refreshDebugLog()
                  }}
                  className="flex-1 rounded-xl border border-border py-2.5 text-xs font-semibold text-expense"
                >
                  Clear log
                </button>
              </div>
            </div>
          )}
        </div>
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
            className="flex-1 rounded-[1.375rem] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={disconnect}
            className="flex-1 rounded-[1.375rem] bg-expense py-3 text-sm font-semibold text-white"
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
