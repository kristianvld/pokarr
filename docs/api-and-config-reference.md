# API and Config Reference

This page documents the routes, payload shapes, and environment variables used by the app.

## API Surface

### Authentication routes

- `GET /api/auth/session`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`

`/api/auth/setup` works only until the first admin user has been created.

`GET /api/auth/session` tells the UI whether first-run setup is required and whether the current browser session is authenticated.

Pokarr is designed for one built-in admin account.

### Authenticated app routes

#### Health and state

- `GET /api/health`
- `GET /api/state`
- `GET /api/scans/status`
- `GET /api/queue`
- `POST /api/queue/rebuild`

`GET /api/health` is authenticated like the rest of the app API. For first-load setup checks before sign-in, use `GET /api/auth/session` instead.

#### Instances

- `POST /api/instances`
- `POST /api/instances/test`
- `GET /api/instances/:id`
- `PUT /api/instances/:id`
- `DELETE /api/instances/:id`
- `POST /api/instances/:id/validate`
- `GET /api/instances/:id/qualities`

#### Rules

- `POST /api/rules`
- `PUT /api/rules/:id`
- `DELETE /api/rules/:id`
- `POST /api/rules/:id/enabled`
- `POST /api/rules/:id/run`
- `POST /api/rules/:id/refresh`

#### Scan worker

- `POST /api/scans/run`

`POST /api/scans/run` accepts `{ "kind": "full" | "incremental", "instanceId"?: number | null }`. The app uses it for manual scans, while the background worker schedules incremental refreshes automatically.

#### Settings and notifications

- `POST /api/settings`
- `POST /api/settings/notifications/validate`
- `POST /api/settings/notifications/test`

#### Backups

- `POST /api/backups`
- `POST /api/backups/:id/restore`

## Key Data Shapes

### Auth session

```ts
type AuthSession = {
  setupRequired: boolean
  authenticated: boolean
  user: {
    username: string
  } | null
}
```

### Auth credentials

```ts
type AuthCredentials = {
  username: string
  password: string
}
```

### Instance input

```ts
type InstanceInput = {
  kind: 'sonarr' | 'radarr'
  name: string
  baseUrl: string
  apiKey: string
  enabled: boolean
}
```

### Rule input

```ts
type RuleInput = {
  instanceId: number
  name: string
  cadenceMinutes: number
  batchSize: number
  cooldownHours: number
  targetKind: 'movie' | 'series' | 'season'
  scope: {
    missingOnly: boolean
    useProfileTargets: boolean
    minimumQuality: string | null
    minimumCustomFormatScore: number | null
  }
  guards: {
    monitoredOnly: boolean
    minimumReleaseAgeMinutes: number
  }
  backoff: {
    enabled: boolean
    escalateAfterPokes: number
    episodeFallback: boolean
  }
  enabled: boolean
}
```

`minimumReleaseAgeMinutes` uses the release date of the selected scope: the movie itself for movie rules, or the newest episode in the selected season or series for Sonarr rules.

### Queue item

```ts
type QueueItem = {
  id: string
  ruleId: number
  ruleName: string
  instanceId: number
  instanceName: string
  title: string
  kind: 'movie' | 'series' | 'season'
  monitored: boolean
  missing: boolean
  releaseDate: string | null
  nextRunAt: string | null
  itemUrl: string | null
  reason: string
  backoff: string
}
```

### Scan status

```ts
type ScanStatusResponse = {
  worker: {
    state: 'idle' | 'scanning' | 'rebuilding_queue'
    detailConcurrency: number
    detailBatchSize: number
    queueLength: number
    lastQueueRebuildAt: string | null
    lastQueueRebuildDurationMs: number | null
    lastError: string | null
    activeJob: {
      instanceId: number
      instanceName: string
      kind: 'full' | 'incremental'
      trigger: 'startup' | 'scheduled' | 'manual' | 'rule_change' | 'instance_change' | 'health_recovery' | 'stale_rule'
      queuedAt: string
      startedAt: string
      phase: string
      currentItem: string | null
      totalItems: number
      scannedItems: number
      updatedItems: number
      skippedItems: number
    } | null
  }
  instances: Array<{
    instanceId: number
    instanceName: string
    instanceKind: 'sonarr' | 'radarr'
    enabled: boolean
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
    snapshotState: 'empty' | 'warming' | 'ready' | 'stale'
  }>
  runs: Array<{
    id: number
    instanceId: number
    kind: 'full' | 'incremental'
    trigger: 'startup' | 'scheduled' | 'manual' | 'rule_change' | 'instance_change' | 'health_recovery' | 'stale_rule'
    status: 'completed' | 'failed'
    startedAt: string
    endedAt: string | null
    phase: string | null
    totalItems: number
    scannedItems: number
    updatedItems: number
    skippedItems: number
    summary: string
    error: string | null
  }>
  queueUpdatedAt: string | null
}
```

### Settings

```ts
type Settings = {
  backupRetentionDays: number
  backupSchedule: string
  notifications: {
    notificationUrl: string | null
    runSuccess: boolean
    runFailure: boolean
    backupSuccess: boolean
    backupFailure: boolean
    instanceConnectionLost: boolean
    instanceConnectionRestored: boolean
  }
}
```

`notifications.notificationUrl` accepts any Apprise-supported URL.

These settings are configured in the UI or API and stored in the app database. They are not read from environment variables.

## Environment Variables

Environment variables are reserved for server/runtime behavior. They do not override saved app settings such as backup retention, backup schedule, or notifications.

Most deployments only need `PORT` and `POKARR_DATA_DIR`.
If you want schedules to follow a specific local timezone, also set `TZ` to an IANA timezone name such as `Europe/Amsterdam`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Bun server port |
| `POKARR_DATA_DIR` | `data` | Data directory for SQLite and backups, resolved relative to the app root when not absolute |
| `TZ` | host default, container `UTC` | Server timezone used for cron schedules and other local-time evaluation |
| `POKARR_SESSION_TTL_DAYS` | `30` | Rolling session lifetime in days |
| `POKARR_COOKIE_SECURE` | `auto` | Whether to set the `Secure` cookie flag (`auto`, `true`, `false`) |
| `POKARR_SESSION_COOKIE_NAME` | `pokarr_session` | Optional session cookie name override |
| `POKARR_ARR_REQUEST_TIMEOUT_MS` | `15000` | Per-request timeout for Arr API calls |
| `POKARR_INSTANCE_RECOVERY_MS` | `60000` | Recovery pause after transport, proxy, or 5xx failures |
| `POKARR_INSTANCE_HEALTH_POLL_MS` | `60000` | Health-check polling interval |
| `POKARR_SCHEDULER_POLL_MS` | `30000` | Background scheduler poll interval |
| `POKARR_SCAN_CATALOG_INTERVAL_MS` | `900000` | Target age for refreshing cached Arr catalogs |
| `POKARR_SCAN_DETAIL_REFRESH_MS` | `7200000` | Target age for Sonarr series detail refreshes |
| `POKARR_SCAN_DETAIL_HARD_MAX_AGE_MS` | `86400000` | Maximum age tolerated before a rule run refuses stale Sonarr details |
| `POKARR_SCAN_CATALOG_HARD_MAX_AGE_MS` | `7200000` | Maximum age tolerated before queue evaluation or a rule run refuses a stale catalog |
| `POKARR_SCAN_SCHEDULER_POLL_MS` | `60000` | Delay before the worker revisits incremental scan backlog |
| `POKARR_SCAN_DETAIL_BATCH_SIZE` | `30` | Maximum stale Sonarr series refreshed per incremental scan |
| `POKARR_SCAN_DETAIL_CONCURRENCY` | `6` | Concurrent Sonarr series detail fetches within a scan job |
| `POKARR_RESTORE_IDLE_TIMEOUT_MS` | `30000` | Maximum wait for background work to drain before restore |
| `APP_VERSION` | derived | Application version shown in API state and container builds |

The backup schedule field in Settings uses a numeric five-field cron expression. When both day-of-month and day-of-week are restricted, it follows standard cron OR semantics.
That schedule runs in the server timezone. Set `TZ` if you want the app to follow a specific timezone such as `Europe/Amsterdam`.

`POKARR_COOKIE_SECURE=auto` enables `Secure` cookies when requests arrive over HTTPS, including the common reverse-proxy case where `X-Forwarded-Proto: https` is set.
