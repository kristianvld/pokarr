import type { BackupRecord, InstanceKind, InstanceRecord, RuleRecord, RunRecord } from '@/shared/models'

type NotificationLevel = 'info' | 'success' | 'warning' | 'failure'

export type NotificationMessage = {
  title: string
  body: string
  level: NotificationLevel
}

type InstanceHealthState = 'unknown' | 'healthy' | 'unhealthy'

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

function formatInstanceKind(kind: InstanceKind) {
  return kind === 'sonarr' ? 'Sonarr' : 'Radarr'
}

type NotificationInstanceRef = {
  name: string
  kind: InstanceKind | string
}

function formatNotificationInstanceKind(kind: NotificationInstanceRef['kind']) {
  return kind === 'sonarr' || kind === 'radarr' ? formatInstanceKind(kind) : kind
}

function formatRunTrigger(trigger: RunRecord['trigger']) {
  return trigger === 'manual' ? 'Manual' : 'Scheduled'
}

function formatBackupTrigger(trigger: BackupRecord['trigger']) {
  if (trigger === 'manual') {
    return 'Manual'
  }

  if (trigger === 'scheduled') {
    return 'Scheduled'
  }

  return 'Pre-restore safety snapshot'
}

function formatBytes(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1024) {
    return `${Math.max(0, Math.round(sizeBytes))} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = sizeBytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function buildFieldLines(entries: Array<[label: string, value: string | number | null | undefined]>) {
  return entries
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .map(([label, value]) => `- **${label}:** ${String(value)}`)
    .join('\n')
}

function buildQuotedSection(title: string, content: string | null | undefined) {
  const trimmed = content?.trim()
  if (!trimmed) {
    return ''
  }

  return [
    `**${title}**`,
    trimmed
      .split(/\r?\n/)
      .map((line) => (line.length > 0 ? `> ${line}` : '>'))
      .join('\n')
  ].join('\n')
}

function truncateLine(value: string, limit = 220) {
  const trimmed = value.trim()
  if (trimmed.length <= limit) {
    return trimmed
  }

  return `${trimmed.slice(0, limit - 3)}...`
}

function buildListSection(title: string, lines: string[], limit = 5): [string, string] | null {
  if (lines.length === 0) {
    return null
  }

  const visible = lines.slice(0, limit).map((line) => truncateLine(line))
  if (lines.length > limit) {
    visible.push(`...and ${lines.length - limit} more.`)
  }

  return [title, visible.join('\n')]
}

function buildMessage(
  title: string,
  level: NotificationLevel,
  fields: Array<[label: string, value: string | number | null | undefined]>,
  sections: Array<[title: string, content: string | null | undefined]> = []
): NotificationMessage {
  const parts = [buildFieldLines(fields), ...sections.map(([sectionTitle, content]) => buildQuotedSection(sectionTitle, content))]
    .filter((part) => part.length > 0)

  return {
    title,
    body: parts.join('\n\n'),
    level
  }
}

export function buildNotificationTestMessage(): NotificationMessage {
  return buildMessage(
    '🧪 Pokarr test notification',
    'info',
    [
      ['Status', 'Notification delivery is working'],
      ['Format', 'Markdown-enabled generic Apprise notification'],
      ['Branding', 'Pokarr default app name and logo are attached where supported']
    ]
  )
}

export function buildRunNotification(
  rule: RuleRecord,
  instance: NotificationInstanceRef,
  run: RunRecord
): NotificationMessage {
  const completed = run.status === 'completed'
  const detailSections = [
    buildListSection('Searches triggered', run.details.dispatched.map((item) => item.title)),
    buildListSection('Dispatch failures', run.details.failed.map((item) => `${item.title}: ${item.error}`)),
    buildListSection('Left for later', run.details.deferred.map((item) => item.title)),
    buildListSection('Notes', run.details.notes)
  ].filter((section): section is [string, string] => section !== null)

  return buildMessage(
    completed ? `✅ Run completed: ${rule.name}` : `❌ Run failed: ${rule.name}`,
    completed ? 'success' : 'failure',
    [
      ['Rule', rule.name],
      ['Instance', instance.name],
      ['Service', formatNotificationInstanceKind(instance.kind)],
      ['Trigger', formatRunTrigger(run.trigger)],
      ['Selected', run.selectedCount],
      ['Dispatched', run.dispatchedCount],
      ['Started', formatTimestamp(run.startedAt)],
      ['Finished', formatTimestamp(run.endedAt)]
    ],
    [['Summary', run.summary], ...detailSections]
  )
}

export function buildBackupCompletedNotification(backup: BackupRecord): NotificationMessage {
  return buildMessage(
    '💾 Backup completed',
    'success',
    [
      ['Trigger', formatBackupTrigger(backup.trigger)],
      ['Backup', `#${backup.id}`],
      ['Created', formatTimestamp(backup.createdAt)],
      ['Size', formatBytes(backup.sizeBytes)]
    ]
  )
}

export function buildBackupFailedNotification(
  trigger: Exclude<BackupRecord['trigger'], 'pre_restore'>,
  message: string
): NotificationMessage {
  return buildMessage(
    '🚨 Backup failed',
    'failure',
    [['Trigger', formatBackupTrigger(trigger)]],
    [['Error', message]]
  )
}

export function buildRestoreCompletedNotification(backup: BackupRecord): NotificationMessage {
  return buildMessage(
    '♻️ Restore completed',
    'success',
    [
      ['Backup', `#${backup.id}`],
      ['Original trigger', formatBackupTrigger(backup.trigger)],
      ['Created', formatTimestamp(backup.createdAt)],
      ['Restored', formatTimestamp(backup.restoredAt)]
    ],
    [['Details', backup.restoreResult]]
  )
}

export function buildRestoreFailedNotification(
  backup: BackupRecord | null,
  message: string
): NotificationMessage {
  return buildMessage(
    '🚨 Restore failed',
    'failure',
    [
      ['Backup', backup ? `#${backup.id}` : null],
      ['Original trigger', backup ? formatBackupTrigger(backup.trigger) : null],
      ['Created', backup ? formatTimestamp(backup.createdAt) : null]
    ],
    [['Error', message]]
  )
}

export function buildInstanceHealthFailureNotification(
  instance: InstanceRecord,
  previousState: InstanceHealthState,
  previousError: string | null
): NotificationMessage {
  const issueUpdated = previousState === 'unhealthy'

  return buildMessage(
    issueUpdated ? `🟠 Instance issue updated: ${instance.name}` : `🔴 Instance unhealthy: ${instance.name}`,
    'warning',
    [
      ['Instance', instance.name],
      ['Service', formatInstanceKind(instance.kind)],
      ['Status', 'Unavailable for Pokarr operations'],
      ['Detected', formatTimestamp(instance.updatedAt)]
    ],
    [
      ['Current issue', instance.lastError],
      ['Previous issue', issueUpdated && previousError !== instance.lastError ? previousError : null]
    ]
  )
}

export function buildInstanceHealthRestoredNotification(
  instance: InstanceRecord,
  previousError: string | null
): NotificationMessage {
  return buildMessage(
    `🟢 Instance restored: ${instance.name}`,
    'success',
    [
      ['Instance', instance.name],
      ['Service', formatInstanceKind(instance.kind)],
      ['Status', 'Healthy again'],
      ['Validated', formatTimestamp(instance.lastValidatedAt)]
    ],
    [['Recovered from', previousError]]
  )
}
