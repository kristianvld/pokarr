import { z } from 'zod'
export { isValidCronExpression } from '@/shared/cron'
import { isValidCronExpression } from '@/shared/cron'

export const instanceKindSchema = z.enum(['sonarr', 'radarr'])
export type InstanceKind = z.infer<typeof instanceKindSchema>

export const ruleTargetKindSchema = z.enum(['movie', 'series', 'season'])
export type RuleTargetKind = z.infer<typeof ruleTargetKindSchema>

export const scopeSchema = z.object({
  missingOnly: z.boolean().default(true),
  useProfileTargets: z.boolean().default(false),
  minimumQuality: z.string().nullable().default(null),
  minimumCustomFormatScore: z.number().int().nullable().default(null)
})
export type RuleScope = z.infer<typeof scopeSchema>

export const guardsSchema = z.object({
  monitoredOnly: z.boolean().default(true),
  minimumReleaseAgeMinutes: z.number().int().min(0).max(3650 * 24 * 60).default(0)
})
export type RuleGuards = z.infer<typeof guardsSchema>

export const backoffSchema = z.object({
  enabled: z.boolean().default(false),
  escalateAfterPokes: z.number().int().min(1).default(3),
  episodeFallback: z.boolean().default(false)
})
export type RuleBackoff = z.infer<typeof backoffSchema>

const baseUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) {
    return trimmed
  }

  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}, z.string().url())

export const instanceInputSchema = z.object({
  kind: instanceKindSchema,
  name: z.string().trim().min(2).max(80),
  baseUrl: baseUrlSchema,
  apiKey: z.string().trim().min(6).max(256),
  enabled: z.boolean().default(true)
})
export type InstanceInput = z.infer<typeof instanceInputSchema>

export const ruleInputSchema = z.object({
  instanceId: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  cadenceMinutes: z.number().int().min(1).max(365 * 24 * 60),
  batchSize: z.number().int().min(1).max(100),
  cooldownHours: z.number().min(1 / 60).max(24 * 365),
  targetKind: ruleTargetKindSchema,
  scope: scopeSchema,
  guards: guardsSchema,
  backoff: backoffSchema,
  enabled: z.boolean().default(true)
})
export type RuleInput = z.infer<typeof ruleInputSchema>

export const ruleUpdateSchema = ruleInputSchema
export type RuleUpdate = z.infer<typeof ruleUpdateSchema>

export const instanceRecordSchema = instanceInputSchema.extend({
  id: z.number().int().positive(),
  lastValidatedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
}).omit({
  apiKey: true
})
export type InstanceRecord = z.infer<typeof instanceRecordSchema>

export const ruleRecordSchema = ruleInputSchema.extend({
  id: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable()
})
export type RuleRecord = z.infer<typeof ruleRecordSchema>

export const runDetailItemSchema = z.object({
  title: z.string(),
  kind: ruleTargetKindSchema,
  itemUrl: z.string().nullable().default(null),
  reason: z.string().nullable().default(null)
})
export type RunDetailItem = z.infer<typeof runDetailItemSchema>

export const runFailureDetailSchema = runDetailItemSchema.extend({
  error: z.string()
})
export type RunFailureDetail = z.infer<typeof runFailureDetailSchema>

export const runDetailsSchema = z.object({
  dispatched: z.array(runDetailItemSchema).default([]),
  failed: z.array(runFailureDetailSchema).default([]),
  deferred: z.array(runDetailItemSchema).default([]),
  notes: z.array(z.string()).default([])
})
export type RunDetails = z.infer<typeof runDetailsSchema>

export function createEmptyRunDetails(): RunDetails {
  return {
    dispatched: [],
    failed: [],
    deferred: [],
    notes: []
  }
}

export const runRecordSchema = z.object({
  id: z.number().int().positive(),
  ruleId: z.number().int().positive(),
  instanceId: z.number().int().positive(),
  trigger: z.enum(['manual', 'scheduled']),
  startedAt: z.string(),
  endedAt: z.string(),
  status: z.enum(['completed', 'skipped', 'failed']),
  selectedCount: z.number().int().nonnegative(),
  dispatchedCount: z.number().int().nonnegative(),
  summary: z.string(),
  skipReason: z.string().nullable(),
  details: runDetailsSchema.optional().transform((value) => value ?? createEmptyRunDetails())
})
export type RunRecord = z.infer<typeof runRecordSchema>

export const backupTriggerSchema = z.enum(['manual', 'scheduled', 'pre_restore'])
export type BackupTrigger = z.infer<typeof backupTriggerSchema>

export const backupRecordSchema = z.object({
  id: z.number().int().positive(),
  trigger: backupTriggerSchema,
  createdAt: z.string(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  restoredAt: z.string().nullable(),
  restoreResult: z.string().nullable()
})
export type BackupRecord = z.infer<typeof backupRecordSchema>

export const queueItemSchema = z.object({
  id: z.string(),
  ruleId: z.number().int().positive(),
  ruleName: z.string(),
  instanceId: z.number().int().positive(),
  instanceName: z.string(),
  title: z.string(),
  kind: ruleTargetKindSchema,
  monitored: z.boolean(),
  missing: z.boolean(),
  releaseDate: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  itemUrl: z.string().nullable().default(null),
  reason: z.string(),
  backoff: z.string()
})
export type QueueItem = z.infer<typeof queueItemSchema>

export const queueIssueSchema = z.object({
  ruleId: z.number().int().positive(),
  ruleName: z.string(),
  instanceId: z.number().int().positive(),
  instanceName: z.string(),
  message: z.string()
})
export type QueueIssue = z.infer<typeof queueIssueSchema>

export const queueSnapshotSchema = z.object({
  items: z.array(queueItemSchema),
  issues: z.array(queueIssueSchema),
  updatedAt: z.string().nullable()
})
export type QueueSnapshot = z.infer<typeof queueSnapshotSchema>

export const scanKindSchema = z.enum(['full', 'incremental'])
export type ScanKind = z.infer<typeof scanKindSchema>

export const scanTriggerSchema = z.enum([
  'startup',
  'scheduled',
  'manual',
  'rule_change',
  'instance_change',
  'health_recovery',
  'stale_rule'
])
export type ScanTrigger = z.infer<typeof scanTriggerSchema>

export const scanRunStatusSchema = z.enum(['completed', 'failed'])
export type ScanRunStatus = z.infer<typeof scanRunStatusSchema>

export const scanRunRecordSchema = z.object({
  id: z.number().int().positive(),
  instanceId: z.number().int().positive(),
  kind: scanKindSchema,
  trigger: scanTriggerSchema,
  status: scanRunStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  phase: z.string().nullable(),
  totalItems: z.number().int().nonnegative(),
  scannedItems: z.number().int().nonnegative(),
  updatedItems: z.number().int().nonnegative(),
  skippedItems: z.number().int().nonnegative(),
  summary: z.string(),
  error: z.string().nullable()
})
export type ScanRunRecord = z.infer<typeof scanRunRecordSchema>

export const scanSnapshotStateSchema = z.enum(['empty', 'warming', 'ready', 'stale'])
export type ScanSnapshotState = z.infer<typeof scanSnapshotStateSchema>

export const instanceScanSummarySchema = z.object({
  instanceId: z.number().int().positive(),
  instanceName: z.string(),
  instanceKind: instanceKindSchema,
  enabled: z.boolean(),
  catalogUpdatedAt: z.string().nullable(),
  lastScanAt: z.string().nullable(),
  lastSuccessfulScanAt: z.string().nullable(),
  lastFullScanAt: z.string().nullable(),
  lastIncrementalScanAt: z.string().nullable(),
  nextScanAt: z.string().nullable(),
  lastError: z.string().nullable(),
  eligibleEntityCount: z.number().int().nonnegative(),
  cachedEntityCount: z.number().int().nonnegative(),
  pendingEntityCount: z.number().int().nonnegative(),
  staleEntityCount: z.number().int().nonnegative(),
  snapshotState: scanSnapshotStateSchema
})
export type InstanceScanSummary = z.infer<typeof instanceScanSummarySchema>

export const queuedScanJobSchema = z.object({
  instanceId: z.number().int().positive(),
  instanceName: z.string(),
  kind: scanKindSchema,
  trigger: scanTriggerSchema,
  queuedAt: z.string()
})
export type QueuedScanJob = z.infer<typeof queuedScanJobSchema>

export const activeScanJobSchema = queuedScanJobSchema.extend({
  startedAt: z.string(),
  phase: z.string(),
  currentItem: z.string().nullable(),
  totalItems: z.number().int().nonnegative(),
  scannedItems: z.number().int().nonnegative(),
  updatedItems: z.number().int().nonnegative(),
  skippedItems: z.number().int().nonnegative()
})
export type ActiveScanJob = z.infer<typeof activeScanJobSchema>

export const scanWorkerStatusSchema = z.object({
  state: z.enum(['idle', 'scanning', 'rebuilding_queue']),
  detailConcurrency: z.number().int().positive(),
  detailBatchSize: z.number().int().positive(),
  queueLength: z.number().int().nonnegative(),
  lastQueueRebuildAt: z.string().nullable(),
  lastQueueRebuildDurationMs: z.number().int().nonnegative().nullable(),
  lastError: z.string().nullable(),
  activeJob: activeScanJobSchema.nullable(),
  queuedJobs: z.array(queuedScanJobSchema)
})
export type ScanWorkerStatus = z.infer<typeof scanWorkerStatusSchema>

export const scanStatusResponseSchema = z.object({
  worker: scanWorkerStatusSchema,
  instances: z.array(instanceScanSummarySchema),
  runs: z.array(scanRunRecordSchema),
  queueUpdatedAt: z.string().nullable()
})
export type ScanStatusResponse = z.infer<typeof scanStatusResponseSchema>

export const settingsSchema = z.object({
  backupRetentionDays: z.number().int().min(1).default(90),
  backupSchedule: z.string().default('0 3 * * *'),
  notifications: z.object({
    notificationUrl: z.string().nullable().default(null),
    runSuccess: z.boolean().default(true),
    runFailure: z.boolean().default(true),
    backupSuccess: z.boolean().default(true),
    backupFailure: z.boolean().default(true),
    instanceConnectionLost: z.boolean().default(true),
    instanceConnectionRestored: z.boolean().default(true)
  })
})
export type Settings = z.infer<typeof settingsSchema>

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Use at least 3 characters.')
  .max(32, 'Use at most 32 characters.')
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/, {
    message: 'Use letters, numbers, dots, underscores, or dashes.'
  })

export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Use at most 128 characters.')

export const authCredentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema
})
export type AuthCredentials = z.infer<typeof authCredentialsSchema>

export const authUserSchema = z.object({
  username: usernameSchema
})
export type AuthUser = z.infer<typeof authUserSchema>

export const authSessionSchema = z.object({
  setupRequired: z.boolean(),
  authenticated: z.boolean(),
  user: authUserSchema.nullable()
})
export type AuthSession = z.infer<typeof authSessionSchema>

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}, z.string().nullable())

export const settingsUpdateSchema = z.object({
  backupRetentionDays: z.number().int().min(1).max(3650),
  backupSchedule: z.string().trim().min(5).max(120).refine(isValidCronExpression, {
    message: 'Enter a valid 5-field cron expression.'
  }),
  notifications: z.object({
    notificationUrl: nullableTrimmedString,
    runSuccess: z.boolean().default(true),
    runFailure: z.boolean().default(true),
    backupSuccess: z.boolean().default(true),
    backupFailure: z.boolean().default(true),
    instanceConnectionLost: z.boolean().default(true),
    instanceConnectionRestored: z.boolean().default(true)
  })
})
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>

export const dashboardSchema = z.object({
  instanceCount: z.number().int().nonnegative(),
  enabledRuleCount: z.number().int().nonnegative(),
  totalRunCount: z.number().int().nonnegative(),
  backupCount: z.number().int().nonnegative(),
  nextRunAt: z.string().nullable()
})
export type Dashboard = z.infer<typeof dashboardSchema>

export const appStateSchema = z.object({
  app: z.object({
    name: z.literal('pokarr'),
    version: z.string(),
    mode: z.enum(['development', 'production']),
    timeZone: z.string()
  }),
  dashboard: dashboardSchema,
  instances: z.array(instanceRecordSchema),
  rules: z.array(ruleRecordSchema),
  runs: z.array(runRecordSchema),
  backups: z.array(backupRecordSchema),
  settings: settingsSchema
})
export type AppState = z.infer<typeof appStateSchema>
