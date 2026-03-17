import { describe, expect, test } from 'bun:test'
import type { BackupRecord, InstanceRecord, RuleRecord, RunRecord } from '@/shared/models'
import {
  buildBackupCompletedNotification,
  buildBackupFailedNotification,
  buildInstanceHealthFailureNotification,
  buildInstanceHealthRestoredNotification,
  buildNotificationTestMessage,
  buildRestoreCompletedNotification,
  buildRestoreFailedNotification,
  buildRunNotification
} from './notificationMessages'

const rule: RuleRecord = {
  id: 7,
  instanceId: 3,
  name: 'Retry UHD upgrades',
  cadenceMinutes: 60,
  batchSize: 10,
  cooldownHours: 24,
  targetKind: 'movie',
  scope: {
    missingOnly: false,
    useProfileTargets: true,
    minimumQuality: 'Bluray-2160p',
    minimumCustomFormatScore: 100
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
  enabled: true,
  createdAt: '2026-03-16T01:00:00.000Z',
  updatedAt: '2026-03-16T01:00:00.000Z',
  lastRunAt: null,
  nextRunAt: null
}

const instance: InstanceRecord = {
  id: 3,
  kind: 'radarr',
  name: 'Main Radarr',
  baseUrl: 'http://radarr.local',
  enabled: true,
  lastValidatedAt: '2026-03-16T02:15:00.000Z',
  lastError: null,
  createdAt: '2026-03-16T00:00:00.000Z',
  updatedAt: '2026-03-16T02:15:00.000Z'
}

const run: RunRecord = {
  id: 9,
  ruleId: 7,
  instanceId: 3,
  trigger: 'scheduled',
  startedAt: '2026-03-16T02:00:00.000Z',
  endedAt: '2026-03-16T02:05:00.000Z',
  status: 'failed',
  selectedCount: 10,
  dispatchedCount: 4,
  summary: 'Triggered 4 of 10 searches. 6 failed.',
  skipReason: null
}

const backup: BackupRecord = {
  id: 12,
  trigger: 'scheduled',
  createdAt: '2026-03-16T03:00:00.000Z',
  path: '/tmp/pokarr-12.sqlite',
  sizeBytes: 1048576,
  restoredAt: '2026-03-16T03:30:00.000Z',
  restoreResult: 'Safety backup: #13 created before restore.'
}

describe('notification message builders', () => {
  test('formats run notifications as structured markdown', () => {
    const message = buildRunNotification(rule, instance, run)

    expect(message.title).toBe('❌ Run failed: Retry UHD upgrades')
    expect(message.level).toBe('failure')
    expect(message.body).toContain('- **Rule:** Retry UHD upgrades')
    expect(message.body).toContain('- **Dispatched:** 4')
    expect(message.body).toContain('**Summary**')
    expect(message.body).toContain('> Triggered 4 of 10 searches. 6 failed.')
  })

  test('formats backup and restore notifications with identifiers and details', () => {
    const completed = buildBackupCompletedNotification(backup)
    const restore = buildRestoreCompletedNotification(backup)
    const restoreFailed = buildRestoreFailedNotification(backup, 'database is locked')

    expect(completed.title).toBe('💾 Backup completed')
    expect(completed.body).toContain('- **Backup:** #12')
    expect(completed.body).toContain('- **Size:** 1.0 MB')
    expect(restore.title).toBe('♻️ Restore completed')
    expect(restore.body).toContain('**Details**')
    expect(restoreFailed.body).toContain('> database is locked')
  })

  test('formats instance health changes with current and previous issue details', () => {
    const unhealthy = buildInstanceHealthFailureNotification(
      {
        ...instance,
        lastError: 'Timed out after 15s while calling /api/v3/system/status.',
        updatedAt: '2026-03-16T02:20:00.000Z'
      },
      'unhealthy',
      'Gateway returned 502 Bad Gateway.'
    )
    const restored = buildInstanceHealthRestoredNotification(instance, 'Gateway returned 502 Bad Gateway.')

    expect(unhealthy.title).toBe('🟠 Instance issue updated: Main Radarr')
    expect(unhealthy.body).toContain('**Current issue**')
    expect(unhealthy.body).toContain('**Previous issue**')
    expect(restored.title).toBe('🟢 Instance restored: Main Radarr')
    expect(restored.body).toContain('**Recovered from**')
  })

  test('formats test and failure notifications with readable summaries', () => {
    const testMessage = buildNotificationTestMessage()
    const backupFailed = buildBackupFailedNotification('manual', 'disk full')

    expect(testMessage.title).toBe('🧪 Pokarr test notification')
    expect(testMessage.body).toContain('- **Status:** Notification delivery is working')
    expect(backupFailed.title).toBe('🚨 Backup failed')
    expect(backupFailed.body).toContain('- **Trigger:** Manual')
    expect(backupFailed.body).toContain('> disk full')
  })
})
