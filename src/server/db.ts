import { Database } from 'bun:sqlite'
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import {
  type AuthUser,
  type AppState,
  type BackupRecord,
  type BackupTrigger,
  type InstanceInput,
  type InstanceRecord,
  type ScanKind,
  type ScanRunRecord,
  type ScanTrigger,
  type RuleInput,
  type RuleGuards,
  type RuleRecord,
  type RuleUpdate,
  type QueueIssue,
  type QueueSnapshot,
  type RunRecord,
  type Settings,
  type SettingsUpdate,
  appStateSchema,
  guardsSchema,
  queueSnapshotSchema,
  scanRunRecordSchema,
  settingsSchema
} from '@/shared/models'

export type RuleEntityStateRecord = {
  ruleId: number
  entityKey: string
  entityKind: 'movie' | 'series' | 'season'
  lastPokedAt: string | null
  lastSignature: string
  consecutivePokes: number
  updatedAt: string
}

export type InstanceScanStateRecord = {
  instanceId: number
  catalogUpdatedAt: string | null
  lastScanAt: string | null
  lastSuccessfulScanAt: string | null
  lastFullScanAt: string | null
  lastIncrementalScanAt: string | null
  nextScanAt: string | null
  lastError: string | null
  eligibleEntityCount: number
  cachedEntityCount: number
  pendingEntityCount: number
  staleEntityCount: number
  updatedAt: string
}

export type InstanceScanCatalogRecord = {
  instanceId: number
  instanceKind: 'sonarr' | 'radarr'
  updatedAt: string
  catalog: unknown
}

export type InstanceScanEntityRecord = {
  instanceId: number
  entityKey: string
  entityKind: string
  title: string
  payload: unknown
  lastScannedAt: string
  updatedAt: string
}

const appRoot = process.env.POKARR_APP_ROOT ?? process.cwd()

function resolveAppPath(path: string) {
  return isAbsolute(path) ? path : resolve(appRoot, path)
}

const dataDir = resolveAppPath(process.env.POKARR_DATA_DIR ?? 'data')
const defaultBackupRetentionDays = 90
const defaultBackupSchedule = '0 3 * * *'

export type StoreOptions = {
  dataDir?: string
  backupsDir?: string
  dbPath?: string
}

function getDefaultAppVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8')) as {
      version?: string
    }
    const packageVersion = packageJson.version?.trim()
    if (!packageVersion) {
      return '0.1.0-dev'
    }

    return process.env.NODE_ENV === 'production' ? packageVersion : `${packageVersion}-dev`
  } catch {
    return '0.1.0-dev'
  }
}

const appVersion = process.env.APP_VERSION?.replace(/^v(?=\d)/, '') ?? getDefaultAppVersion()

function defaultSettings(): Settings {
  // App settings are UI-managed and stored in SQLite. Keep startup defaults static.
  return settingsSchema.parse({
    backupRetentionDays: defaultBackupRetentionDays,
    backupSchedule: defaultBackupSchedule,
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
}

function nowIso() {
  return new Date().toISOString()
}

function escapeSqlitePath(value: string) {
  return value.replaceAll("'", "''")
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function parseRuleGuards(value: string): RuleGuards {
  return guardsSchema.parse(parseJson(value))
}

function computeNextRunAt(lastRunAt: string | null, createdAt: string, cadenceMinutes: number, enabled: boolean) {
  if (!enabled) {
    return null
  }

  const base = lastRunAt ? new Date(lastRunAt) : new Date(createdAt)
  return new Date(base.getTime() + cadenceMinutes * 60_000).toISOString()
}

export class Store {
  readonly dataDir: string
  readonly backupsDir: string
  readonly dbPath: string
  db: Database
  private dbOpen = false

  constructor(options: StoreOptions = {}) {
    this.dataDir = options.dataDir ?? dataDir
    this.backupsDir = options.backupsDir ?? resolve(this.dataDir, 'backups')
    this.dbPath = options.dbPath ?? resolve(this.dataDir, 'pokarr.sqlite')

    mkdirSync(this.dataDir, { recursive: true })
    mkdirSync(this.backupsDir, { recursive: true })
    this.db = new Database(this.dbPath, { create: true, strict: true })
    this.dbOpen = true
  }

  async init(options?: { pruneBackups?: boolean }) {
    await mkdir(this.dataDir, { recursive: true })
    await mkdir(this.backupsDir, { recursive: true })

    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS instances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_validated_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        cadence_minutes INTEGER NOT NULL,
        batch_size INTEGER NOT NULL,
        cooldown_hours REAL NOT NULL,
        target_kind TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        guards_json TEXT NOT NULL,
        backoff_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
        instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
        trigger TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        status TEXT NOT NULL,
        selected_count INTEGER NOT NULL DEFAULT 0,
        dispatched_count INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL,
        skip_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL,
        path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        restored_at TEXT,
        restore_result TEXT
      );

      CREATE TABLE IF NOT EXISTS rule_entity_states (
        rule_id INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
        entity_key TEXT NOT NULL,
        entity_kind TEXT NOT NULL,
        last_poked_at TEXT,
        last_signature TEXT NOT NULL,
        consecutive_pokes INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (rule_id, entity_key)
      );

      CREATE TABLE IF NOT EXISTS instance_scan_states (
        instance_id INTEGER PRIMARY KEY REFERENCES instances(id) ON DELETE CASCADE,
        catalog_updated_at TEXT,
        last_scan_at TEXT,
        last_successful_scan_at TEXT,
        last_full_scan_at TEXT,
        last_incremental_scan_at TEXT,
        next_scan_at TEXT,
        last_error TEXT,
        eligible_entity_count INTEGER NOT NULL DEFAULT 0,
        cached_entity_count INTEGER NOT NULL DEFAULT 0,
        pending_entity_count INTEGER NOT NULL DEFAULT 0,
        stale_entity_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS instance_scan_catalogs (
        instance_id INTEGER PRIMARY KEY REFERENCES instances(id) ON DELETE CASCADE,
        instance_kind TEXT NOT NULL,
        catalog_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS instance_scan_entities (
        instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
        entity_key TEXT NOT NULL,
        entity_kind TEXT NOT NULL,
        title TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        last_scanned_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (instance_id, entity_key)
      );

      CREATE TABLE IF NOT EXISTS scan_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        trigger TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        phase TEXT,
        total_items INTEGER NOT NULL DEFAULT 0,
        scanned_items INTEGER NOT NULL DEFAULT 0,
        updated_items INTEGER NOT NULL DEFAULT 0,
        skipped_items INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS queue_snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        items_json TEXT NOT NULL,
        issues_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        backup_retention_days INTEGER NOT NULL,
        backup_schedule TEXT NOT NULL,
        notification_url TEXT,
        notify_run_success INTEGER NOT NULL DEFAULT 1,
        notify_run_failure INTEGER NOT NULL DEFAULT 1,
        notify_backup_success INTEGER NOT NULL DEFAULT 1,
        notify_backup_failure INTEGER NOT NULL DEFAULT 1,
        notify_instance_connection_lost INTEGER NOT NULL DEFAULT 1,
        notify_instance_connection_restored INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS instance_scan_entities_instance_id_idx ON instance_scan_entities(instance_id);
      CREATE INDEX IF NOT EXISTS scan_runs_instance_id_idx ON scan_runs(instance_id);
      CREATE INDEX IF NOT EXISTS scan_runs_started_at_idx ON scan_runs(started_at DESC);
    `)

    const currentSettings = defaultSettings()
    this.db
      .query(
        `INSERT INTO queue_snapshot (id, items_json, issues_json, updated_at)
         VALUES (1, '[]', '[]', ?)
         ON CONFLICT(id) DO NOTHING`
      )
      .run(nowIso())

    this.db
      .query(
        `INSERT INTO settings (
          id,
          backup_retention_days,
          backup_schedule,
          notification_url,
          notify_run_success,
          notify_run_failure,
          notify_backup_success,
          notify_backup_failure,
          notify_instance_connection_lost,
          notify_instance_connection_restored,
          updated_at
        )
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`
      )
      .run(
        currentSettings.backupRetentionDays,
        currentSettings.backupSchedule,
        currentSettings.notifications.notificationUrl,
        currentSettings.notifications.runSuccess ? 1 : 0,
        currentSettings.notifications.runFailure ? 1 : 0,
        currentSettings.notifications.backupSuccess ? 1 : 0,
        currentSettings.notifications.backupFailure ? 1 : 0,
        currentSettings.notifications.instanceConnectionLost ? 1 : 0,
        currentSettings.notifications.instanceConnectionRestored ? 1 : 0,
        nowIso()
      )

    if (options?.pruneBackups ?? true) {
      await this.pruneBackups()
    }
  }

  close() {
    if (!this.dbOpen) {
      return
    }

    this.db.close()
    this.dbOpen = false
  }

  private open() {
    if (this.dbOpen) {
      return
    }

    this.db = new Database(this.dbPath, { create: true, strict: true })
    this.dbOpen = true
  }

  private checkpointDatabase() {
    if (!this.dbOpen) {
      return
    }

    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  }

  private mapBackupRow(row: Record<string, unknown>): BackupRecord {
    return {
      id: Number(row.id),
      trigger: String(row.trigger) as BackupTrigger,
      createdAt: String(row.created_at),
      path: String(row.path),
      sizeBytes: Number(row.size_bytes),
      restoredAt: row.restored_at ? String(row.restored_at) : null,
      restoreResult: row.restore_result ? String(row.restore_result) : null
    }
  }

  private getBackupRowById(id: number) {
    return this.db
      .query(
        `SELECT id, trigger, created_at, path, size_bytes, restored_at, restore_result
         FROM backups
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | null
  }

  getBackupById(id: number) {
    const row = this.getBackupRowById(id)
    return row ? this.mapBackupRow(row) : null
  }

  private async createBackupSnapshot(trigger: BackupTrigger): Promise<BackupRecord> {
    const timestamp = nowIso()
    const fileSafeStamp = timestamp.replaceAll(':', '-')
    const suffix = trigger === 'pre_restore' ? '-pre-restore' : ''
    const backupPath = resolve(this.backupsDir, `pokarr-${fileSafeStamp}${suffix}.sqlite`)

    this.checkpointDatabase()
    this.db.exec(`VACUUM INTO '${escapeSqlitePath(backupPath)}'`)

    const size = (await stat(backupPath)).size
    const result = this.db
      .query(
        `INSERT INTO backups (trigger, created_at, path, size_bytes, restored_at, restore_result)
         VALUES (?, ?, ?, ?, NULL, NULL)
         RETURNING id`
      )
      .get(trigger, timestamp, backupPath, size) as { id: number }

    return this.getBackupById(result.id)!
  }

  private async reconcileBackupCatalog(knownBackups: BackupRecord[]) {
    const currentBackups = this.getBackups()
    const currentByPath = new Map(currentBackups.map((backup) => [backup.path, backup]))
    const knownByPath = new Map(knownBackups.map((backup) => [backup.path, backup]))

    for (const backup of currentBackups) {
      try {
        await stat(backup.path)
      } catch {
        this.db.query('DELETE FROM backups WHERE id = ?').run(backup.id)
      }
    }

    const files = await readdir(this.backupsDir, { withFileTypes: true })
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.sqlite')) {
        continue
      }

      const path = resolve(this.backupsDir, file.name)
      const size = (await stat(path)).size
      const existing = currentByPath.get(path)
      const known = knownByPath.get(path)

      if (existing) {
        this.db
          .query(
            `UPDATE backups
             SET trigger = ?,
                 created_at = ?,
                 size_bytes = ?,
                 restored_at = ?,
                 restore_result = ?
             WHERE id = ?`
          )
          .run(
            known?.trigger ?? existing.trigger,
            known?.createdAt ?? existing.createdAt,
            size,
            known?.restoredAt ?? existing.restoredAt,
            known?.restoreResult ?? existing.restoreResult,
            existing.id
          )
        continue
      }

      const createdAt = known?.createdAt ?? new Date((await stat(path)).mtimeMs).toISOString()
      this.db
        .query(
          `INSERT INTO backups (trigger, created_at, path, size_bytes, restored_at, restore_result)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          known?.trigger ?? 'manual',
          createdAt,
          path,
          size,
          known?.restoredAt ?? null,
          known?.restoreResult ?? null
        )
    }
  }

  private recordBackupRestoreOutcome(path: string, restoredAt: string | null, restoreResult: string) {
    const backup = this.getBackups().find((item) => item.path === path)
    if (!backup) {
      return null
    }

    this.db
      .query(
        `UPDATE backups
         SET restored_at = ?,
             restore_result = ?
         WHERE id = ?`
      )
      .run(restoredAt, restoreResult, backup.id)

    return this.getBackupById(backup.id)
  }

  getSettings(): Settings {
    const row = this.db
      .query(
        `SELECT
          backup_retention_days,
          backup_schedule,
          notification_url,
          notify_run_success,
          notify_run_failure,
          notify_backup_success,
          notify_backup_failure,
          notify_instance_connection_lost,
          notify_instance_connection_restored
         FROM settings
         WHERE id = 1`
      )
      .get() as Record<string, unknown> | null

    if (!row) {
      return defaultSettings()
    }

    return settingsSchema.parse({
      backupRetentionDays: Number(row.backup_retention_days),
      backupSchedule: String(row.backup_schedule),
      notifications: {
        notificationUrl: row.notification_url ? String(row.notification_url) : null,
        runSuccess: Boolean(row.notify_run_success),
        runFailure: Boolean(row.notify_run_failure),
        backupSuccess: Boolean(row.notify_backup_success),
        backupFailure: Boolean(row.notify_backup_failure),
        instanceConnectionLost: Boolean(row.notify_instance_connection_lost),
        instanceConnectionRestored: Boolean(row.notify_instance_connection_restored)
      }
    })
  }

  async updateSettings(input: SettingsUpdate): Promise<Settings> {
    this.db
      .query(
        `UPDATE settings
         SET backup_retention_days = ?,
             backup_schedule = ?,
             notification_url = ?,
             notify_run_success = ?,
             notify_run_failure = ?,
             notify_backup_success = ?,
             notify_backup_failure = ?,
             notify_instance_connection_lost = ?,
             notify_instance_connection_restored = ?,
             updated_at = ?
         WHERE id = 1`
      )
      .run(
        input.backupRetentionDays,
        input.backupSchedule,
        input.notifications.notificationUrl,
        input.notifications.runSuccess ? 1 : 0,
        input.notifications.runFailure ? 1 : 0,
        input.notifications.backupSuccess ? 1 : 0,
        input.notifications.backupFailure ? 1 : 0,
        input.notifications.instanceConnectionLost ? 1 : 0,
        input.notifications.instanceConnectionRestored ? 1 : 0,
        nowIso()
      )

    await this.pruneBackups()

    return this.getSettings()
  }

  hasUsers() {
    const row = this.db.query('SELECT COUNT(*) AS count FROM users').get() as { count: number | bigint }
    return Number(row.count) > 0
  }

  getAuthUserById(id: number) {
    const row = this.db
      .query(
        `SELECT id, username
         FROM users
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | null

    if (!row) {
      return null
    }

    return {
      id: Number(row.id),
      username: String(row.username)
    }
  }

  getAuthUserByUsername(username: string) {
    const row = this.db
      .query(
        `SELECT id, username, password_hash, last_login_at, created_at, updated_at
         FROM users
         WHERE lower(username) = lower(?)`
      )
      .get(username) as Record<string, unknown> | null

    if (!row) {
      return null
    }

    return {
      id: Number(row.id),
      username: String(row.username),
      passwordHash: String(row.password_hash),
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }
  }

  createInitialUser(input: { username: string; passwordHash: string }): AuthUser | null {
    if (this.hasUsers()) {
      return null
    }

    const timestamp = nowIso()
    const result = this.db
      .query(
        `INSERT INTO users (username, password_hash, last_login_at, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?)
         RETURNING id`
      )
      .get(input.username, input.passwordHash, timestamp, timestamp) as { id: number }

    const user = this.getAuthUserById(result.id)
    return user ? { username: user.username } : null
  }

  recordUserLogin(id: number) {
    const timestamp = nowIso()
    this.db
      .query(
        `UPDATE users
         SET last_login_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(timestamp, timestamp, id)
  }

  pruneExpiredSessions(referenceTime = nowIso()) {
    this.db.query('DELETE FROM sessions WHERE expires_at <= ?').run(referenceTime)
  }

  createSession(input: { userId: number; tokenHash: string; expiresAt: string }) {
    const timestamp = nowIso()
    this.db
      .query(
        `INSERT INTO sessions (user_id, token_hash, created_at, last_used_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.userId, input.tokenHash, timestamp, timestamp, input.expiresAt)
  }

  getSessionByTokenHash(tokenHash: string) {
    const row = this.db
      .query(
        `SELECT s.id, s.user_id, s.token_hash, s.created_at, s.last_used_at, s.expires_at, u.username
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(tokenHash) as Record<string, unknown> | null

    if (!row) {
      return null
    }

    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      tokenHash: String(row.token_hash),
      createdAt: String(row.created_at),
      lastUsedAt: String(row.last_used_at),
      expiresAt: String(row.expires_at),
      user: {
        username: String(row.username)
      } satisfies AuthUser
    }
  }

  touchSession(tokenHash: string, expiresAt: string) {
    this.db
      .query(
        `UPDATE sessions
         SET last_used_at = ?, expires_at = ?
         WHERE token_hash = ?`
      )
      .run(nowIso(), expiresAt, tokenHash)
  }

  deleteSession(tokenHash: string) {
    const result = this.db.query('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
    return Number(result.changes) > 0
  }

  getInstances(): InstanceRecord[] {
    const rows = this.db
      .query(
        `SELECT id, kind, name, base_url, api_key, enabled, last_validated_at, last_error, created_at, updated_at
         FROM instances
         ORDER BY updated_at DESC`
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row.id),
      kind: String(row.kind) as InstanceRecord['kind'],
      name: String(row.name),
      baseUrl: String(row.base_url),
      enabled: Boolean(row.enabled),
      lastValidatedAt: row.last_validated_at ? String(row.last_validated_at) : null,
      lastError: row.last_error ? String(row.last_error) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }))
  }

  getInstanceConnection(id: number) {
    const row = this.db
      .query(
        `SELECT id, kind, name, base_url, api_key, enabled
         FROM instances
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | null

    if (!row) {
      return null
    }

    return {
      id: Number(row.id),
      kind: String(row.kind),
      name: String(row.name),
      baseUrl: String(row.base_url),
      apiKey: String(row.api_key),
      enabled: Boolean(row.enabled)
    }
  }

  createInstance(input: InstanceInput): InstanceRecord {
    const timestamp = nowIso()
    const result = this.db
      .query(
        `INSERT INTO instances (kind, name, base_url, api_key, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .get(
        input.kind,
        input.name,
        input.baseUrl,
        input.apiKey,
        input.enabled ? 1 : 0,
        timestamp,
        timestamp
      ) as { id: number }

    return this.getInstances().find((item) => item.id === result.id)!
  }

  updateInstance(id: number, input: InstanceInput): InstanceRecord | null {
    const timestamp = nowIso()
    this.db
      .query(
        `UPDATE instances
         SET kind = ?,
             name = ?,
             base_url = ?,
             api_key = ?,
             enabled = ?,
             last_validated_at = NULL,
             last_error = NULL,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.kind,
        input.name,
        input.baseUrl,
        input.apiKey,
        input.enabled ? 1 : 0,
        timestamp,
        id
      )

    return this.getInstances().find((item) => item.id === id) ?? null
  }

  deleteInstance(id: number): boolean {
    const result = this.db.query('DELETE FROM instances WHERE id = ?').run(id)
    return Number(result.changes) > 0
  }

  updateInstanceValidation(id: number, success: boolean, message?: string): InstanceRecord | null {
    const timestamp = nowIso()
    this.db
      .query(
        `UPDATE instances
         SET last_validated_at = ?, last_error = ?
         WHERE id = ?`
      )
      .run(timestamp, success ? null : message ?? 'Validation failed', id)

    return this.getInstances().find((item) => item.id === id) ?? null
  }

  getRules(): RuleRecord[] {
    const rows = this.db
      .query(
        `SELECT
           rule_row.id,
           rule_row.instance_id,
           rule_row.name,
           rule_row.cadence_minutes,
           rule_row.batch_size,
           rule_row.cooldown_hours,
           rule_row.target_kind,
           rule_row.scope_json,
           rule_row.guards_json,
           rule_row.backoff_json,
           rule_row.enabled,
           rule_row.created_at,
           rule_row.updated_at,
           (
             SELECT r.started_at
             FROM runs r
             WHERE r.rule_id = rule_row.id
             ORDER BY r.started_at DESC
             LIMIT 1
           ) AS last_run_at
         FROM rules rule_row
         ORDER BY rule_row.updated_at DESC`
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => {
      const createdAt = String(row.created_at)
      const lastRunAt = row.last_run_at ? String(row.last_run_at) : null
      const cadenceMinutes = Number(row.cadence_minutes)
      const enabled = Boolean(row.enabled)

      return {
        id: Number(row.id),
        instanceId: Number(row.instance_id),
        name: String(row.name),
        cadenceMinutes,
        batchSize: Number(row.batch_size),
        cooldownHours: Number(row.cooldown_hours),
        targetKind: String(row.target_kind) as RuleRecord['targetKind'],
        scope: parseJson(row.scope_json as string),
        guards: parseRuleGuards(row.guards_json as string),
        backoff: parseJson(row.backoff_json as string),
        enabled,
        createdAt,
        updatedAt: String(row.updated_at),
        lastRunAt,
        nextRunAt: computeNextRunAt(lastRunAt, createdAt, cadenceMinutes, enabled)
      }
    })
  }

  createRule(input: RuleInput): RuleRecord {
    const timestamp = nowIso()
    const result = this.db
      .query(
        `INSERT INTO rules (
          instance_id,
          name,
          cadence_minutes,
          batch_size,
          cooldown_hours,
          target_kind,
          scope_json,
          guards_json,
          backoff_json,
          enabled,
          created_at,
          updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .get(
        input.instanceId,
        input.name,
        input.cadenceMinutes,
        input.batchSize,
        input.cooldownHours,
        input.targetKind,
        JSON.stringify(input.scope),
        JSON.stringify(input.guards),
        JSON.stringify(input.backoff),
        input.enabled ? 1 : 0,
        timestamp,
        timestamp
      ) as { id: number }

    return this.getRules().find((item) => item.id === result.id)!
  }

  updateRule(id: number, input: RuleUpdate): RuleRecord | null {
    const timestamp = nowIso()
    this.db
      .query(
        `UPDATE rules
         SET instance_id = ?,
             name = ?,
             cadence_minutes = ?,
             batch_size = ?,
             cooldown_hours = ?,
             target_kind = ?,
             scope_json = ?,
             guards_json = ?,
             backoff_json = ?,
             enabled = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.instanceId,
        input.name,
        input.cadenceMinutes,
        input.batchSize,
        input.cooldownHours,
        input.targetKind,
        JSON.stringify(input.scope),
        JSON.stringify(input.guards),
        JSON.stringify(input.backoff),
        input.enabled ? 1 : 0,
        timestamp,
        id
      )

    return this.getRules().find((item) => item.id === id) ?? null
  }

  setRuleEnabled(id: number, enabled: boolean): RuleRecord | null {
    const existing = this.getRules().find((item) => item.id === id)
    if (!existing) {
      return null
    }

    return this.updateRule(id, {
      instanceId: existing.instanceId,
      name: existing.name,
      cadenceMinutes: existing.cadenceMinutes,
      batchSize: existing.batchSize,
      cooldownHours: existing.cooldownHours,
      targetKind: existing.targetKind,
      scope: existing.scope,
      guards: existing.guards,
      backoff: existing.backoff,
      enabled
    })
  }

  deleteRule(id: number): boolean {
    const result = this.db.query('DELETE FROM rules WHERE id = ?').run(id)
    return Number(result.changes) > 0
  }

  getRuns(): RunRecord[] {
    const rows = this.db
      .query(
        `SELECT id, rule_id, instance_id, trigger, started_at, ended_at, status, selected_count, dispatched_count, summary, skip_reason
         FROM runs
         ORDER BY started_at DESC
         LIMIT 100`
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row.id),
      ruleId: Number(row.rule_id),
      instanceId: Number(row.instance_id),
      trigger: String(row.trigger) as RunRecord['trigger'],
      startedAt: String(row.started_at),
      endedAt: String(row.ended_at),
      status: String(row.status) as RunRecord['status'],
      selectedCount: Number(row.selected_count),
      dispatchedCount: Number(row.dispatched_count),
      summary: String(row.summary),
      skipReason: row.skip_reason ? String(row.skip_reason) : null
    }))
  }

  getRunCount() {
    const row = this.db
      .query(
        `SELECT COUNT(*) AS count
         FROM runs`
      )
      .get() as { count?: number } | null

    return Number(row?.count ?? 0)
  }

  recordRun(input: {
    ruleId: number
    instanceId: number
    trigger: RunRecord['trigger']
    startedAt: string
    endedAt: string
    status: RunRecord['status']
    selectedCount: number
    dispatchedCount: number
    summary: string
    skipReason?: string | null
  }): RunRecord {
    const result = this.db
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .get(
        input.ruleId,
        input.instanceId,
        input.trigger,
        input.startedAt,
        input.endedAt,
        input.status,
        input.selectedCount,
        input.dispatchedCount,
        input.summary,
        input.skipReason ?? null
      ) as { id: number }

    return this.getRuns().find((item) => item.id === result.id)!
  }

  getRuleEntityStates(ruleId: number): RuleEntityStateRecord[] {
    const rows = this.db
      .query(
        `SELECT rule_id, entity_key, entity_kind, last_poked_at, last_signature, consecutive_pokes, updated_at
         FROM rule_entity_states
         WHERE rule_id = ?`
      )
      .all(ruleId) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      ruleId: Number(row.rule_id),
      entityKey: String(row.entity_key),
      entityKind: String(row.entity_kind) as RuleEntityStateRecord['entityKind'],
      lastPokedAt: row.last_poked_at ? String(row.last_poked_at) : null,
      lastSignature: String(row.last_signature),
      consecutivePokes: Number(row.consecutive_pokes),
      updatedAt: String(row.updated_at)
    }))
  }

  upsertRuleEntityStates(
    ruleId: number,
    entries: Array<{
      entityKey: string
      entityKind: 'movie' | 'series' | 'season'
      lastPokedAt: string | null
      lastSignature: string
      consecutivePokes: number
    }>
  ) {
    if (entries.length === 0) {
      return
    }

    const timestamp = nowIso()
    const upsert = this.db.query(
      `INSERT INTO rule_entity_states (
        rule_id,
        entity_key,
        entity_kind,
        last_poked_at,
        last_signature,
        consecutive_pokes,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(rule_id, entity_key) DO UPDATE SET
        entity_kind = excluded.entity_kind,
        last_poked_at = excluded.last_poked_at,
        last_signature = excluded.last_signature,
        consecutive_pokes = excluded.consecutive_pokes,
        updated_at = excluded.updated_at`
    )

    const transaction = this.db.transaction(
      (
        nextEntries: Array<{
          entityKey: string
          entityKind: 'movie' | 'series' | 'season'
          lastPokedAt: string | null
          lastSignature: string
          consecutivePokes: number
        }>
      ) => {
        for (const entry of nextEntries) {
          upsert.run(
            ruleId,
            entry.entityKey,
            entry.entityKind,
            entry.lastPokedAt,
            entry.lastSignature,
            entry.consecutivePokes,
            timestamp
          )
        }
      }
    )

    transaction(entries)
  }

  getInstanceScanState(instanceId: number): InstanceScanStateRecord | null {
    const row = this.db
      .query(
        `SELECT
           instance_id,
           catalog_updated_at,
           last_scan_at,
           last_successful_scan_at,
           last_full_scan_at,
           last_incremental_scan_at,
           next_scan_at,
           last_error,
           eligible_entity_count,
           cached_entity_count,
           pending_entity_count,
           stale_entity_count,
           updated_at
         FROM instance_scan_states
         WHERE instance_id = ?`
      )
      .get(instanceId) as Record<string, unknown> | null

    if (!row) {
      return null
    }

    return {
      instanceId: Number(row.instance_id),
      catalogUpdatedAt: row.catalog_updated_at ? String(row.catalog_updated_at) : null,
      lastScanAt: row.last_scan_at ? String(row.last_scan_at) : null,
      lastSuccessfulScanAt: row.last_successful_scan_at ? String(row.last_successful_scan_at) : null,
      lastFullScanAt: row.last_full_scan_at ? String(row.last_full_scan_at) : null,
      lastIncrementalScanAt: row.last_incremental_scan_at ? String(row.last_incremental_scan_at) : null,
      nextScanAt: row.next_scan_at ? String(row.next_scan_at) : null,
      lastError: row.last_error ? String(row.last_error) : null,
      eligibleEntityCount: Number(row.eligible_entity_count),
      cachedEntityCount: Number(row.cached_entity_count),
      pendingEntityCount: Number(row.pending_entity_count),
      staleEntityCount: Number(row.stale_entity_count),
      updatedAt: String(row.updated_at)
    }
  }

  getInstanceScanStates(): InstanceScanStateRecord[] {
    const rows = this.db
      .query(
        `SELECT
           instance_id,
           catalog_updated_at,
           last_scan_at,
           last_successful_scan_at,
           last_full_scan_at,
           last_incremental_scan_at,
           next_scan_at,
           last_error,
           eligible_entity_count,
           cached_entity_count,
           pending_entity_count,
           stale_entity_count,
           updated_at
         FROM instance_scan_states`
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => ({
      instanceId: Number(row.instance_id),
      catalogUpdatedAt: row.catalog_updated_at ? String(row.catalog_updated_at) : null,
      lastScanAt: row.last_scan_at ? String(row.last_scan_at) : null,
      lastSuccessfulScanAt: row.last_successful_scan_at ? String(row.last_successful_scan_at) : null,
      lastFullScanAt: row.last_full_scan_at ? String(row.last_full_scan_at) : null,
      lastIncrementalScanAt: row.last_incremental_scan_at ? String(row.last_incremental_scan_at) : null,
      nextScanAt: row.next_scan_at ? String(row.next_scan_at) : null,
      lastError: row.last_error ? String(row.last_error) : null,
      eligibleEntityCount: Number(row.eligible_entity_count),
      cachedEntityCount: Number(row.cached_entity_count),
      pendingEntityCount: Number(row.pending_entity_count),
      staleEntityCount: Number(row.stale_entity_count),
      updatedAt: String(row.updated_at)
    }))
  }

  upsertInstanceScanState(
    input: Omit<InstanceScanStateRecord, 'updatedAt'> & {
      updatedAt?: string
    }
  ) {
    const updatedAt = input.updatedAt ?? nowIso()
    this.db
      .query(
        `INSERT INTO instance_scan_states (
          instance_id,
          catalog_updated_at,
          last_scan_at,
          last_successful_scan_at,
          last_full_scan_at,
          last_incremental_scan_at,
          next_scan_at,
          last_error,
          eligible_entity_count,
          cached_entity_count,
          pending_entity_count,
          stale_entity_count,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instance_id) DO UPDATE SET
          catalog_updated_at = excluded.catalog_updated_at,
          last_scan_at = excluded.last_scan_at,
          last_successful_scan_at = excluded.last_successful_scan_at,
          last_full_scan_at = excluded.last_full_scan_at,
          last_incremental_scan_at = excluded.last_incremental_scan_at,
          next_scan_at = excluded.next_scan_at,
          last_error = excluded.last_error,
          eligible_entity_count = excluded.eligible_entity_count,
          cached_entity_count = excluded.cached_entity_count,
          pending_entity_count = excluded.pending_entity_count,
          stale_entity_count = excluded.stale_entity_count,
          updated_at = excluded.updated_at`
      )
      .run(
        input.instanceId,
        input.catalogUpdatedAt,
        input.lastScanAt,
        input.lastSuccessfulScanAt,
        input.lastFullScanAt,
        input.lastIncrementalScanAt,
        input.nextScanAt,
        input.lastError,
        input.eligibleEntityCount,
        input.cachedEntityCount,
        input.pendingEntityCount,
        input.staleEntityCount,
        updatedAt
      )
  }

  getInstanceScanCatalog(instanceId: number): InstanceScanCatalogRecord | null {
    const row = this.db
      .query(
        `SELECT instance_id, instance_kind, catalog_json, updated_at
         FROM instance_scan_catalogs
         WHERE instance_id = ?`
      )
      .get(instanceId) as Record<string, unknown> | null

    if (!row) {
      return null
    }

    return {
      instanceId: Number(row.instance_id),
      instanceKind: String(row.instance_kind) as InstanceScanCatalogRecord['instanceKind'],
      updatedAt: String(row.updated_at),
      catalog: parseJson(row.catalog_json as string)
    }
  }

  replaceInstanceScanCatalog(input: {
    instanceId: number
    instanceKind: InstanceScanCatalogRecord['instanceKind']
    catalog: unknown
    updatedAt?: string
  }) {
    const updatedAt = input.updatedAt ?? nowIso()
    this.db
      .query(
        `INSERT INTO instance_scan_catalogs (instance_id, instance_kind, catalog_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(instance_id) DO UPDATE SET
           instance_kind = excluded.instance_kind,
           catalog_json = excluded.catalog_json,
           updated_at = excluded.updated_at`
      )
      .run(input.instanceId, input.instanceKind, JSON.stringify(input.catalog), updatedAt)
  }

  getInstanceScanEntities(instanceId: number, entityKeys?: string[]): InstanceScanEntityRecord[] {
    if (entityKeys && entityKeys.length === 0) {
      return []
    }

    const rows = entityKeys
      ? (this.db
          .query(
            `SELECT instance_id, entity_key, entity_kind, title, payload_json, last_scanned_at, updated_at
             FROM instance_scan_entities
             WHERE instance_id = ?
               AND entity_key IN (${entityKeys.map(() => '?').join(', ')})`
          )
          .all(instanceId, ...entityKeys) as Array<Record<string, unknown>>)
      : (this.db
          .query(
            `SELECT instance_id, entity_key, entity_kind, title, payload_json, last_scanned_at, updated_at
             FROM instance_scan_entities
             WHERE instance_id = ?`
          )
          .all(instanceId) as Array<Record<string, unknown>>)

    return rows.map((row) => ({
      instanceId: Number(row.instance_id),
      entityKey: String(row.entity_key),
      entityKind: String(row.entity_kind),
      title: String(row.title),
      payload: parseJson(row.payload_json as string),
      lastScannedAt: String(row.last_scanned_at),
      updatedAt: String(row.updated_at)
    }))
  }

  upsertInstanceScanEntities(
    instanceId: number,
    entries: Array<{
      entityKey: string
      entityKind: string
      title: string
      payload: unknown
      lastScannedAt: string
    }>
  ) {
    if (entries.length === 0) {
      return
    }

    const upsert = this.db.query(
      `INSERT INTO instance_scan_entities (
        instance_id,
        entity_key,
        entity_kind,
        title,
        payload_json,
        last_scanned_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_id, entity_key) DO UPDATE SET
        entity_kind = excluded.entity_kind,
        title = excluded.title,
        payload_json = excluded.payload_json,
        last_scanned_at = excluded.last_scanned_at,
        updated_at = excluded.updated_at`
    )

    const transaction = this.db.transaction(
      (
        nextEntries: Array<{
          entityKey: string
          entityKind: string
          title: string
          payload: unknown
          lastScannedAt: string
        }>
      ) => {
        for (const entry of nextEntries) {
          upsert.run(
            instanceId,
            entry.entityKey,
            entry.entityKind,
            entry.title,
            JSON.stringify(entry.payload),
            entry.lastScannedAt,
            nowIso()
          )
        }
      }
    )

    transaction(entries)
  }

  deleteInstanceScanEntitiesNotIn(instanceId: number, entityKeys: string[]) {
    if (entityKeys.length === 0) {
      this.db.query('DELETE FROM instance_scan_entities WHERE instance_id = ?').run(instanceId)
      return
    }

    this.db
      .query(
        `DELETE FROM instance_scan_entities
         WHERE instance_id = ?
           AND entity_key NOT IN (${entityKeys.map(() => '?').join(', ')})`
      )
      .run(instanceId, ...entityKeys)
  }

  recordScanRun(input: {
    instanceId: number
    kind: ScanKind
    trigger: ScanTrigger
    status: ScanRunRecord['status']
    startedAt: string
    endedAt: string | null
    phase?: string | null
    totalItems: number
    scannedItems: number
    updatedItems: number
    skippedItems: number
    summary: string
    error?: string | null
  }): ScanRunRecord {
    const result = this.db
      .query(
        `INSERT INTO scan_runs (
          instance_id,
          kind,
          trigger,
          status,
          started_at,
          ended_at,
          phase,
          total_items,
          scanned_items,
          updated_items,
          skipped_items,
          summary,
          error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id`
      )
      .get(
        input.instanceId,
        input.kind,
        input.trigger,
        input.status,
        input.startedAt,
        input.endedAt,
        input.phase ?? null,
        input.totalItems,
        input.scannedItems,
        input.updatedItems,
        input.skippedItems,
        input.summary,
        input.error ?? null
      ) as { id: number }

    return this.getScanRuns().find((item) => item.id === result.id)!
  }

  getScanRuns(limit = 50): ScanRunRecord[] {
    const rows = this.db
      .query(
        `SELECT
           id,
           instance_id,
           kind,
           trigger,
           status,
           started_at,
           ended_at,
           phase,
           total_items,
           scanned_items,
           updated_items,
           skipped_items,
           summary,
           error
         FROM scan_runs
         ORDER BY started_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>

    return rows.map((row) =>
      scanRunRecordSchema.parse({
        id: Number(row.id),
        instanceId: Number(row.instance_id),
        kind: String(row.kind),
        trigger: String(row.trigger),
        status: String(row.status),
        startedAt: String(row.started_at),
        endedAt: row.ended_at ? String(row.ended_at) : null,
        phase: row.phase ? String(row.phase) : null,
        totalItems: Number(row.total_items),
        scannedItems: Number(row.scanned_items),
        updatedItems: Number(row.updated_items),
        skippedItems: Number(row.skipped_items),
        summary: String(row.summary),
        error: row.error ? String(row.error) : null
      })
    )
  }

  getQueueSnapshot(): QueueSnapshot {
    const row = this.db
      .query(
        `SELECT items_json, issues_json, updated_at
         FROM queue_snapshot
         WHERE id = 1`
      )
      .get() as Record<string, unknown> | null

    if (!row) {
      return queueSnapshotSchema.parse({
        items: [],
        issues: [],
        updatedAt: null
      })
    }

    return queueSnapshotSchema.parse({
      items: parseJson(row.items_json as string),
      issues: parseJson(row.issues_json as string),
      updatedAt: String(row.updated_at)
    })
  }

  replaceQueueSnapshot(snapshot: {
    items: QueueSnapshot['items']
    issues: QueueIssue[]
    updatedAt?: string
  }) {
    const updatedAt = snapshot.updatedAt ?? nowIso()
    this.db
      .query(
        `INSERT INTO queue_snapshot (id, items_json, issues_json, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           items_json = excluded.items_json,
           issues_json = excluded.issues_json,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(snapshot.items), JSON.stringify(snapshot.issues), updatedAt)
  }

  getBackups(): BackupRecord[] {
    const rows = this.db
      .query(
        `SELECT id, trigger, created_at, path, size_bytes, restored_at, restore_result
         FROM backups
         ORDER BY created_at DESC`
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => this.mapBackupRow(row))
  }

  getLatestBackupCreatedAt(trigger?: BackupTrigger) {
    const row = trigger
      ? (this.db
          .query(
            `SELECT created_at
             FROM backups
             WHERE trigger = ?
             ORDER BY created_at DESC
             LIMIT 1`
          )
          .get(trigger) as Record<string, unknown> | null)
      : (this.db
          .query(
            `SELECT created_at
             FROM backups
             ORDER BY created_at DESC
             LIMIT 1`
          )
          .get() as Record<string, unknown> | null)

    return row?.created_at ? String(row.created_at) : null
  }

  async createBackup(trigger: BackupTrigger = 'manual'): Promise<BackupRecord> {
    const backup = await this.createBackupSnapshot(trigger)
    await this.pruneBackups()
    return this.getBackupById(backup.id)!
  }

  async restoreBackup(id: number) {
    const target = this.getBackupById(id)
    if (!target) {
      throw new Error('Backup not found.')
    }

    const attemptedAt = nowIso()
    try {
      await stat(target.path)
    } catch {
      this.recordBackupRestoreOutcome(
        target.path,
        null,
        `Restore failed at ${attemptedAt}: the selected backup file is missing.`
      )
      throw new Error('The selected backup file is missing.')
    }

    const safetyBackup = await this.createBackupSnapshot('pre_restore')
    const knownBackups = this.getBackups()
    const restoredAt = attemptedAt

    try {
      this.checkpointDatabase()
      this.close()
      await rm(`${this.dbPath}-wal`, { force: true })
      await rm(`${this.dbPath}-shm`, { force: true })
      await copyFile(target.path, this.dbPath)

      this.open()
      await this.init({ pruneBackups: false })
      await this.reconcileBackupCatalog(knownBackups)
      this.replaceQueueSnapshot({
        items: [],
        issues: [],
        updatedAt: restoredAt
      })

      const resultMessage = `Restore completed. Safety backup: ${safetyBackup.path}`
      const restoredBackup = this.recordBackupRestoreOutcome(target.path, restoredAt, resultMessage)
      if (!restoredBackup) {
        throw new Error('Restore completed but the restored backup record could not be reconciled.')
      }

      return restoredBackup
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restore failed.'

      try {
        this.close()
        await rm(`${this.dbPath}-wal`, { force: true })
        await rm(`${this.dbPath}-shm`, { force: true })
        await copyFile(safetyBackup.path, this.dbPath)
        this.open()
        await this.init({ pruneBackups: false })
        await this.reconcileBackupCatalog(knownBackups)
        this.recordBackupRestoreOutcome(
          target.path,
          null,
          `Restore failed at ${restoredAt}: ${message} Rolled back to safety backup ${safetyBackup.path}.`
        )
      } catch (recoveryError) {
        console.error('failed to reconcile backup restore state', recoveryError)
        throw new Error(`Restore failed: ${message}. Automatic rollback also failed.`)
      }

      throw new Error(`Restore failed: ${message}`)
    }
  }

  async pruneBackups() {
    const retentionDays = this.getSettings().backupRetentionDays
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const backups = this.getBackups()
    const stale = backups.filter((backup) => {
      const created = new Date(backup.createdAt).getTime()
      return created < cutoff
    })

    for (const backup of stale) {
      await rm(backup.path, { force: true })
      this.db.query('DELETE FROM backups WHERE id = ?').run(backup.id)
    }

    const currentPaths = new Set(this.getBackups().map((backup) => backup.path))
    const files = await readdir(this.backupsDir, { withFileTypes: true })
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.sqlite')) {
        continue
      }
      const path = resolve(this.backupsDir, file.name)
      if (!currentPaths.has(path)) {
        await rm(path, { force: true })
      }
    }
  }

  getState(): AppState {
    const instances = this.getInstances()
    const rules = this.getRules()
    const runs = this.getRuns()
    const backups = this.getBackups()
    const nextRunAt = rules
      .filter((rule) => rule.enabled && rule.nextRunAt)
      .map((rule) => rule.nextRunAt)
      .sort()[0] ?? null

    return appStateSchema.parse({
      app: {
        name: 'pokarr',
        version: appVersion,
        mode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
      },
      dashboard: {
        instanceCount: instances.length,
        enabledRuleCount: rules.filter((rule) => rule.enabled).length,
        totalRunCount: this.getRunCount(),
        backupCount: backups.length,
        nextRunAt
      },
      instances,
      rules,
      runs,
      backups,
      settings: this.getSettings()
    })
  }
}
