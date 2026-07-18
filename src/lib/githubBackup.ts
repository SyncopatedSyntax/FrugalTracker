import { db } from '@/db/db'
import { isDemoModeOn } from '@/db/demoMode'
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
  return err instanceof Error ? `${err.name}: ${err.message}` : 'Unknown error'
}

/** Rolling, on-device diagnostic trail for the GitHub backup feature — every
 * network step (including ones that fail before any HTTP response comes
 * back, e.g. the browser's own "Load failed"/"Failed to fetch") is recorded
 * here so a user hitting a silent-looking failure has something concrete to
 * report back, and so the (unattended) auto-backup trigger isn't a black
 * box. Kept in localStorage (not IndexedDB) so it survives independently of
 * app data and never gets swept up in backup/restore/Demo Mode. Never logs
 * the token itself. */
export interface DebugLogEntry {
  time: string
  step: string
  status: 'ok' | 'error'
  detail: string
}

const DEBUG_LOG_KEY = 'frugaltracker.githubDebugLog'
const DEBUG_LOG_MAX = 40

export function getDebugLog(): DebugLogEntry[] {
  try {
    const raw = localStorage.getItem(DEBUG_LOG_KEY)
    return raw ? (JSON.parse(raw) as DebugLogEntry[]) : []
  } catch {
    return []
  }
}

export function clearDebugLog(): void {
  localStorage.removeItem(DEBUG_LOG_KEY)
}

function logStep(step: string, status: 'ok' | 'error', detail: string): void {
  const log = getDebugLog()
  log.push({ time: new Date().toISOString(), step, status, detail })
  while (log.length > DEBUG_LOG_MAX) log.shift()
  try {
    localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(log))
  } catch {
    // Best-effort — a full/blocked localStorage shouldn't break the backup itself.
  }
}

/** `fetch` wrapped so every call — including ones that throw before any
 * response exists — lands a `logStep` entry. This is the gap that used to
 * make a bare "Load failed" undebuggable: `getFileSha`/`getFileContent`/
 * `putFile` didn't catch at all, so a network-layer throw propagated with no
 * trail of which request, host, or online-state it happened under. */
async function loggedFetch(step: string, url: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, init)
    logStep(step, res.ok || res.status === 404 ? 'ok' : 'error', `HTTP ${res.status} — ${url}`)
    return res
  } catch (err) {
    logStep(step, 'error', `${errorMessage(err)} — online: ${navigator.onLine} — ${url}`)
    throw err
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Backoff schedule for a transient-failure retry (ms before the 2nd and 3rd
 * attempts). Kept short so an on-open backup never feels stuck. */
const RETRY_DELAYS = [400, 1200]

/** Retry `op` when it fails with a network-layer `TypeError` — the "Load
 * failed" / "Failed to fetch" a browser throws when a request is cut off
 * before any response arrives (on iOS most often because the web view was
 * suspended mid-request, or a momentary connectivity blip). These almost
 * always succeed on an immediate retry, so a single one shouldn't mark an
 * unattended auto-backup as failed. A real HTTP-status error (thrown as a
 * plain `Error`, e.g. 403/409) is NOT retried — that's a genuine problem the
 * user needs to see. `op` is re-run whole each attempt, so a `putFile` re-reads
 * the file's current sha rather than reusing a now-stale one (which would
 * 409 if a lost-response PUT had actually landed). */
async function withRetry<T>(label: string, op: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op()
    } catch (err) {
      if (!(err instanceof TypeError) || attempt >= RETRY_DELAYS.length) throw err
      logStep(
        label,
        'ok',
        `transient network error — retrying (attempt ${attempt + 2}/${RETRY_DELAYS.length + 1})`,
      )
      await delay(RETRY_DELAYS[attempt])
    }
  }
}

export async function testConnection(
  config: ConnectionInfo,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await loggedFetch('testConnection', apiBase(config), { headers: authHeaders(config.token) })
    if (!res.ok) return { ok: false, error: `GitHub returned ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not reach GitHub — ${errorMessage(err)}` }
  }
}

/** Returns the file's current blob sha (needed to overwrite it), or
 * `undefined` if the file doesn't exist yet. */
export async function getFileSha(config: FileLocation, filename: string): Promise<string | undefined> {
  const url = `${apiBase(config)}/contents/${filePath(config, filename)}?ref=${encodeURIComponent(config.branch)}`
  const res = await loggedFetch(`getFileSha:${filename}`, url, { headers: authHeaders(config.token) })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
  const data = (await res.json()) as { sha: string }
  return data.sha
}

export async function getFileContent(config: FileLocation, filename: string): Promise<string> {
  return withRetry(`getFileContent:${filename}`, async () => {
    const url = `${apiBase(config)}/contents/${filePath(config, filename)}?ref=${encodeURIComponent(config.branch)}`
    const res = await loggedFetch(`getFileContent:${filename}`, url, { headers: authHeaders(config.token) })
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
    const data = (await res.json()) as { content: string }
    return fromBase64(data.content)
  })
}

export async function putFile(
  config: FileLocation,
  filename: string,
  content: string,
  message: string,
): Promise<void> {
  const encoded = toBase64(content)
  await withRetry(`putFile:${filename}`, async () => {
    // Re-read the sha on every attempt so a retry after a lost-response PUT
    // uses the file's current sha instead of a stale one (which would 409).
    const sha = await getFileSha(config, filename)
    const url = `${apiBase(config)}/contents/${filePath(config, filename)}`
    const res = await loggedFetch(`putFile:${filename}`, url, {
      method: 'PUT',
      headers: { ...authHeaders(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: encoded,
        branch: config.branch,
        ...(sha ? { sha } : {}),
      }),
    })
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
  })
}

/** Commits both the full JSON backup and a transactions-only CSV to the
 * configured repo (two separate commits — the Contents API has no atomic
 * multi-file commit), then records success/failure on the config row. */
export async function backupNow(): Promise<void> {
  // The demo dataset lives in the same tables as real data while Demo Mode
  // is active (see `db/demoMode.ts`) — never let it overwrite the user's
  // real backup in their repo.
  if (isDemoModeOn()) throw new Error('Cannot back up while Demo Mode is active')
  const config = await db.githubConfig.get('default')
  if (!config) throw new Error('Not connected to GitHub')
  logStep('backupNow', 'ok', `started — ${config.owner}/${config.repo}@${config.branch}`)
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
    logStep('backupNow', 'ok', 'completed')
  } catch (err) {
    logStep('backupNow', 'error', errorMessage(err))
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
  // Applying a restore into the demo tables would just be discarded the
  // moment Demo Mode exits (it unconditionally restores the pre-demo
  // snapshot) — block it rather than let that silently swallow the result.
  if (isDemoModeOn()) throw new Error('Cannot restore while Demo Mode is active')
  const config = await db.githubConfig.get('default')
  if (!config) throw new Error('Not connected to GitHub')
  logStep('fetchGithubBackup', 'ok', `started — ${config.owner}/${config.repo}@${config.branch}`)
  try {
    const content = await getFileContent(config, JSON_FILENAME)
    const data = JSON.parse(content)
    if (!isValidBackup(data)) throw new Error('Not a valid FrugalTracker backup')
    logStep('fetchGithubBackup', 'ok', 'completed')
    return data
  } catch (err) {
    logStep('fetchGithubBackup', 'error', errorMessage(err))
    throw err
  }
}

/** Opportunistic "automatic" backup — checked on app foreground/open rather
 * than via true OS background scheduling, which isn't reliably available to
 * a PWA (especially iOS Safari). Silently no-ops when not due, not connected,
 * or while Demo Mode is active; failures are recorded on the config row by
 * `backupNow()` but not surfaced here, since this runs unattended. */
export async function maybeAutoBackup(): Promise<void> {
  if (isDemoModeOn()) return
  const config = await db.githubConfig.get('default')
  if (!config?.autoBackupEnabled) return
  const last = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0
  const dueAt = last + config.autoBackupIntervalHours * 3600_000
  if (Date.now() < dueAt) return
  logStep('maybeAutoBackup', 'ok', 'due — triggering backupNow')
  try {
    await backupNow()
  } catch {
    // Status already recorded on the config row; backupNow already logged it.
  }
}
