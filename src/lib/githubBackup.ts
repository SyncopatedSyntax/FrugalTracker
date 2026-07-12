import { db } from '@/db/db'
import type { GithubBackupConfig } from '@/db/types'
import { buildBackup, buildTransactionsCSV, isValidBackup, type BackupFile } from './backup'

/** Fixed filenames overwritten on every backup — git's own commit history on
 * these paths is the backup history, so there's no need to manage
 * timestamped snapshots ourselves. */
const JSON_FILENAME = 'frugaltracker-backup.json'
const CSV_FILENAME = 'frugaltracker-transactions.csv'

type ConnectionInfo = Pick<GithubBackupConfig, 'owner' | 'repo' | 'token'>
type FileLocation = ConnectionInfo & Pick<GithubBackupConfig, 'branch' | 'path'>

function apiBase(config: ConnectionInfo): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}`
}

function filePath(config: Pick<GithubBackupConfig, 'path'>, filename: string): string {
  const trimmed = config.path.replace(/^\/+|\/+$/g, '')
  return trimmed ? `${trimmed}/${filename}` : filename
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
}

function toBase64(content: string): string {
  return btoa(unescape(encodeURIComponent(content)))
}

function fromBase64(content: string): string {
  return decodeURIComponent(escape(atob(content.replace(/\n/g, ''))))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

export async function testConnection(
  config: ConnectionInfo,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(apiBase(config), { headers: authHeaders(config.token) })
    if (!res.ok) return { ok: false, error: `GitHub returned ${res.status}` }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not reach GitHub (offline?)' }
  }
}

/** Returns the file's current blob sha (needed to overwrite it), or
 * `undefined` if the file doesn't exist yet. */
export async function getFileSha(config: FileLocation, filename: string): Promise<string | undefined> {
  const url = `${apiBase(config)}/contents/${filePath(config, filename)}?ref=${encodeURIComponent(config.branch)}`
  const res = await fetch(url, { headers: authHeaders(config.token) })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
  const data = (await res.json()) as { sha: string }
  return data.sha
}

export async function getFileContent(config: FileLocation, filename: string): Promise<string> {
  const url = `${apiBase(config)}/contents/${filePath(config, filename)}?ref=${encodeURIComponent(config.branch)}`
  const res = await fetch(url, { headers: authHeaders(config.token) })
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
  const data = (await res.json()) as { content: string }
  return fromBase64(data.content)
}

export async function putFile(
  config: FileLocation,
  filename: string,
  content: string,
  message: string,
): Promise<void> {
  const sha = await getFileSha(config, filename)
  const url = `${apiBase(config)}/contents/${filePath(config, filename)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(config.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: toBase64(content),
      branch: config.branch,
      ...(sha ? { sha } : {}),
    }),
  })
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
}

/** Commits both the full JSON backup and a transactions-only CSV to the
 * configured repo (two separate commits — the Contents API has no atomic
 * multi-file commit), then records success/failure on the config row. */
export async function backupNow(): Promise<void> {
  const config = await db.githubConfig.get('default')
  if (!config) throw new Error('Not connected to GitHub')
  try {
    const [backup, transactions, categories] = await Promise.all([
      buildBackup(),
      db.transactions.toArray(),
      db.categories.toArray(),
    ])
    const csv = buildTransactionsCSV(transactions, categories)
    await putFile(config, JSON_FILENAME, JSON.stringify(backup, null, 2), 'FrugalTracker backup')
    await putFile(config, CSV_FILENAME, csv, 'FrugalTracker transactions CSV')
    await db.githubConfig.update('default', {
      lastBackupAt: new Date().toISOString(),
      lastBackupStatus: 'success',
      lastBackupError: undefined,
    })
  } catch (err) {
    await db.githubConfig.update('default', {
      lastBackupAt: new Date().toISOString(),
      lastBackupStatus: 'error',
      lastBackupError: errorMessage(err),
    })
    throw err
  }
}

/** Fetches and validates the latest backup from the repo, without applying
 * it — the caller is expected to confirm with the user (same two-step
 * fetch-then-confirm flow as the local file restore in `DataScreen.tsx`)
 * before calling the existing `restoreBackup()` from `lib/backup.ts`. */
export async function fetchGithubBackup(): Promise<BackupFile> {
  const config = await db.githubConfig.get('default')
  if (!config) throw new Error('Not connected to GitHub')
  const content = await getFileContent(config, JSON_FILENAME)
  const data = JSON.parse(content)
  if (!isValidBackup(data)) throw new Error('Not a valid FrugalTracker backup')
  return data
}

/** Opportunistic "automatic" backup — checked on app foreground/open rather
 * than via true OS background scheduling, which isn't reliably available to
 * a PWA (especially iOS Safari). Silently no-ops when not due or not
 * connected; failures are recorded on the config row by `backupNow()` but
 * not surfaced here, since this runs unattended. */
export async function maybeAutoBackup(): Promise<void> {
  const config = await db.githubConfig.get('default')
  if (!config?.autoBackupEnabled) return
  const last = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0
  const dueAt = last + config.autoBackupIntervalHours * 3600_000
  if (Date.now() < dueAt) return
  try {
    await backupNow()
  } catch {
    // Status already recorded on the config row; nothing more to do here.
  }
}
