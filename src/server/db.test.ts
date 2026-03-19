import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createEmptyRunDetails } from '@/shared/models'
import { Store } from './db'

const tempDirs: string[] = []
const stores: Store[] = []

async function createTestStore() {
  const dataDir = await mkdtemp(resolve(tmpdir(), 'pokarr-store-'))
  tempDirs.push(dataDir)

  const store = new Store({ dataDir })
  await store.init()
  stores.push(store)

  return {
    dataDir,
    store
  }
}

afterEach(async () => {
  while (stores.length > 0) {
    stores.pop()?.close()
  }

  while (tempDirs.length > 0) {
    const dataDir = tempDirs.pop()
    if (!dataDir) {
      continue
    }

    await rm(dataDir, { force: true, recursive: true })
  }
})

describe('Store settings', () => {
  test('seeds static default settings for a new database', async () => {
    const { store } = await createTestStore()

    expect(store.getSettings()).toEqual({
      backupRetentionDays: 90,
      backupSchedule: '0 3 * * *',
      notifications: {
        notificationUrl: null,
        runSuccess: true,
        runFailure: true,
        backupSuccess: true,
        backupFailure: true,
        instanceConnectionLost: true,
        instanceConnectionRestored: true
      }
    })

    store.close()
  })
})

describe('Store backups', () => {
  test('prunes backups by retention age and cleans orphan files when settings change', async () => {
    const { dataDir, store } = await createTestStore()

    const older = await store.createBackup('manual')
    const newer = await store.createBackup('scheduled')
    store.db
      .query(`UPDATE backups SET created_at = ? WHERE id = ?`)
      .run(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), older.id)

    const orphanPath = resolve(dataDir, 'backups', 'orphan.sqlite')
    await Bun.write(orphanPath, 'orphan backup file')

    await store.updateSettings({
      ...store.getSettings(),
      backupRetentionDays: 2
    })

    const remaining = store.getBackups()
    expect(remaining.map((backup) => backup.path)).toContain(newer.path)
    expect(remaining.map((backup) => backup.path)).not.toContain(older.path)

    let olderExists = true
    try {
      await stat(older.path)
    } catch {
      olderExists = false
    }

    let orphanExists = true
    try {
      await stat(orphanPath)
    } catch {
      orphanExists = false
    }

    expect(olderExists).toBe(false)
    expect(orphanExists).toBe(false)
    store.close()
  })

  test('restores database state and preserves backup history metadata', async () => {
    const { store } = await createTestStore()

    await store.updateSettings({
      ...store.getSettings(),
      backupRetentionDays: 365,
      backupSchedule: '0 4 * * *'
    })

    store.createInstance({
      kind: 'sonarr',
      name: 'Primary',
      baseUrl: 'http://primary.local',
      apiKey: 'primary-api-key',
      enabled: true
    })

    const backup = await store.createBackup('manual')

    store.createInstance({
      kind: 'radarr',
      name: 'Secondary',
      baseUrl: 'http://secondary.local',
      apiKey: 'secondary-api-key',
      enabled: true
    })

    await store.updateSettings({
      ...store.getSettings(),
      backupRetentionDays: 7,
      backupSchedule: '15 6 * * *'
    })

    const restored = await store.restoreBackup(backup.id)

    expect(store.getInstances().map((instance) => instance.name)).toEqual(['Primary'])
    expect(store.getSettings().backupSchedule).toBe('0 4 * * *')
    expect(restored.path).toBe(backup.path)
    expect(restored.restoredAt).not.toBeNull()
    expect(restored.restoreResult).toContain('Safety backup:')

    const backups = store.getBackups()
    const selected = backups.find((entry) => entry.path === backup.path)
    expect(selected?.restoredAt).not.toBeNull()
    expect(selected?.restoreResult).toContain('Safety backup:')
    expect(backups.some((entry) => entry.trigger === 'pre_restore')).toBe(true)
    store.close()
  })

  test('rolls back to the safety backup when the selected snapshot is invalid', async () => {
    const { store } = await createTestStore()

    store.createInstance({
      kind: 'sonarr',
      name: 'Primary',
      baseUrl: 'http://primary.local',
      apiKey: 'primary-api-key',
      enabled: true
    })

    const invalidBackup = await store.createBackup('manual')

    store.createInstance({
      kind: 'radarr',
      name: 'Secondary',
      baseUrl: 'http://secondary.local',
      apiKey: 'secondary-api-key',
      enabled: true
    })

    await Bun.write(invalidBackup.path, 'not a sqlite database')

    await expect(store.restoreBackup(invalidBackup.id)).rejects.toThrow('Restore failed')
    expect(store.getInstances().map((instance) => instance.name).sort()).toEqual(['Primary', 'Secondary'])

    const failedBackup = store.getBackups().find((backup) => backup.path === invalidBackup.path)
    expect(failedBackup?.restoreResult).toContain('Rolled back to safety backup')
    expect(store.getBackups().some((backup) => backup.trigger === 'pre_restore')).toBe(true)
    store.close()
  })
})

describe('Store state summary', () => {
  test('persists structured run details and defaults legacy rows to empty details', async () => {
    const { store } = await createTestStore()

    const instance = store.createInstance({
      kind: 'sonarr',
      name: 'Primary',
      baseUrl: 'http://primary.local',
      apiKey: 'primary-api-key',
      enabled: true
    })

    const rule = store.createRule({
      instanceId: instance.id,
      name: 'Record run details',
      cadenceMinutes: 15,
      batchSize: 2,
      cooldownHours: 24,
      targetKind: 'series',
      scope: {
        missingOnly: true,
        useProfileTargets: false,
        minimumQuality: null,
        minimumCustomFormatScore: null
      },
      guards: {
        monitoredOnly: true,
        minimumReleaseAgeMinutes: 0
      },
      backoff: {
        enabled: false,
        escalateAfterPokes: 3,
        episodeFallback: false
      },
      enabled: true
    })

    const stored = store.recordRun({
      ruleId: rule.id,
      instanceId: instance.id,
      trigger: 'manual',
      startedAt: '2026-03-16T01:00:00.000Z',
      endedAt: '2026-03-16T01:01:00.000Z',
      status: 'failed',
      selectedCount: 2,
      dispatchedCount: 1,
      summary: 'Triggered 1 of 2 searches. 1 failed.',
      details: {
        dispatched: [
          {
            title: 'Alpha',
            kind: 'series',
            itemUrl: 'http://primary.local/series/alpha',
            reason: 'Missing series'
          }
        ],
        failed: [
          {
            title: 'Beta',
            kind: 'series',
            itemUrl: 'http://primary.local/series/beta',
            reason: 'Missing series',
            error: 'HTTP 502 Bad Gateway'
          }
        ],
        deferred: [],
        notes: []
      }
    })

    expect(stored.details.dispatched.map((item) => item.title)).toEqual(['Alpha'])
    expect(stored.details.failed[0]?.error).toBe('HTTP 502 Bad Gateway')

    store.db
      .query(
        `INSERT INTO runs (
          rule_id,
          instance_id,
          trigger,
          started_at,
          ended_at,
          status,
          selected_count,
          dispatched_count,
          summary,
          skip_reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        rule.id,
        instance.id,
        'manual',
        '2026-03-16T02:00:00.000Z',
        '2026-03-16T02:00:00.000Z',
        'skipped',
        0,
        0,
        'No eligible items.',
        'No eligible items.'
      )

    const legacy = store.getRuns().find((run) => run.summary === 'No eligible items.')
    expect(legacy?.details).toEqual(createEmptyRunDetails())
    store.close()
  })

  test('reports the full run count even when only the latest 100 runs are returned', async () => {
    const { store } = await createTestStore()

    const instance = store.createInstance({
      kind: 'sonarr',
      name: 'Primary',
      baseUrl: 'http://primary.local',
      apiKey: 'primary-api-key',
      enabled: true
    })

    const rule = store.createRule({
      instanceId: instance.id,
      name: 'Count runs accurately',
      cadenceMinutes: 15,
      batchSize: 1,
      cooldownHours: 24,
      targetKind: 'series',
      scope: {
        missingOnly: true,
        useProfileTargets: false,
        minimumQuality: null,
        minimumCustomFormatScore: null
      },
      guards: {
        monitoredOnly: true,
        minimumReleaseAgeMinutes: 0
      },
      backoff: {
        enabled: false,
        escalateAfterPokes: 3,
        episodeFallback: false
      },
      enabled: true
    })

    const baseTimestamp = Date.parse('2026-03-16T01:00:00.000Z')

    for (let index = 0; index < 101; index += 1) {
      const timestamp = new Date(baseTimestamp + index * 60_000).toISOString()
      store.recordRun({
        ruleId: rule.id,
        instanceId: instance.id,
        trigger: 'manual',
        startedAt: timestamp,
        endedAt: timestamp,
        status: 'completed',
        selectedCount: 1,
        dispatchedCount: 1,
        summary: `Run ${index + 1}`
      })
    }

    expect(store.getRuns()).toHaveLength(100)
    expect(store.getState().dashboard.totalRunCount).toBe(101)
    store.close()
  })
})
