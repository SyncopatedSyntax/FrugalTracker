import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/db'
import type { GithubBackupConfig } from '@/db/types'
import {
  backupNow,
  clearDebugLog,
  fetchGithubBackup,
  getDebugLog,
  getFileSha,
  maybeAutoBackup,
  putFile,
  testConnection,
} from './githubBackup'

const config: GithubBackupConfig = {
  id: 'default',
  token: 'tok123',
  owner: 'me',
  repo: 'myrepo',
  branch: 'main',
  path: 'backups',
  autoBackupEnabled: false,
  autoBackupIntervalHours: 24,
}

/** `isDemoModeOn()` reads a `localStorage` flag, which isn't a global in the
 * node test environment — stub a minimal store so demo-mode guards can be
 * exercised. */
const fakeStorage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => fakeStorage.get(key) ?? null,
  setItem: (key: string, value: string) => void fakeStorage.set(key, value),
  removeItem: (key: string) => void fakeStorage.delete(key),
})

function setDemoMode(on: boolean): void {
  if (on) fakeStorage.set('ft-demo-mode', '1')
  else fakeStorage.delete('ft-demo-mode')
}

beforeEach(async () => {
  await Promise.all([
    db.githubConfig.clear(),
    db.transactions.clear(),
    db.categories.clear(),
    db.settings.clear(),
    db.tags.clear(),
    db.budgets.clear(),
    db.rates.clear(),
  ])
  setDemoMode(false)
  vi.restoreAllMocks()
  clearDebugLog()
})

describe('testConnection', () => {
  it('returns ok on a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const result = await testConnection(config)
    expect(result).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/me/myrepo',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok123' }),
      }),
    )
  })

  it('returns an error message on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const result = await testConnection(config)
    expect(result).toEqual({ ok: false, error: 'GitHub returned 401' })
  })

  it('returns an offline-style error when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const result = await testConnection(config)
    expect(result.ok).toBe(false)
  })
})

describe('getFileSha', () => {
  it('returns undefined for a 404 (file does not exist yet)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    expect(await getFileSha(config, 'file.json')).toBeUndefined()
  })

  it('returns the sha for an existing file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ sha: 'abc123' }) }),
    )
    expect(await getFileSha(config, 'file.json')).toBe('abc123')
  })

  it('throws on non-404 error statuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(getFileSha(config, 'file.json')).rejects.toThrow('GitHub returned 500')
  })
})

describe('putFile', () => {
  it('sends base64-encoded content with the fetched sha and commit message', async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push([url, init])
        if (init?.method === 'PUT') return { ok: true }
        return { ok: true, json: async () => ({ sha: 'existing-sha' }) }
      }),
    )
    await putFile(config, 'file.txt', 'hello world', 'commit msg')
    const put = calls.find(([, init]) => init?.method === 'PUT')
    expect(put).toBeDefined()
    expect(put![0]).toBe('https://api.github.com/repos/me/myrepo/contents/backups/file.txt')
    const body = JSON.parse(put![1]!.body as string)
    expect(body.content).toBe(btoa('hello world'))
    expect(body.sha).toBe('existing-sha')
    expect(body.message).toBe('commit msg')
    expect(body.branch).toBe('main')
  })

  it('omits sha when the file does not exist yet', async () => {
    let capturedBody: Record<string, unknown> | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          capturedBody = JSON.parse(init.body as string)
          return { ok: true }
        }
        return { ok: false, status: 404 }
      }),
    )
    await putFile(config, 'file.txt', 'hi', 'msg')
    expect(capturedBody?.sha).toBeUndefined()
  })

  it('throws when the PUT itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') return { ok: false, status: 403 }
        return { ok: false, status: 404 }
      }),
    )
    await expect(putFile(config, 'file.txt', 'hi', 'msg')).rejects.toThrow('GitHub returned 403')
  })
})

describe('transient-failure retries', () => {
  it('retries putFile after a network TypeError and succeeds', async () => {
    let puts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          puts++
          if (puts === 1) throw new TypeError('Load failed')
          return { ok: true }
        }
        return { ok: false, status: 404 } // getFileSha: file doesn't exist yet
      }),
    )
    vi.useFakeTimers()
    const p = putFile(config, 'file.json', 'hi', 'msg')
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBeUndefined()
    vi.useRealTimers()
    expect(puts).toBe(2)
  })

  it('does not retry a real HTTP-status error', async () => {
    let puts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          puts++
          return { ok: false, status: 403 }
        }
        return { ok: false, status: 404 }
      }),
    )
    await expect(putFile(config, 'file.json', 'hi', 'msg')).rejects.toThrow('GitHub returned 403')
    expect(puts).toBe(1) // one attempt only — a 403 is not transient
  })

  it('backupNow rides through a transient blip on the first PUT and records success', async () => {
    await db.githubConfig.put(config)
    let puts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          puts++
          if (puts === 1) throw new TypeError('Load failed') // JSON put blips once
          return { ok: true }
        }
        return { ok: false, status: 404 }
      }),
    )
    vi.useFakeTimers()
    const p = backupNow()
    await vi.runAllTimersAsync()
    await p
    vi.useRealTimers()
    expect(puts).toBe(3) // JSON: fail + retry (2), then CSV (1)
    const updated = await db.githubConfig.get('default')
    expect(updated?.lastBackupStatus).toBe('success')
    expect(updated?.lastBackupError).toBeUndefined()
  })

  it('gives up after exhausting retries and records the error', async () => {
    await db.githubConfig.put(config)
    let puts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          puts++
          throw new TypeError('Load failed')
        }
        return { ok: false, status: 404 }
      }),
    )
    vi.useFakeTimers()
    const p = backupNow()
    const settled = expect(p).rejects.toThrow('Load failed')
    await vi.runAllTimersAsync()
    await settled
    vi.useRealTimers()
    expect(puts).toBe(3) // initial + 2 retries, then gives up
    const updated = await db.githubConfig.get('default')
    expect(updated?.lastBackupStatus).toBe('error')
    expect(updated?.lastBackupError).toContain('Load failed')
  })
})

describe('backupNow', () => {
  it('commits both the JSON backup and the transactions CSV, and records success', async () => {
    await db.githubConfig.put(config)
    const putUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          putUrls.push(url)
          return { ok: true }
        }
        return { ok: false, status: 404 }
      }),
    )
    await backupNow()
    expect(putUrls).toHaveLength(2)
    expect(putUrls.some((u) => u.endsWith('frugaltracker-backup.json'))).toBe(true)
    expect(putUrls.some((u) => u.endsWith('frugaltracker-transactions.csv'))).toBe(true)
    const updated = await db.githubConfig.get('default')
    expect(updated?.lastBackupStatus).toBe('success')
    expect(updated?.lastBackupAt).toBeTruthy()
    expect(updated?.lastBackupError).toBeUndefined()
  })

  it('records the error and rethrows when a commit fails', async () => {
    await db.githubConfig.put(config)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') return { ok: false, status: 403 }
        return { ok: false, status: 404 }
      }),
    )
    await expect(backupNow()).rejects.toThrow('GitHub returned 403')
    const updated = await db.githubConfig.get('default')
    expect(updated?.lastBackupStatus).toBe('error')
    expect(updated?.lastBackupError).toContain('403')
  })

  it('throws when not connected', async () => {
    await expect(backupNow()).rejects.toThrow('Not connected to GitHub')
  })
})

describe('fetchGithubBackup', () => {
  it('rejects content that is not a valid backup shape', async () => {
    await db.githubConfig.put(config)
    const badContent = btoa(JSON.stringify({ nope: true }))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: badContent }) }),
    )
    await expect(fetchGithubBackup()).rejects.toThrow('Not a valid FrugalTracker backup')
  })

  it('returns the parsed backup when valid', async () => {
    await db.githubConfig.put(config)
    const validBackup = {
      app: 'frugaltracker',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      settings: undefined,
      categories: [],
      tags: [],
      budgets: [],
      rates: [],
      transactions: [],
    }
    const encoded = btoa(JSON.stringify(validBackup))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: encoded }) }),
    )
    const result = await fetchGithubBackup()
    expect(result.app).toBe('frugaltracker')
  })
})

describe('maybeAutoBackup', () => {
  it('does nothing when auto-backup is disabled', async () => {
    await db.githubConfig.put({ ...config, autoBackupEnabled: false })
    vi.stubGlobal('fetch', vi.fn())
    await maybeAutoBackup()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing when not connected', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await maybeAutoBackup()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('backs up when the interval has elapsed', async () => {
    await db.githubConfig.put({
      ...config,
      autoBackupEnabled: true,
      autoBackupIntervalHours: 24,
      lastBackupAt: new Date(Date.now() - 25 * 3600_000).toISOString(),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') return { ok: true }
        return { ok: false, status: 404 }
      }),
    )
    await maybeAutoBackup()
    expect(fetch).toHaveBeenCalled()
  })

  it('skips when the interval has not elapsed yet', async () => {
    await db.githubConfig.put({
      ...config,
      autoBackupEnabled: true,
      autoBackupIntervalHours: 24,
      lastBackupAt: new Date().toISOString(),
    })
    vi.stubGlobal('fetch', vi.fn())
    await maybeAutoBackup()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('debug log', () => {
  it('starts empty and records a network-layer throw with no HTTP response', async () => {
    expect(getDebugLog()).toEqual([])
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')))
    const result = await testConnection(config)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Load failed')
    const log = getDebugLog()
    expect(log).toHaveLength(1)
    expect(log[0].step).toBe('testConnection')
    expect(log[0].status).toBe('error')
    expect(log[0].detail).toContain('Load failed')
  })

  it('records getFileSha/putFile network throws even though the old code never caught them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')))
    await expect(getFileSha(config, 'file.json')).rejects.toThrow('Load failed')
    expect(getDebugLog().some((e) => e.step === 'getFileSha:file.json' && e.status === 'error')).toBe(
      true,
    )
  })

  it('clearDebugLog empties the log', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    await testConnection(config)
    expect(getDebugLog().length).toBeGreaterThan(0)
    clearDebugLog()
    expect(getDebugLog()).toEqual([])
  })

  it('caps the log at 40 entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    for (let i = 0; i < 45; i++) await testConnection(config)
    expect(getDebugLog()).toHaveLength(40)
  })
})

describe('Demo Mode guards', () => {
  it('backupNow throws and never calls fetch while Demo Mode is active', async () => {
    await db.githubConfig.put(config)
    setDemoMode(true)
    vi.stubGlobal('fetch', vi.fn())
    await expect(backupNow()).rejects.toThrow('Cannot back up while Demo Mode is active')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetchGithubBackup throws and never calls fetch while Demo Mode is active', async () => {
    await db.githubConfig.put(config)
    setDemoMode(true)
    vi.stubGlobal('fetch', vi.fn())
    await expect(fetchGithubBackup()).rejects.toThrow('Cannot restore while Demo Mode is active')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('maybeAutoBackup silently skips (no error recorded) while Demo Mode is active', async () => {
    await db.githubConfig.put({
      ...config,
      autoBackupEnabled: true,
      autoBackupIntervalHours: 24,
      lastBackupAt: new Date(Date.now() - 25 * 3600_000).toISOString(),
    })
    setDemoMode(true)
    vi.stubGlobal('fetch', vi.fn())
    await maybeAutoBackup()
    expect(fetch).not.toHaveBeenCalled()
    const updated = await db.githubConfig.get('default')
    expect(updated?.lastBackupStatus).toBeUndefined()
  })
})
