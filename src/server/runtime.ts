import { z } from 'zod'
import { Store } from './db'
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
import { didInstanceHealthStateChange, getInstanceHealthState } from './instanceHealth'
import { withNotificationConfig } from './notifications'
import { cronMatches, isValidCronExpression } from '@/shared/cron'
import {
  scanStatusResponseSchema,
  type ScanKind,
  type ScanStatusResponse,
  type ScanTrigger,
  type QueueIssue,
  type QueueItem
} from '@/shared/models'

export function createRuntime(store: Store) {
  function json(data: unknown, status = 200, headers?: HeadersInit) {
    return Response.json(data, {
      status,
      headers: {
        'cache-control': 'no-store',
        ...headers
      }
    })
  }

function buildArrUrl(baseUrl: string, pathname: string) {
  const normalizedOrigin = /^[a-z][a-z0-9+.-]*:\/\//i.test(baseUrl) ? baseUrl : `http://${baseUrl}`
  const normalizedBase = normalizedOrigin.endsWith('/') ? normalizedOrigin : `${normalizedOrigin}/`
  return new URL(pathname.replace(/^\//, ''), new URL(normalizedBase))
}

function parsePositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function formatDurationShort(ms: number) {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.ceil(minutes / 60)
  return `${hours}h`
}

function normalizeResponseSnippet(value: string, limit = 220) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return null
  }

  return compact.length <= limit ? compact : `${compact.slice(0, limit - 1)}...`
}

function withResponseSnippet(message: string, snippet: string | null) {
  return snippet ? `${message} Response snippet: ${snippet}` : message
}

function formatHttpStatus(status: number, statusText: string) {
  return statusText ? `${status} ${statusText}` : `${status}`
}

function parseVersionMajor(version: string) {
  const match = version.trim().match(/^(\d+)/)
  if (!match) {
    return null
  }

  const major = Number(match[1])
  return Number.isInteger(major) ? major : null
}

const arrRequestTimeoutMs = parsePositiveIntEnv('POKARR_ARR_REQUEST_TIMEOUT_MS', 15000)
const instanceRecoveryMs = parsePositiveIntEnv('POKARR_INSTANCE_RECOVERY_MS', 60000)
const scanCatalogIntervalMs = parsePositiveIntEnv('POKARR_SCAN_CATALOG_INTERVAL_MS', 15 * 60_000)
const scanDetailRefreshMs = parsePositiveIntEnv('POKARR_SCAN_DETAIL_REFRESH_MS', 2 * 60 * 60_000)
const scanDetailHardMaxAgeMs = parsePositiveIntEnv('POKARR_SCAN_DETAIL_HARD_MAX_AGE_MS', 24 * 60 * 60_000)
const scanCatalogHardMaxAgeMs = parsePositiveIntEnv('POKARR_SCAN_CATALOG_HARD_MAX_AGE_MS', 2 * 60 * 60_000)
const scanSchedulerPollMs = parsePositiveIntEnv('POKARR_SCAN_SCHEDULER_POLL_MS', 60_000)
const scanDetailBatchSize = parsePositiveIntEnv('POKARR_SCAN_DETAIL_BATCH_SIZE', 30)
const scanDetailConcurrency = parsePositiveIntEnv('POKARR_SCAN_DETAIL_CONCURRENCY', 6)
const recoveringInstances = new Map<number, { until: number; reason: string }>()
type ArrConnection = NonNullable<ReturnType<Store['getInstanceConnection']>>

const arrSystemStatusSchema = z
  .object({
    appName: z.string().optional(),
    version: z.string().optional()
  })
  .passthrough()

type ArrRequestErrorKind =
  | 'timeout'
  | 'network'
  | 'auth'
  | 'proxy'
  | 'compatibility'
  | 'parse'
  | 'http'
  | 'recovery'

class ArrRequestError extends Error {
  readonly kind: ArrRequestErrorKind
  readonly status: number | null
  readonly snippet: string | null

  constructor(
    kind: ArrRequestErrorKind,
    message: string,
    options?: {
      status?: number | null
      snippet?: string | null
    }
  ) {
    super(message)
    this.name = 'ArrRequestError'
    this.kind = kind
    this.status = options?.status ?? null
    this.snippet = options?.snippet ?? null
  }
}

function getActiveInstanceRecovery(instanceId: number) {
  const recovery = recoveringInstances.get(instanceId)
  if (!recovery) {
    return null
  }

  if (recovery.until <= Date.now()) {
    recoveringInstances.delete(instanceId)
    return null
  }

  return recovery
}

function scheduleInstanceRecovery(instanceId: number, reason: string) {
  recoveringInstances.set(instanceId, {
    until: Date.now() + instanceRecoveryMs,
    reason
  })
}

function shouldPauseInstanceAfterFailure(error: ArrRequestError) {
  if (error.kind === 'timeout' || error.kind === 'network' || error.kind === 'proxy') {
    return true
  }

  return error.kind === 'http' && error.status !== null && error.status >= 500
}

function shouldAbortRemainingDispatches(error: unknown) {
  if (!(error instanceof ArrRequestError)) {
    return false
  }

  if (
    error.kind === 'timeout' ||
    error.kind === 'network' ||
    error.kind === 'auth' ||
    error.kind === 'proxy' ||
    error.kind === 'compatibility' ||
    error.kind === 'parse' ||
    error.kind === 'recovery'
  ) {
    return true
  }

  return error.kind === 'http' && error.status !== null && (error.status === 401 || error.status === 403 || error.status >= 500)
}

async function validateNotificationUrl(notificationUrl: string | null) {
  const trimmed = notificationUrl?.trim() ?? ''
  if (!trimmed) {
    return
  }

  const apprisePath = Bun.which('apprise')
  if (!apprisePath) {
    throw new Error('Notification URL validation is unavailable because Apprise is not installed.')
  }


  await withNotificationConfig(trimmed, async (configPath) => {
    const process = Bun.spawn({
      cmd: [apprisePath, '--dry-run', '--config', configPath],
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const [exitCode, stderr] = await Promise.all([
      process.exited,
      process.stderr ? new Response(process.stderr).text() : Promise.resolve('')
    ])

    if (exitCode !== 0) {
      const detail = stderr.trim()
      if (detail.includes('Unsupported URL') || detail.includes('Unparseable URL')) {
        throw new Error('Enter a supported notification URL, such as a Discord webhook or another Apprise URL.')
      }

      throw new Error(detail || 'Notification URL validation failed.')
    }
  })
}

async function sendNotificationTest(notificationUrl: string | null) {
  const trimmed = notificationUrl?.trim() ?? ''
  if (!trimmed) {
    throw new Error('Enter a notification URL before sending a test.')
  }

  await validateNotificationUrl(trimmed)
  const message = buildNotificationTestMessage()

  const apprisePath = Bun.which('apprise')
  if (!apprisePath) {
    throw new Error('Notification testing is unavailable because Apprise is not installed.')
  }

  await withNotificationConfig(trimmed, async (configPath) => {
    const process = Bun.spawn({
      cmd: [apprisePath, '--config', configPath, '-t', message.title, '-b', message.body, '-n', message.level, '-i', 'markdown'],
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const [exitCode, stderr] = await Promise.all([
      process.exited,
      process.stderr ? new Response(process.stderr).text() : Promise.resolve('')
    ])

    if (exitCode !== 0) {
      throw new Error(stderr.trim() || 'Failed to send test notification.')
    }
  })
}

async function sendNotification(
  notificationUrl: string | null,
  input: {
    title: string
    body: string
    level?: 'info' | 'success' | 'warning' | 'failure'
  }
) {
  const trimmed = notificationUrl?.trim() ?? ''
  if (!trimmed) {
    return
  }

  const apprisePath = Bun.which('apprise')
  if (!apprisePath) {
    throw new Error('Notification sending is unavailable because Apprise is not installed.')
  }

  await withNotificationConfig(trimmed, async (configPath) => {
    const process = Bun.spawn({
      cmd: [apprisePath, '--config', configPath, '-t', input.title, '-b', input.body, '-n', input.level ?? 'info', '-i', 'markdown'],
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const [exitCode, stderr] = await Promise.all([
      process.exited,
      process.stderr ? new Response(process.stderr).text() : Promise.resolve('')
    ])

    if (exitCode !== 0) {
      throw new Error(stderr.trim() || 'Failed to send notification.')
    }
  })
}

async function updateInstanceHealthAndNotify(id: number, success: boolean, message?: string) {
  const previous = store.getInstances().find((item) => item.id === id) ?? null
  const updated = store.updateInstanceValidation(id, success, message)

  if (!previous || !updated) {
    return { instance: updated, changed: false }
  }

  const previousState = getInstanceHealthState(previous)
  const nextState = getInstanceHealthState(updated)
  const changed = didInstanceHealthStateChange(previous, updated)

  if (!changed) {
    return { instance: updated, changed }
  }

  const settings = store.getSettings()
  const shouldNotifyFailure =
    nextState === 'unhealthy' &&
    settings.notifications.instanceConnectionLost &&
    previousState !== 'unhealthy'
  const shouldNotifyRestore =
    previousState === 'unhealthy' &&
    nextState === 'healthy' &&
    settings.notifications.instanceConnectionRestored

  try {
    if (shouldNotifyFailure) {
      await sendNotification(
        settings.notifications.notificationUrl,
        buildInstanceHealthFailureNotification(updated, previousState, previous.lastError)
      )
    }

    if (shouldNotifyRestore) {
      await sendNotification(
        settings.notifications.notificationUrl,
        buildInstanceHealthRestoredNotification(updated, previous.lastError)
      )
    }
  } catch (notificationError) {
    console.error('failed to send instance health notification', notificationError)
  }

  return { instance: updated, changed }
}

async function markInstanceHealthyFromArrSuccess(instanceId: number) {
  const instance = store.getInstances().find((item) => item.id === instanceId)
  if (!instance) {
    return
  }

  recoveringInstances.delete(instanceId)
  if (!instance.lastError && instance.lastValidatedAt) {
    return
  }

  await updateInstanceHealthAndNotify(instanceId, true)
}

async function markInstanceUnhealthyFromArrFailure(instanceId: number, error: ArrRequestError) {
  const instance = store.getInstances().find((item) => item.id === instanceId)
  if (!instance || error.kind === 'recovery') {
    return
  }

  if (shouldPauseInstanceAfterFailure(error)) {
    scheduleInstanceRecovery(instanceId, error.message)
  }

  await updateInstanceHealthAndNotify(instanceId, false, error.message)
}

async function readResponseSnippet(response: Response) {
  try {
    return normalizeResponseSnippet(await response.text())
  } catch {
    return null
  }
}

async function createHttpRequestError(pathname: string, response: Response) {
  const snippet = await readResponseSnippet(response)
  const statusLabel = formatHttpStatus(response.status, response.statusText)

  if (response.status === 401 || response.status === 403) {
    return new ArrRequestError(
      'auth',
      withResponseSnippet(
        `Authentication failed while requesting ${pathname}. Check the API key and any reverse-proxy access rules.`,
        snippet
      ),
      {
        status: response.status,
        snippet
      }
    )
  }

  if (response.status === 404) {
    return new ArrRequestError(
      'compatibility',
      withResponseSnippet(
        `The instance responded, but ${pathname} was not found. The base URL may be wrong, a proxy may be rewriting the path, or the instance may not expose the v3 API Pokarr expects.`,
        snippet
      ),
      {
        status: response.status,
        snippet
      }
    )
  }

  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return new ArrRequestError(
      'proxy',
      withResponseSnippet(`The instance or its reverse proxy returned ${statusLabel} for ${pathname}.`, snippet),
      {
        status: response.status,
        snippet
      }
    )
  }

  if (response.status >= 500) {
    return new ArrRequestError(
      'http',
      withResponseSnippet(`The instance returned ${statusLabel} for ${pathname}.`, snippet),
      {
        status: response.status,
        snippet
      }
    )
  }

  return new ArrRequestError(
    'http',
    withResponseSnippet(`The instance rejected ${pathname} with ${statusLabel}.`, snippet),
    {
      status: response.status,
      snippet
    }
  )
}

function createParseRequestError(pathname: string, rawText: string) {
  const snippet = normalizeResponseSnippet(rawText)
  return new ArrRequestError(
    'parse',
    withResponseSnippet(`The instance returned a response Pokarr could not parse from ${pathname}.`, snippet),
    {
      snippet
    }
  )
}

function createCompatibilityRequestError(message: string, rawText?: string) {
  const snippet = normalizeResponseSnippet(rawText ?? '')
  return new ArrRequestError('compatibility', withResponseSnippet(message, snippet), {
    snippet
  })
}

function getExpectedInstanceServiceName(kind: ArrConnection['kind']) {
  return kind === 'sonarr' ? 'Sonarr' : 'Radarr'
}

async function fetchValidatedInstanceStatus(
  instance: ArrConnection,
  options?: {
    persistHealth?: boolean
    bypassRecovery?: boolean
  }
) {
  const persistHealth = options?.persistHealth ?? true
  const response = await requestArr(instance, '/api/v3/system/status', undefined, {
    persistHealth: false,
    bypassRecovery: options?.bypassRecovery,
    markHealthyOnSuccess: false
  })
  const rawText = await response.text()

  let payload: unknown
  try {
    payload = JSON.parse(rawText)
  } catch {
    const error = createParseRequestError('/api/v3/system/status', rawText)
    if (persistHealth) {
      await markInstanceUnhealthyFromArrFailure(instance.id, error)
    }
    throw error
  }

  const parsed = arrSystemStatusSchema.safeParse(payload)
  if (!parsed.success) {
    const error = createCompatibilityRequestError(
      'The instance responded, but the system status payload did not look like a supported Sonarr or Radarr API.',
      rawText
    )
    if (persistHealth) {
      await markInstanceUnhealthyFromArrFailure(instance.id, error)
    }
    throw error
  }

  const appName = parsed.data.appName?.trim() ?? ''
  const version = parsed.data.version?.trim() ?? ''
  const expectedName = getExpectedInstanceServiceName(instance.kind)

  if (!appName) {
    const error = createCompatibilityRequestError(
      `The instance responded, but it did not report an application name. Pokarr expected ${expectedName}.`,
      rawText
    )
    if (persistHealth) {
      await markInstanceUnhealthyFromArrFailure(instance.id, error)
    }
    throw error
  }

  if (!appName.toLowerCase().includes(instance.kind)) {
    const error = createCompatibilityRequestError(
      `Expected ${expectedName}, but the instance identified itself as ${appName}${version ? ` ${version}` : ''}.`,
      rawText
    )
    if (persistHealth) {
      await markInstanceUnhealthyFromArrFailure(instance.id, error)
    }
    throw error
  }

  if (!version) {
    const error = createCompatibilityRequestError(
      `The instance identified itself as ${appName}, but it did not report a version string that Pokarr can validate.`,
      rawText
    )
    if (persistHealth) {
      await markInstanceUnhealthyFromArrFailure(instance.id, error)
    }
    throw error
  }

  const major = parseVersionMajor(version)
  if (major === null) {
    const error = createCompatibilityRequestError(
      `${appName} reported an unrecognized version string (${version}). Pokarr could not confirm API compatibility.`,
      rawText
    )
    if (persistHealth) {
      await markInstanceUnhealthyFromArrFailure(instance.id, error)
    }
    throw error
  }

  if (major < 3) {
    const error = createCompatibilityRequestError(
      `${appName} ${version} is too old for the v3 API Pokarr expects.`,
      rawText
    )
    if (persistHealth) {
      await markInstanceUnhealthyFromArrFailure(instance.id, error)
    }
    throw error
  }

  if (persistHealth) {
    await markInstanceHealthyFromArrSuccess(instance.id)
  }

  return {
    appName,
    version,
    raw: parsed.data
  }
}

async function requestArr(
  instance: ArrConnection,
  pathname: string,
  init?: RequestInit,
  options?: {
    persistHealth?: boolean
    bypassRecovery?: boolean
    markHealthyOnSuccess?: boolean
  }
) {
  if (!instance) {
    throw new Error('Instance not found')
  }

  const persistHealth = options?.persistHealth ?? true
  const markHealthyOnSuccess = options?.markHealthyOnSuccess ?? true
  if (!options?.bypassRecovery) {
    const recovery = getActiveInstanceRecovery(instance.id)
    if (recovery) {
      const error = new ArrRequestError(
        'recovery',
        `Service is temporarily paused after a connection problem. Retrying in ${formatDurationShort(recovery.until - Date.now())}.`
      )
      if (persistHealth) {
        await markInstanceUnhealthyFromArrFailure(instance.id, error)
      }
      throw error
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), arrRequestTimeoutMs)

  try {
    const headers = new Headers(init?.headers)
    if (!headers.has('X-Api-Key')) {
      headers.set('X-Api-Key', instance.apiKey)
    }
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json')
    }

    const response = await fetch(buildArrUrl(instance.baseUrl, pathname), {
      ...init,
      headers,
      signal: controller.signal
    })

    if (!response.ok) {
      const error = await createHttpRequestError(pathname, response)
      if (persistHealth) {
        await markInstanceUnhealthyFromArrFailure(instance.id, error)
      }
      throw error
    }

    if (persistHealth && markHealthyOnSuccess) {
      await markInstanceHealthyFromArrSuccess(instance.id)
    }

    return response
  } catch (error) {
    if (error instanceof ArrRequestError) {
      throw error
    }

    const arrError =
      error instanceof Error && error.name === 'AbortError'
        ? new ArrRequestError(
            'timeout',
            `The request to ${pathname} timed out after ${formatDurationShort(arrRequestTimeoutMs)}.`
          )
        : new ArrRequestError(
            'network',
            error instanceof Error && error.message
              ? `Network error while requesting ${pathname}: ${error.message}`
              : `Network error while requesting ${pathname}.`
          )

    if (persistHealth) {
      await markInstanceUnhealthyFromArrFailure(instance.id, arrError)
    }

    throw arrError
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchArrJson<T>(instance: ArrConnection, pathname: string) {
  const response = await requestArr(instance, pathname, undefined, {
    markHealthyOnSuccess: false
  })
  const rawText = await response.text()

  try {
    const payload = JSON.parse(rawText) as T
    await markInstanceHealthyFromArrSuccess(instance.id)
    return payload
  } catch {
    const error = createParseRequestError(pathname, rawText)
    await markInstanceUnhealthyFromArrFailure(instance.id, error)
    throw error
  }
}

function parsePositiveInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseNonNegativeInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

async function fetchPagedArrRecords<T>(
  instance: ArrConnection,
  buildPathname: (page: number, pageSize: number) => string,
  pageSize = 5000
) {
  const records: T[] = []
  let page = 1

  while (true) {
    const payload = await fetchArrJson<{
      records?: T[]
      page?: number
      pageSize?: number
      totalRecords?: number
    }>(instance, buildPathname(page, pageSize))

    const pageRecords = Array.isArray(payload.records) ? payload.records : []
    records.push(...pageRecords)

    const reportedPage = parsePositiveInteger(payload.page) ?? page
    const reportedPageSize = parsePositiveInteger(payload.pageSize) ?? pageSize
    const totalRecords = parseNonNegativeInteger(payload.totalRecords)

    if (pageRecords.length === 0) {
      break
    }

    if (totalRecords !== null) {
      if (records.length >= totalRecords || reportedPage * reportedPageSize >= totalRecords) {
        break
      }
    } else if (pageRecords.length < reportedPageSize) {
      break
    }

    page += 1
  }

  return records
}

function getRuleTargetError(
  instanceKind: 'sonarr' | 'radarr',
  targetKind: 'movie' | 'series' | 'season'
) {
  if (instanceKind === 'radarr' && targetKind !== 'movie') {
    return 'Radarr rules must target movies.'
  }

  if (instanceKind === 'sonarr' && targetKind === 'movie') {
    return 'Sonarr rules must target series or seasons.'
  }

  return null
}

function getReleaseAgeMinutes(releaseDate: string | null) {
  if (!releaseDate) {
    return Number.POSITIVE_INFINITY
  }

  const parsed = new Date(releaseDate).getTime()
  if (Number.isNaN(parsed)) {
    return Number.POSITIVE_INFINITY
  }

  return Math.floor((Date.now() - parsed) / (60 * 1000))
}

function normalizeQualityName(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized || null
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

function truncateToMinute(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0
  )
}

function getLatestTimestamp(values: Array<string | null | undefined>) {
  let latest: string | null = null
  let latestTime: number | null = null

  for (const value of values) {
    const parsed = parseTimestamp(value)
    if (parsed === null) {
      continue
    }

    if (latestTime === null || parsed > latestTime) {
      latest = value ?? null
      latestTime = parsed
    }
  }

  return latest
}

function isCoolingDown(lastSearchAt: string | null, cooldownHours: number) {
  const lastSearchTime = parseTimestamp(lastSearchAt)
  if (lastSearchTime === null) {
    return false
  }

  const cooldownMs = cooldownHours * 60 * 60 * 1000
  return Date.now() - lastSearchTime < cooldownMs
}

function sortByOldestWaiting<T extends { lastPokedAt: string | null; releaseDate: string | null; title: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftSearch = parseTimestamp(left.lastPokedAt)
    const rightSearch = parseTimestamp(right.lastPokedAt)

    if (leftSearch === null && rightSearch !== null) {
      return -1
    }

    if (leftSearch !== null && rightSearch === null) {
      return 1
    }

    if (leftSearch !== null && rightSearch !== null && leftSearch !== rightSearch) {
      return leftSearch - rightSearch
    }

    const leftDate = left.releaseDate ? new Date(left.releaseDate).getTime() : Number.MAX_SAFE_INTEGER
    const rightDate = right.releaseDate ? new Date(right.releaseDate).getTime() : Number.MAX_SAFE_INTEGER

    if (leftDate !== rightDate) {
      return leftDate - rightDate
    }

    return left.title.localeCompare(right.title)
  })
}

type QualityRankingMap = Map<string, number>

type RadarrMovie = {
  id: number
  title: string
  monitored?: boolean
  hasFile?: boolean
  qualityProfileId?: number | null
  year?: number
  lastSearchTime?: string | null
  releaseDate?: string | null
  inCinemas?: string | null
  digitalRelease?: string | null
  physicalRelease?: string | null
  movieFile?: {
    quality?: {
      quality?: {
        name?: string
      }
    }
    customFormatScore?: number
  } | null
}

type SonarrSeriesSeason = {
  seasonNumber: number
  monitored?: boolean
  statistics?: {
    previousAiring?: string | null
    episodeFileCount?: number
    totalEpisodeCount?: number
    percentOfEpisodes?: number
  }
}

type SonarrSeries = {
  id: number
  title: string
  titleSlug?: string | null
  cleanTitle?: string | null
  monitored?: boolean
  qualityProfileId?: number | null
  firstAired?: string | null
  lastAired?: string | null
  previousAiring?: string | null
  statistics?: {
    episodeFileCount?: number
    totalEpisodeCount?: number
    percentOfEpisodes?: number
  }
  seasons?: SonarrSeriesSeason[]
}

type SonarrMissingEpisode = {
  id: number
  seriesId: number
  seasonNumber: number
  monitored?: boolean
  airDate?: string | null
  airDateUtc?: string | null
  series?: {
    title?: string
    monitored?: boolean
  }
}

type SonarrEpisode = {
  id: number
  seriesId: number
  seasonNumber: number
  episodeNumber: number
  title?: string
  monitored?: boolean
  airDate?: string | null
  airDateUtc?: string | null
  lastSearchTime?: string | null
  hasFile?: boolean
  episodeFileId?: number | null
}

type SonarrEpisodeFile = {
  id: number
  seriesId: number
  seasonNumber: number
  customFormatScore?: number | null
  quality?: {
    quality?: {
      name?: string | null
    } | null
  } | null
}

type QualityDefinition = {
  title?: string | null
  weight?: number | null
  quality?: {
    name?: string | null
  } | null
}

type QualityProfileItem = {
  allowed?: boolean
  quality?: {
    id?: number | null
    name?: string | null
  } | null
  items?: QualityProfileItem[]
}

type QualityProfile = {
  id: number
  name: string
  upgradeAllowed?: boolean
  cutoff?: number | null
  cutoffFormatScore?: number | null
  items?: QualityProfileItem[]
}

type ResolvedQualityProfile = {
  id: number
  name: string
  upgradeAllowed: boolean
  qualityTarget: string | null
  minimumCustomFormatScore: number | null
}

type SonarrSeriesDetails = {
  episodes: SonarrEpisode[]
  filesById: Map<number, SonarrEpisodeFile>
  seasonsByNumber: Map<number, SonarrSeriesSeason>
}

type SonarrSeriesScanPayload = {
  episodes: SonarrEpisode[]
  files: SonarrEpisodeFile[]
}

type RadarrScanCatalog = {
  kind: 'radarr'
  movies: RadarrMovie[]
  qualityDefinitions: QualityDefinition[]
  qualityProfiles: QualityProfile[]
}

type SonarrScanCatalog = {
  kind: 'sonarr'
  series: SonarrSeries[]
  missingEpisodes: SonarrMissingEpisode[]
  qualityDefinitions: QualityDefinition[]
  qualityProfiles: QualityProfile[]
}

type InstanceScanCatalog = RadarrScanCatalog | SonarrScanCatalog

type CachedSeriesDetailsRecord = {
  key: string
  title: string
  lastScannedAt: string
  details: SonarrSeriesDetails
}

type ScanJob = {
  instanceId: number
  kind: ScanKind
  trigger: ScanTrigger
  queuedAt: string
}

type ActiveScanJobState = ScanJob & {
  startedAt: string
  phase: string
  currentItem: string | null
  totalItems: number
  scannedItems: number
  updatedItems: number
  skippedItems: number
}

type DispatchInstruction =
  | {
      kind: 'movie'
      movieIds: number[]
    }
  | {
      kind: 'series'
      seriesId: number
    }
  | {
      kind: 'season'
      seriesId: number
      seasonNumber: number
    }
  | {
      kind: 'episode'
      episodeIds: number[]
    }

type QueueCandidate = {
  id: string
  ruleId: number
  ruleName: string
  instanceId: number
  instanceName: string
  entityKey: string
  title: string
  kind: 'movie' | 'series' | 'season'
  monitored: boolean
  missing: boolean
  releaseDate: string | null
  lastPokedAt: string | null
  itemUrl: string | null
  reason: string
  backoff: string
  signature: string
  dispatch: DispatchInstruction
}

async function fetchSonarrMissingEpisodes(instance: NonNullable<ReturnType<Store['getInstanceConnection']>>) {
  return fetchPagedArrRecords<SonarrMissingEpisode>(
    instance,
    (page, pageSize) =>
      `/api/v3/wanted/missing?page=${page}&pageSize=${pageSize}&sortKey=airDateUtc&sortDirection=ascending&includeSeries=true`
  )
}

function buildQualityCatalogEntries(definitions: QualityDefinition[]) {
  const unique = new Map<string, { label: string; weight: number }>()

  for (const definition of definitions) {
    const label = (definition.quality?.name ?? definition.title ?? '').trim()
    if (!label || label.toLowerCase() === 'unknown') {
      continue
    }

    const weight = Number(definition.weight ?? Number.MAX_SAFE_INTEGER)
    const existing = unique.get(label)
    if (!existing || weight < existing.weight) {
      unique.set(label, { label, weight })
    }
  }

  return [...unique.values()]
    .sort((left, right) => {
      if (left.weight !== right.weight) {
        return left.weight - right.weight
      }

      return left.label.localeCompare(right.label)
    })
}

async function fetchQualityCatalog(instance: NonNullable<ReturnType<Store['getInstanceConnection']>>) {
  return buildQualityCatalogEntries(await fetchArrJson<QualityDefinition[]>(instance, '/api/v3/qualitydefinition'))
}

async function fetchQualityOptions(instance: NonNullable<ReturnType<Store['getInstanceConnection']>>) {
  return (await fetchQualityCatalog(instance)).map((entry) => entry.label)
}

function buildQualityRankings(definitions: QualityDefinition[]) {
  return new Map(
    buildQualityCatalogEntries(definitions)
      .map((entry): [string, number] | null => {
        const normalized = normalizeQualityName(entry.label)
        return normalized ? [normalized, entry.weight] : null
      })
      .filter((entry): entry is [string, number] => entry !== null)
  )
}

function meetsQualityTarget(
  currentQuality: string | null | undefined,
  targetQuality: string | null | undefined,
  qualityRankings: QualityRankingMap | null
) {
  const normalizedCurrent = normalizeQualityName(currentQuality)
  const normalizedTarget = normalizeQualityName(targetQuality)

  if (!normalizedCurrent || !normalizedTarget) {
    return false
  }

  if (!qualityRankings) {
    return normalizedCurrent === normalizedTarget
  }

  const currentWeight = qualityRankings.get(normalizedCurrent)
  const targetWeight = qualityRankings.get(normalizedTarget)

  if (currentWeight == null || targetWeight == null) {
    return normalizedCurrent === normalizedTarget
  }

  return currentWeight >= targetWeight
}

function collectAllowedQualityProfileQualities(
  items: QualityProfileItem[] | undefined,
  resolved = new Map<number, string>()
) {
  for (const item of items ?? []) {
    if (item.allowed === false) {
      continue
    }

    const qualityId = item.quality?.id
    const qualityName = item.quality?.name?.trim()
    if (qualityId != null && qualityName) {
      resolved.set(qualityId, qualityName)
    }

    if (item.items?.length) {
      collectAllowedQualityProfileQualities(item.items, resolved)
    }
  }

  return resolved
}

function buildQualityProfiles(profiles: QualityProfile[]) {
  return new Map(
    profiles.map((profile): [number, ResolvedQualityProfile] => {
      const qualitiesById = collectAllowedQualityProfileQualities(profile.items)
      const qualityTarget = profile.cutoff != null ? qualitiesById.get(profile.cutoff) ?? null : null
      const cutoffFormatScore = Number(profile.cutoffFormatScore)

      return [
        profile.id,
        {
          id: profile.id,
          name: profile.name,
          upgradeAllowed: profile.upgradeAllowed !== false,
          qualityTarget,
          minimumCustomFormatScore: Number.isFinite(cutoffFormatScore) ? cutoffFormatScore : null
        }
      ]
    })
  )
}

type EffectiveTargets = {
  qualityTarget: string | null
  minimumCustomFormatScore: number | null
  useProfileTargets: boolean
  profileName: string | null
  upgradesAllowed: boolean
}

function getEffectiveTargets(
  rule: ReturnType<Store['getRules']>[number],
  profile: ResolvedQualityProfile | null
): EffectiveTargets {
  if (!rule.scope.useProfileTargets) {
    return {
      qualityTarget: rule.scope.minimumQuality,
      minimumCustomFormatScore: rule.scope.minimumCustomFormatScore,
      useProfileTargets: false,
      profileName: null,
      upgradesAllowed: true
    }
  }

  return {
    qualityTarget: profile?.qualityTarget ?? null,
    minimumCustomFormatScore: profile?.minimumCustomFormatScore ?? null,
    useProfileTargets: true,
    profileName: profile?.name ?? null,
    upgradesAllowed: profile?.upgradeAllowed ?? true
  }
}

function buildSonarrReason(
  totalEpisodes: number,
  missingCount: number,
  belowQualityCount: number,
  belowScoreCount: number,
  targets: EffectiveTargets
) {
  if (missingCount > 0) {
    return `Missing ${missingCount} out of ${totalEpisodes} episodes`
  }

  if (belowQualityCount > 0 && belowScoreCount > 0) {
    return targets.useProfileTargets
      ? `${belowQualityCount + belowScoreCount} out of ${totalEpisodes} episodes are below the profile target`
      : `${belowQualityCount + belowScoreCount} out of ${totalEpisodes} episodes are below the quality or format target`
  }

  if (belowQualityCount > 0 && targets.qualityTarget) {
    return targets.useProfileTargets
      ? `${belowQualityCount} out of ${totalEpisodes} episodes are below the profile target (${targets.qualityTarget})`
      : `${belowQualityCount} out of ${totalEpisodes} episodes are below ${targets.qualityTarget}`
  }

  if (belowScoreCount > 0 && targets.minimumCustomFormatScore !== null) {
    return targets.useProfileTargets
      ? `${belowScoreCount} out of ${totalEpisodes} episodes are below the profile format target (${targets.minimumCustomFormatScore})`
      : `${belowScoreCount} out of ${totalEpisodes} episodes are below score ${targets.minimumCustomFormatScore}`
  }

  return 'Needs another search'
}

function getSonarrScopeReleaseDate(episodes: SonarrEpisode[]) {
  return getLatestTimestamp(
    episodes.map((episode) => episode.airDateUtc ?? episode.airDate ?? null)
  )
}

function evaluateSonarrEpisodes(
  episodes: SonarrEpisode[],
  filesById: Map<number, SonarrEpisodeFile>,
  rule: ReturnType<Store['getRules']>[number],
  targets: EffectiveTargets,
  qualityRankings: QualityRankingMap | null
) {
  const totalEpisodes = episodes.length
  const actionableEpisodes: SonarrEpisode[] = []
  let missingCount = 0
  let belowQualityCount = 0
  let belowScoreCount = 0

  for (const episode of episodes) {
    const missing = !episode.hasFile
    const file =
      episode.episodeFileId != null
        ? filesById.get(episode.episodeFileId) ?? null
        : null
    const currentQuality = file?.quality?.quality?.name ?? null
    const currentScore = Number(file?.customFormatScore ?? 0)
    const belowQuality =
      !missing &&
      targets.upgradesAllowed &&
      Boolean(targets.qualityTarget) &&
      !meetsQualityTarget(currentQuality, targets.qualityTarget, qualityRankings)
    const belowScore =
      !missing &&
      targets.upgradesAllowed &&
      targets.minimumCustomFormatScore !== null &&
      currentScore < targets.minimumCustomFormatScore
    const actionable = rule.scope.missingOnly ? missing : missing || belowQuality || belowScore

    if (!actionable) {
      continue
    }

    actionableEpisodes.push(episode)

    if (missing) {
      missingCount += 1
      continue
    }

    if (belowQuality) {
      belowQualityCount += 1
    }

    if (belowScore) {
      belowScoreCount += 1
    }
  }

  if (actionableEpisodes.length === 0) {
    return null
  }

  const signature = JSON.stringify({
    episodeIds: actionableEpisodes.map((episode) => episode.id).sort((left, right) => left - right),
    missingCount,
    belowQualityCount,
    belowScoreCount,
    qualityTarget: targets.qualityTarget,
    minimumCustomFormatScore: targets.minimumCustomFormatScore,
    useProfileTargets: targets.useProfileTargets,
    profileName: targets.profileName,
    upgradesAllowed: targets.upgradesAllowed
  })

  return {
    actionableEpisodes,
    missing: missingCount > 0,
    reason: buildSonarrReason(
      totalEpisodes,
      missingCount,
      belowQualityCount,
      belowScoreCount,
      targets
    ),
    signature
  }
}

function buildServiceItemUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl.replace(/\/+$/, '')}/`).toString()
}

function buildSonarrSeriesUrl(
  baseUrl: string,
  series: Pick<SonarrSeries, 'id' | 'titleSlug' | 'cleanTitle'>
) {
  const slug = series.titleSlug?.trim() || series.cleanTitle?.trim() || String(series.id)
  return buildServiceItemUrl(baseUrl, `/series/${slug}`)
}

function getQueueIssueMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Queue data could not be loaded.'
  }

  const message = error.message.trim()
  if (!message) {
    return 'Queue data could not be loaded.'
  }

  if (message === 'Instance not found') {
    return 'The configured instance could not be found.'
  }

  if (message.startsWith('Service request failed with status ')) {
    return `The service returned ${message.replace('Service request failed with status ', 'status ')} while loading queue data.`
  }

  return message
}

function createQueueIssue(
  rule: ReturnType<Store['getRules']>[number],
  instance: ReturnType<Store['getInstanceConnection']> | null,
  message: string
): QueueIssue {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    instanceId: rule.instanceId,
    instanceName: instance?.name ?? 'Unknown instance',
    message
  }
}

function addMinutesToIso(base: string | null, minutes: number) {
  const parsed = parseTimestamp(base)
  if (parsed === null) {
    return null
  }

  return new Date(parsed + minutes * 60_000).toISOString()
}

function toQueueItem(candidate: QueueCandidate, nextRunAt: string | null): QueueItem {
  return {
    id: candidate.id,
    ruleId: candidate.ruleId,
    ruleName: candidate.ruleName,
    instanceId: candidate.instanceId,
    instanceName: candidate.instanceName,
    title: candidate.title,
    kind: candidate.kind,
    monitored: candidate.monitored,
    missing: candidate.missing,
    releaseDate: candidate.releaseDate,
    nextRunAt,
    itemUrl: candidate.itemUrl,
    reason: candidate.reason,
    backoff: candidate.backoff
  }
}

function compareQueueItems(left: QueueItem, right: QueueItem) {
  const leftRun = parseTimestamp(left.nextRunAt) ?? Number.MAX_SAFE_INTEGER
  const rightRun = parseTimestamp(right.nextRunAt) ?? Number.MAX_SAFE_INTEGER
  if (leftRun !== rightRun) {
    return leftRun - rightRun
  }

  if (left.instanceName !== right.instanceName) {
    return left.instanceName.localeCompare(right.instanceName)
  }

  if (left.ruleName !== right.ruleName) {
    return left.ruleName.localeCompare(right.ruleName)
  }

  return left.title.localeCompare(right.title)
}

function getTimestampAgeMs(value: string | null | undefined) {
  const parsed = parseTimestamp(value)
  if (parsed === null) {
    return null
  }

  return Math.max(0, Date.now() - parsed)
}

function isTimestampOlderThan(value: string | null | undefined, maxAgeMs: number) {
  const age = getTimestampAgeMs(value)
  return age === null || age > maxAgeMs
}

function getEmptyInstanceScanState(instanceId: number) {
  return (
    store.getInstanceScanState(instanceId) ?? {
      instanceId,
      catalogUpdatedAt: null,
      lastScanAt: null,
      lastSuccessfulScanAt: null,
      lastFullScanAt: null,
      lastIncrementalScanAt: null,
      nextScanAt: null,
      lastError: null,
      eligibleEntityCount: 0,
      cachedEntityCount: 0,
      pendingEntityCount: 0,
      staleEntityCount: 0,
      updatedAt: new Date(0).toISOString()
    }
  )
}

function parseStoredScanCatalog(instanceId: number): InstanceScanCatalog | null {
  const record = store.getInstanceScanCatalog(instanceId)
  if (!record) {
    return null
  }

  return record.catalog as InstanceScanCatalog
}

function buildSonarrSeriesDetailsFromPayload(payload: SonarrSeriesScanPayload): SonarrSeriesDetails {
  return {
    episodes: payload.episodes,
    filesById: new Map(payload.files.map((file) => [file.id, file])),
    seasonsByNumber: new Map()
  }
}

function toCachedSeriesDetailsRecord(entry: ReturnType<Store['getInstanceScanEntities']>[number]): CachedSeriesDetailsRecord {
  const payload = entry.payload as SonarrSeriesScanPayload
  return {
    key: entry.entityKey,
    title: entry.title,
    lastScannedAt: entry.lastScannedAt,
    details: buildSonarrSeriesDetailsFromPayload(payload)
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<void>
) {
  if (items.length === 0) {
    return
  }

  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex
        nextIndex += 1
        if (currentIndex >= items.length) {
          return
        }

        await handler(items[currentIndex]!, currentIndex)
      }
    })
  )
}

function buildDesiredSonarrSeriesIds(
  instanceId: number,
  catalog: SonarrScanCatalog,
  options?: {
    full?: boolean
  }
) {
  if (options?.full) {
    return catalog.series
      .map((series) => series.id)
      .filter((seriesId) => Number.isInteger(seriesId))
  }

  const rules = store
    .getRules()
    .filter(
      (rule) =>
        rule.enabled &&
        rule.instanceId === instanceId &&
        (rule.targetKind === 'series' || rule.targetKind === 'season')
    )

  if (rules.length === 0) {
    return []
  }

  const missingSeriesIds = new Set(
    catalog.missingEpisodes
      .filter((episode) => episode.seasonNumber > 0)
      .map((episode) => episode.seriesId)
  )
  const needsUpgradeChecks = rules.some(
    (rule) =>
      !rule.scope.missingOnly &&
      (rule.scope.useProfileTargets ||
        Boolean(rule.scope.minimumQuality) ||
        rule.scope.minimumCustomFormatScore !== null)
  )

  return catalog.series
    .filter((series) => {
      if (missingSeriesIds.has(series.id)) {
        return true
      }

      if (!needsUpgradeChecks) {
        return false
      }

      return (
        Number(series.statistics?.episodeFileCount ?? 0) > 0 ||
        (series.seasons ?? []).some(
          (season) => season.seasonNumber > 0 && Number(season.statistics?.episodeFileCount ?? 0) > 0
        )
      )
    })
    .map((series) => series.id)
}

function buildScanCoverageMessage(parts: {
  missingCatalog: boolean
  missingEntities: number
  staleEntities: number
  catalogUpdatedAt: string | null
}) {
  if (parts.missingCatalog) {
    return 'A scan is required before this rule can evaluate items.'
  }

  const notes: string[] = []
  if (parts.missingEntities > 0) {
    notes.push(
      `${parts.missingEntities} ${parts.missingEntities === 1 ? 'item is' : 'items are'} still waiting for detail scans`
    )
  }
  if (parts.staleEntities > 0) {
    notes.push(
      `${parts.staleEntities} ${parts.staleEntities === 1 ? 'item is' : 'items are'} using stale cached details`
    )
  }
  if (notes.length === 0) {
    return null
  }

  const suffix = parts.catalogUpdatedAt ? ` Latest catalog refresh: ${parts.catalogUpdatedAt}.` : ''
  return `${notes.join('. ')}.${suffix}`
}

function getPreferredScanKind(state: ReturnType<typeof getEmptyInstanceScanState>): ScanKind {
  return state.lastFullScanAt ? 'incremental' : 'full'
}

function summarizeQueueCoverageIssue(
  rule: ReturnType<Store['getRules']>[number],
  instance: NonNullable<ReturnType<Store['getInstanceConnection']>>,
  message: string | null
) {
  if (!message) {
    return [] as QueueIssue[]
  }

  return [createQueueIssue(rule, instance, message)]
}

function evaluateRuleCandidatesFromSnapshot(
  rule: ReturnType<Store['getRules']>[number],
  instance: NonNullable<ReturnType<Store['getInstanceConnection']>>,
  mode: 'queue' | 'run'
) {
  const state = getEmptyInstanceScanState(instance.id)
  const requestTrigger: ScanTrigger = mode === 'run' ? 'stale_rule' : 'scheduled'
  const catalog = parseStoredScanCatalog(instance.id)

  if (!catalog) {
    return {
      candidates: [] as QueueCandidate[],
      issues: summarizeQueueCoverageIssue(
        rule,
        instance,
        buildScanCoverageMessage({
          missingCatalog: true,
          missingEntities: 0,
          staleEntities: 0,
          catalogUpdatedAt: null
        })
      ),
      blocking: true,
      requestScan: {
        kind: getPreferredScanKind(state),
        trigger: requestTrigger
      }
    }
  }

  const catalogIsHardStale = isTimestampOlderThan(catalog.kind === 'radarr' ? state.catalogUpdatedAt : state.catalogUpdatedAt, scanCatalogHardMaxAgeMs)
  const catalogIsBackgroundStale = isTimestampOlderThan(state.catalogUpdatedAt, scanCatalogIntervalMs)

  if (instance.kind === 'radarr' && rule.targetKind === 'movie' && catalog.kind === 'radarr') {
    const qualityRankings =
      rule.scope.minimumQuality || rule.scope.useProfileTargets
        ? buildQualityRankings(catalog.qualityDefinitions)
        : null
    const qualityProfiles = rule.scope.useProfileTargets ? buildQualityProfiles(catalog.qualityProfiles) : null
    const states = new Map(store.getRuleEntityStates(rule.id).map((entry) => [entry.entityKey, entry]))

    const candidates = sortByOldestWaiting(
      catalog.movies
        .map((movie): QueueCandidate | null => {
          const monitored = Boolean(movie.monitored)
          if (rule.guards.monitoredOnly && !monitored) {
            return null
          }

          const missing = !movie.hasFile
          if (rule.scope.missingOnly && !missing) {
            return null
          }

          const releaseDate =
            movie.releaseDate ??
            movie.physicalRelease ??
            movie.digitalRelease ??
            movie.inCinemas ??
            null

          if (getReleaseAgeMinutes(releaseDate) < rule.guards.minimumReleaseAgeMinutes) {
            return null
          }

          const currentScore = Number(movie.movieFile?.customFormatScore ?? 0)
          const currentQuality = movie.movieFile?.quality?.quality?.name ?? null
          const targets = getEffectiveTargets(
            rule,
            qualityProfiles?.get(movie.qualityProfileId ?? -1) ?? null
          )
          const belowQuality =
            !missing &&
            targets.upgradesAllowed &&
            Boolean(targets.qualityTarget) &&
            !meetsQualityTarget(currentQuality, targets.qualityTarget, qualityRankings)
          const belowScore =
            !missing &&
            targets.upgradesAllowed &&
            targets.minimumCustomFormatScore !== null &&
            currentScore < targets.minimumCustomFormatScore

          if (!rule.scope.missingOnly && !missing && !belowQuality && !belowScore) {
            return null
          }

          const entityKey = String(movie.id)
          const existingState = states.get(entityKey)

          return {
            id: `${rule.id}:movie:${movie.id}`,
            ruleId: rule.id,
            ruleName: rule.name,
            instanceId: instance.id,
            instanceName: instance.name,
            entityKey,
            title: movie.title,
            kind: 'movie',
            monitored,
            missing,
            releaseDate,
            lastPokedAt: existingState?.lastPokedAt ?? null,
            itemUrl: buildServiceItemUrl(instance.baseUrl, `/movie/${movie.id}`),
            reason: missing
              ? 'Missing movie'
              : belowQuality && belowScore
                ? targets.useProfileTargets
                  ? 'Below the profile target'
                  : 'Below the quality target or format score'
                : belowQuality
                  ? targets.useProfileTargets
                    ? `Below the profile target (${targets.qualityTarget})`
                    : `Below ${targets.qualityTarget}`
                  : targets.useProfileTargets
                    ? `Below the profile format target (${targets.minimumCustomFormatScore})`
                    : `Below score ${targets.minimumCustomFormatScore}`,
            backoff: 'None',
            signature: JSON.stringify({
              missing,
              currentQuality,
              currentScore,
              qualityTarget: targets.qualityTarget,
              minimumCustomFormatScore: targets.minimumCustomFormatScore,
              useProfileTargets: targets.useProfileTargets,
              profileName: targets.profileName,
              upgradesAllowed: targets.upgradesAllowed
            }),
            dispatch: {
              kind: 'movie',
              movieIds: [movie.id]
            }
          }
        })
        .filter((movie): movie is QueueCandidate => movie !== null)
        .filter((movie) => !isCoolingDown(movie.lastPokedAt, rule.cooldownHours))
    )

    return {
      candidates,
      issues: catalogIsBackgroundStale
        ? summarizeQueueCoverageIssue(
            rule,
            instance,
            'The cached catalog is stale. A background refresh has been queued.'
          )
        : [],
      blocking: catalogIsHardStale,
      requestScan: catalogIsBackgroundStale || catalogIsHardStale
        ? {
            kind: getPreferredScanKind(state),
            trigger: requestTrigger
          }
        : null
    }
  }

  if (instance.kind === 'sonarr' && (rule.targetKind === 'series' || rule.targetKind === 'season') && catalog.kind === 'sonarr') {
    const seriesById = new Map(catalog.series.map((series) => [series.id, series]))
    const relevantSeriesIds = buildDesiredSonarrSeriesIds(instance.id, catalog)
    const detailEntries = store.getInstanceScanEntities(
      instance.id,
      relevantSeriesIds.map((seriesId) => String(seriesId))
    )
    const detailsBySeriesId = new Map<number, CachedSeriesDetailsRecord>(
      detailEntries.map((entry) => [Number(entry.entityKey), toCachedSeriesDetailsRecord(entry)])
    )
    const issues: QueueIssue[] = []
    const missingDetailCount = relevantSeriesIds.filter((seriesId) => !detailsBySeriesId.has(seriesId)).length
    const staleDetailCount = relevantSeriesIds.filter((seriesId) => {
      const record = detailsBySeriesId.get(seriesId)
      return record ? isTimestampOlderThan(record.lastScannedAt, scanDetailRefreshMs) : false
    }).length
    const hardStaleDetailCount = relevantSeriesIds.filter((seriesId) => {
      const record = detailsBySeriesId.get(seriesId)
      return record ? isTimestampOlderThan(record.lastScannedAt, scanDetailHardMaxAgeMs) : false
    }).length
    const qualityRankings =
      rule.scope.minimumQuality || rule.scope.useProfileTargets
        ? buildQualityRankings(catalog.qualityDefinitions)
        : null
    const qualityProfiles = rule.scope.useProfileTargets ? buildQualityProfiles(catalog.qualityProfiles) : null
    const states = new Map(store.getRuleEntityStates(rule.id).map((entry) => [entry.entityKey, entry]))

    if (missingDetailCount > 0 || staleDetailCount > 0 || catalogIsBackgroundStale) {
      issues.push(
        ...summarizeQueueCoverageIssue(
          rule,
          instance,
          buildScanCoverageMessage({
            missingCatalog: false,
            missingEntities: missingDetailCount,
            staleEntities: staleDetailCount + (catalogIsBackgroundStale ? 1 : 0),
            catalogUpdatedAt: state.catalogUpdatedAt
          })
        )
      )
    }

    if (rule.targetKind === 'series') {
      const candidates = sortByOldestWaiting(
        relevantSeriesIds
          .map((seriesId): QueueCandidate | null => {
            const series = seriesById.get(seriesId)
            const detailRecord = detailsBySeriesId.get(seriesId)
            if (!series || !detailRecord) {
              return null
            }

            const monitored = Boolean(series.monitored)
            if (rule.guards.monitoredOnly && !monitored) {
              return null
            }

            const episodes = detailRecord.details.episodes.filter(
              (episode) => episode.seasonNumber > 0 && (!rule.guards.monitoredOnly || Boolean(episode.monitored))
            )
            const targets = getEffectiveTargets(
              rule,
              qualityProfiles?.get(series.qualityProfileId ?? -1) ?? null
            )
            const summary = evaluateSonarrEpisodes(
              episodes,
              detailRecord.details.filesById,
              rule,
              targets,
              qualityRankings
            )
            if (!summary) {
              return null
            }

            const releaseDate =
              getSonarrScopeReleaseDate(episodes) ??
              series.lastAired ??
              series.previousAiring ??
              series.firstAired ??
              null
            if (getReleaseAgeMinutes(releaseDate) < rule.guards.minimumReleaseAgeMinutes) {
              return null
            }

            const entityKey = String(series.id)
            const existingState = states.get(entityKey)

            return {
              id: `${rule.id}:series:${series.id}`,
              ruleId: rule.id,
              ruleName: rule.name,
              instanceId: instance.id,
              instanceName: instance.name,
              entityKey,
              title: series.title,
              kind: 'series',
              monitored,
              missing: summary.missing,
              releaseDate,
              lastPokedAt: existingState?.lastPokedAt ?? null,
              itemUrl: buildSonarrSeriesUrl(instance.baseUrl, series),
              reason: summary.reason,
              backoff: 'None',
              signature: summary.signature,
              dispatch: {
                kind: 'series',
                seriesId: series.id
              }
            }
          })
          .filter((series): series is QueueCandidate => series !== null)
          .filter((series) => !isCoolingDown(series.lastPokedAt, rule.cooldownHours))
      )

      return {
        candidates,
        issues,
        blocking: catalogIsHardStale || missingDetailCount > 0 || hardStaleDetailCount > 0,
        requestScan:
          catalogIsBackgroundStale || catalogIsHardStale || missingDetailCount > 0 || staleDetailCount > 0
            ? {
                kind: getPreferredScanKind(state),
                trigger: requestTrigger
              }
            : null
      }
    }

    const candidates = sortByOldestWaiting(
      relevantSeriesIds
        .flatMap((seriesId) => {
          const series = seriesById.get(seriesId)
          const detailRecord = detailsBySeriesId.get(seriesId)
          if (!series || !detailRecord) {
            return [] as QueueCandidate[]
          }

          const seasonNumbers = new Set(
            detailRecord.details.episodes
              .filter((episode) => episode.seasonNumber > 0)
              .map((episode) => episode.seasonNumber)
          )

          return [...seasonNumbers]
            .map((seasonNumber): QueueCandidate | null => {
              const season = (series.seasons ?? []).find((entry) => entry.seasonNumber === seasonNumber)
              const monitored = Boolean(season?.monitored ?? series.monitored)
              if (rule.guards.monitoredOnly && !monitored) {
                return null
              }

              const episodes = detailRecord.details.episodes.filter(
                (episode) =>
                  episode.seasonNumber === seasonNumber &&
                  (!rule.guards.monitoredOnly || Boolean(episode.monitored))
              )
              const targets = getEffectiveTargets(
                rule,
                qualityProfiles?.get(series.qualityProfileId ?? -1) ?? null
              )
              const summary = evaluateSonarrEpisodes(
                episodes,
                detailRecord.details.filesById,
                rule,
                targets,
                qualityRankings
              )
              if (!summary) {
                return null
              }

              const releaseDate =
                getSonarrScopeReleaseDate(episodes) ??
                season?.statistics?.previousAiring ??
                series.previousAiring ??
                series.lastAired ??
                series.firstAired ??
                null

              if (getReleaseAgeMinutes(releaseDate) < rule.guards.minimumReleaseAgeMinutes) {
                return null
              }

              const entityKey = `${series.id}:${seasonNumber}`
              const existingState = states.get(entityKey)
              const consecutivePokes =
                rule.backoff.enabled && rule.backoff.episodeFallback && existingState?.lastSignature === summary.signature
                  ? existingState.consecutivePokes
                  : 0
              const backoffActive =
                rule.backoff.enabled &&
                rule.backoff.episodeFallback &&
                consecutivePokes >= rule.backoff.escalateAfterPokes

              return {
                id: `${rule.id}:season:${series.id}:${seasonNumber}`,
                ruleId: rule.id,
                ruleName: rule.name,
                instanceId: instance.id,
                instanceName: instance.name,
                entityKey,
                title: `${series.title} · Season ${seasonNumber}`,
                kind: 'season',
                monitored,
                missing: summary.missing,
                releaseDate,
                lastPokedAt: existingState?.lastPokedAt ?? null,
                itemUrl: buildSonarrSeriesUrl(instance.baseUrl, series),
                reason: summary.reason,
                backoff: backoffActive
                  ? `Episode fallback active after ${consecutivePokes} season pokes`
                  : rule.backoff.enabled && rule.backoff.episodeFallback
                    ? `Season search (${consecutivePokes}/${rule.backoff.escalateAfterPokes})`
                    : 'None',
                signature: summary.signature,
                dispatch: backoffActive
                  ? {
                      kind: 'episode',
                      episodeIds: summary.actionableEpisodes.map((episode) => episode.id)
                    }
                  : {
                      kind: 'season',
                      seriesId: series.id,
                      seasonNumber
                    }
              }
            })
            .filter((season): season is QueueCandidate => season !== null)
        })
        .filter((season) => !isCoolingDown(season.lastPokedAt, rule.cooldownHours))
    )

    return {
      candidates,
      issues,
      blocking: catalogIsHardStale || missingDetailCount > 0 || hardStaleDetailCount > 0,
      requestScan:
        catalogIsBackgroundStale || catalogIsHardStale || missingDetailCount > 0 || staleDetailCount > 0
          ? {
              kind: getPreferredScanKind(state),
              trigger: requestTrigger
            }
          : null
    }
  }

  return {
    candidates: [] as QueueCandidate[],
    issues: [createQueueIssue(rule, instance, 'This rule target is not supported by the selected service.')],
    blocking: false,
    requestScan: null
  }
}

function materializeQueueItemsForRule(
  rule: ReturnType<Store['getRules']>[number],
  candidates: QueueCandidate[]
) {
  return candidates.map((candidate, index) => {
    const slotIndex = Math.floor(index / rule.batchSize)
    const nextRunAt = addMinutesToIso(rule.nextRunAt, slotIndex * rule.cadenceMinutes)
    return toQueueItem(candidate, nextRunAt)
  })
}

async function buildQueueSnapshot() {
  const items: QueueItem[] = []
  const issues: QueueIssue[] = []
  const rules = store.getRules().filter((rule) => rule.enabled)

  for (const rule of rules) {
    const instance = store.getInstanceConnection(rule.instanceId)
    if (!instance) {
      issues.push(createQueueIssue(rule, null, 'The configured instance could not be found.'))
      continue
    }

    if (!instance.enabled) {
      issues.push(createQueueIssue(rule, instance, 'The instance is disabled.'))
      continue
    }

    try {
      const evaluation = evaluateRuleCandidatesFromSnapshot(rule, instance, 'queue')
      if (evaluation.requestScan) {
        enqueueScanJob(instance.id, evaluation.requestScan.kind, evaluation.requestScan.trigger)
      }
      items.push(...materializeQueueItemsForRule(rule, evaluation.candidates))
      issues.push(...evaluation.issues)
    } catch (error) {
      issues.push(createQueueIssue(rule, instance, getQueueIssueMessage(error)))
    }
  }

  return {
    items: items.sort(compareQueueItems),
    issues
  }
}

async function rebuildMaterializedQueue() {
  if (restoreInProgress) {
    return store.getQueueSnapshot()
  }

  const startedAt = Date.now()
  const snapshot = await buildQueueSnapshot()
  store.replaceQueueSnapshot(snapshot)
  lastQueueRebuildAt = new Date().toISOString()
  lastQueueRebuildDurationMs = Date.now() - startedAt
  return store.getQueueSnapshot()
}

async function fetchRadarrScanCatalog(instance: ArrConnection): Promise<RadarrScanCatalog> {
  const [movies, qualityDefinitions, qualityProfiles] = await Promise.all([
    fetchArrJson<RadarrMovie[]>(instance, '/api/v3/movie'),
    fetchArrJson<QualityDefinition[]>(instance, '/api/v3/qualitydefinition'),
    fetchArrJson<QualityProfile[]>(instance, '/api/v3/qualityprofile')
  ])

  return {
    kind: 'radarr',
    movies,
    qualityDefinitions,
    qualityProfiles
  }
}

async function fetchSonarrScanCatalog(instance: ArrConnection): Promise<SonarrScanCatalog> {
  const [series, missingEpisodes, qualityDefinitions, qualityProfiles] = await Promise.all([
    fetchArrJson<SonarrSeries[]>(instance, '/api/v3/series'),
    fetchSonarrMissingEpisodes(instance),
    fetchArrJson<QualityDefinition[]>(instance, '/api/v3/qualitydefinition'),
    fetchArrJson<QualityProfile[]>(instance, '/api/v3/qualityprofile')
  ])

  return {
    kind: 'sonarr',
    series,
    missingEpisodes,
    qualityDefinitions,
    qualityProfiles
  }
}

async function fetchSonarrSeriesScanPayload(
  instance: ArrConnection,
  series: SonarrSeries
): Promise<SonarrSeriesScanPayload> {
  const [episodes, files] = await Promise.all([
    fetchArrJson<SonarrEpisode[]>(instance, `/api/v3/episode?seriesId=${series.id}&includeImages=false`),
    fetchArrJson<SonarrEpisodeFile[]>(instance, `/api/v3/episodefile?seriesId=${series.id}`)
  ])

  return {
    episodes,
    files
  }
}

function getScanJobPriority(job: ScanJob) {
  if (job.trigger === 'manual') {
    return job.kind === 'full' ? 0 : 1
  }

  if (job.trigger === 'stale_rule') {
    return 2
  }

  if (job.trigger === 'instance_change' || job.trigger === 'health_recovery') {
    return 3
  }

  if (job.trigger === 'startup') {
    return 4
  }

  if (job.trigger === 'rule_change') {
    return 5
  }

  return 6
}

function sortScanQueue() {
  scanQueue.sort((left, right) => {
    const priorityDelta = getScanJobPriority(left) - getScanJobPriority(right)
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    if (left.kind !== right.kind) {
      return left.kind === 'full' ? -1 : 1
    }

    return left.queuedAt.localeCompare(right.queuedAt)
  })
}

function updateActiveScanJob(
  patch: Partial<Pick<ActiveScanJobState, 'phase' | 'currentItem' | 'totalItems' | 'scannedItems' | 'updatedItems' | 'skippedItems'>>
) {
  if (!activeScanJob) {
    return
  }

  activeScanJob = {
    ...activeScanJob,
    ...patch
  }
}

function queueNextScanAt(hasPendingDetails: boolean, catalogUpdatedAt: string) {
  if (hasPendingDetails) {
    return new Date(Date.now() + scanSchedulerPollMs).toISOString()
  }

  const catalogTimestamp = parseTimestamp(catalogUpdatedAt)
  if (catalogTimestamp === null) {
    return null
  }

  return new Date(catalogTimestamp + scanCatalogIntervalMs).toISOString()
}

function updateInstanceScanStateSuccess(
  instanceId: number,
  kind: ScanKind,
  input: {
    catalogUpdatedAt: string
    eligibleEntityCount: number
    cachedEntityCount: number
    pendingEntityCount: number
    staleEntityCount: number
    nextScanAt: string | null
  }
) {
  const previous = getEmptyInstanceScanState(instanceId)
  const completedAt = new Date().toISOString()

  store.upsertInstanceScanState({
    instanceId,
    catalogUpdatedAt: input.catalogUpdatedAt,
    lastScanAt: completedAt,
    lastSuccessfulScanAt: completedAt,
    lastFullScanAt: kind === 'full' ? completedAt : previous.lastFullScanAt,
    lastIncrementalScanAt: kind === 'incremental' ? completedAt : previous.lastIncrementalScanAt,
    nextScanAt: input.nextScanAt,
    lastError: null,
    eligibleEntityCount: input.eligibleEntityCount,
    cachedEntityCount: input.cachedEntityCount,
    pendingEntityCount: input.pendingEntityCount,
    staleEntityCount: input.staleEntityCount
  })
}

function updateInstanceScanStateFailure(instanceId: number, errorMessage: string) {
  const previous = getEmptyInstanceScanState(instanceId)
  const failedAt = new Date().toISOString()

  store.upsertInstanceScanState({
    instanceId,
    catalogUpdatedAt: previous.catalogUpdatedAt,
    lastScanAt: failedAt,
    lastSuccessfulScanAt: previous.lastSuccessfulScanAt,
    lastFullScanAt: previous.lastFullScanAt,
    lastIncrementalScanAt: previous.lastIncrementalScanAt,
    nextScanAt: new Date(Date.now() + scanSchedulerPollMs).toISOString(),
    lastError: errorMessage,
    eligibleEntityCount: previous.eligibleEntityCount,
    cachedEntityCount: previous.cachedEntityCount,
    pendingEntityCount: previous.pendingEntityCount,
    staleEntityCount: previous.staleEntityCount
  })
}

function prioritizeSonarrSeriesIdsForIncremental(
  catalog: SonarrScanCatalog,
  seriesIds: number[],
  existingDetails: Map<number, CachedSeriesDetailsRecord>
) {
  const missingSeriesIds = new Set(
    catalog.missingEpisodes
      .filter((episode) => episode.seasonNumber > 0)
      .map((episode) => episode.seriesId)
  )
  const seriesById = new Map(catalog.series.map((series) => [series.id, series]))

  return [...seriesIds].sort((left, right) => {
    const leftMissingDetail = existingDetails.has(left) ? 1 : 0
    const rightMissingDetail = existingDetails.has(right) ? 1 : 0
    if (leftMissingDetail !== rightMissingDetail) {
      return leftMissingDetail - rightMissingDetail
    }

    const leftMissingEpisodes = missingSeriesIds.has(left) ? 0 : 1
    const rightMissingEpisodes = missingSeriesIds.has(right) ? 0 : 1
    if (leftMissingEpisodes !== rightMissingEpisodes) {
      return leftMissingEpisodes - rightMissingEpisodes
    }

    const leftAge = getTimestampAgeMs(existingDetails.get(left)?.lastScannedAt) ?? Number.MAX_SAFE_INTEGER
    const rightAge = getTimestampAgeMs(existingDetails.get(right)?.lastScannedAt) ?? Number.MAX_SAFE_INTEGER
    if (leftAge !== rightAge) {
      return rightAge - leftAge
    }

    return (seriesById.get(left)?.title ?? String(left)).localeCompare(seriesById.get(right)?.title ?? String(right))
  })
}

async function runScanJob(job: ScanJob) {
  const instance = store.getInstanceConnection(job.instanceId)
  if (!instance || !instance.enabled) {
    return
  }

  const startedAt = new Date().toISOString()
  scanWorkerLastError = null
  activeScanJob = {
    ...job,
    startedAt,
    phase: 'Refreshing catalog',
    currentItem: null,
    totalItems: 0,
    scannedItems: 0,
    updatedItems: 0,
    skippedItems: 0
  }

  try {
    if (instance.kind === 'radarr') {
      const catalog = await fetchRadarrScanCatalog(instance)
      const catalogUpdatedAt = new Date().toISOString()
      store.replaceInstanceScanCatalog({
        instanceId: instance.id,
        instanceKind: 'radarr',
        catalog,
        updatedAt: catalogUpdatedAt
      })

      updateInstanceScanStateSuccess(instance.id, job.kind, {
        catalogUpdatedAt,
        eligibleEntityCount: catalog.movies.length,
        cachedEntityCount: catalog.movies.length,
        pendingEntityCount: 0,
        staleEntityCount: 0,
        nextScanAt: queueNextScanAt(false, catalogUpdatedAt)
      })

      store.recordScanRun({
        instanceId: instance.id,
        kind: job.kind,
        trigger: job.trigger,
        status: 'completed',
        startedAt,
        endedAt: new Date().toISOString(),
        phase: 'catalog',
        totalItems: catalog.movies.length,
        scannedItems: catalog.movies.length,
        updatedItems: catalog.movies.length,
        skippedItems: 0,
        summary: `Refreshed the Radarr catalog for ${catalog.movies.length} movies.`
      })

      updateActiveScanJob({
        phase: 'Rebuilding queue',
        currentItem: null
      })
      await refreshMaterializedQueue()
      return
    }

    const catalog = await fetchSonarrScanCatalog(instance)
    const catalogUpdatedAt = new Date().toISOString()
    store.replaceInstanceScanCatalog({
      instanceId: instance.id,
      instanceKind: 'sonarr',
      catalog,
      updatedAt: catalogUpdatedAt
    })
    store.deleteInstanceScanEntitiesNotIn(
      instance.id,
      catalog.series.map((series) => String(series.id))
    )

    const trackingSeriesIds = buildDesiredSonarrSeriesIds(instance.id, catalog)
    const scanTargets =
      job.kind === 'full'
        ? buildDesiredSonarrSeriesIds(instance.id, catalog, { full: true })
        : trackingSeriesIds
    const existingDetails = new Map<number, CachedSeriesDetailsRecord>(
      store
        .getInstanceScanEntities(
          instance.id,
          scanTargets.map((seriesId) => String(seriesId))
        )
        .map((entry) => [Number(entry.entityKey), toCachedSeriesDetailsRecord(entry)])
    )
    const staleOrMissingTargets = scanTargets.filter((seriesId) => {
      const record = existingDetails.get(seriesId)
      return !record || isTimestampOlderThan(record.lastScannedAt, scanDetailRefreshMs)
    })
    const seriesIdsToScan =
      job.kind === 'full'
        ? scanTargets
        : prioritizeSonarrSeriesIdsForIncremental(catalog, staleOrMissingTargets, existingDetails).slice(
            0,
            scanDetailBatchSize
          )

    updateActiveScanJob({
      phase: seriesIdsToScan.length > 0 ? 'Refreshing series details' : 'Rebuilding queue',
      totalItems: seriesIdsToScan.length,
      scannedItems: 0,
      updatedItems: 0,
      skippedItems: Math.max(0, staleOrMissingTargets.length - seriesIdsToScan.length)
    })

    const seriesById = new Map(catalog.series.map((series) => [series.id, series]))
    const scannedEntries: Array<{
      entityKey: string
      entityKind: string
      title: string
      payload: SonarrSeriesScanPayload
      lastScannedAt: string
    }> = []

    await mapWithConcurrency(seriesIdsToScan, scanDetailConcurrency, async (seriesId, index) => {
      const series = seriesById.get(seriesId)
      if (!series) {
        return
      }

      updateActiveScanJob({
        currentItem: series.title
      })
      const payload = await fetchSonarrSeriesScanPayload(instance, series)
      scannedEntries.push({
        entityKey: String(series.id),
        entityKind: 'series',
        title: series.title,
        payload,
        lastScannedAt: new Date().toISOString()
      })
      updateActiveScanJob({
        scannedItems: index + 1,
        updatedItems: scannedEntries.length
      })
    })

    store.upsertInstanceScanEntities(instance.id, scannedEntries)

    const refreshedDetails = new Map<number, CachedSeriesDetailsRecord>(
      store
        .getInstanceScanEntities(
          instance.id,
          trackingSeriesIds.map((seriesId) => String(seriesId))
        )
        .map((entry) => [Number(entry.entityKey), toCachedSeriesDetailsRecord(entry)])
    )
    const missingTrackedCount = trackingSeriesIds.filter((seriesId) => !refreshedDetails.has(seriesId)).length
    const staleTrackedCount = trackingSeriesIds.filter((seriesId) => {
      const record = refreshedDetails.get(seriesId)
      return record ? isTimestampOlderThan(record.lastScannedAt, scanDetailRefreshMs) : false
    }).length

    updateInstanceScanStateSuccess(instance.id, job.kind, {
      catalogUpdatedAt,
      eligibleEntityCount: trackingSeriesIds.length,
      cachedEntityCount: trackingSeriesIds.length - missingTrackedCount,
      pendingEntityCount: missingTrackedCount + staleTrackedCount,
      staleEntityCount: staleTrackedCount,
      nextScanAt: queueNextScanAt(missingTrackedCount + staleTrackedCount > 0, catalogUpdatedAt)
    })

    store.recordScanRun({
      instanceId: instance.id,
      kind: job.kind,
      trigger: job.trigger,
      status: 'completed',
      startedAt,
      endedAt: new Date().toISOString(),
      phase: scannedEntries.length > 0 ? 'details' : 'catalog',
      totalItems: seriesIdsToScan.length,
      scannedItems: scannedEntries.length,
      updatedItems: scannedEntries.length,
      skippedItems: Math.max(0, staleOrMissingTargets.length - seriesIdsToScan.length),
      summary:
        job.kind === 'full'
          ? `Refreshed the Sonarr catalog and ${scannedEntries.length} series detail snapshots.`
          : `Refreshed the Sonarr catalog and ${scannedEntries.length} series detail snapshots from the incremental backlog.`
    })

    updateActiveScanJob({
      phase: 'Rebuilding queue',
      currentItem: null
    })
    await refreshMaterializedQueue()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed.'
    scanWorkerLastError = message
    updateInstanceScanStateFailure(job.instanceId, message)
    store.recordScanRun({
      instanceId: job.instanceId,
      kind: job.kind,
      trigger: job.trigger,
      status: 'failed',
      startedAt,
      endedAt: new Date().toISOString(),
      phase: activeScanJob?.phase ?? null,
      totalItems: activeScanJob?.totalItems ?? 0,
      scannedItems: activeScanJob?.scannedItems ?? 0,
      updatedItems: activeScanJob?.updatedItems ?? 0,
      skippedItems: activeScanJob?.skippedItems ?? 0,
      summary: message,
      error: message
    })
    throw error
  } finally {
    activeScanJob = null
  }
}

function enqueueScanJob(instanceId: number, kind: ScanKind, trigger: ScanTrigger) {
  const instance = store.getInstanceConnection(instanceId)
  if (!instance || !instance.enabled) {
    return false
  }

  const preferredKind = getPreferredScanKind(getEmptyInstanceScanState(instanceId))
  const effectiveKind = kind === 'incremental' && preferredKind === 'full' ? 'full' : kind

  const existingQueued = scanQueue.find((job) => job.instanceId === instanceId)
  if (existingQueued) {
    if (effectiveKind === 'full') {
      existingQueued.kind = 'full'
    }
    if (getScanJobPriority({ ...existingQueued, trigger }) < getScanJobPriority(existingQueued)) {
      existingQueued.trigger = trigger
    }
    existingQueued.queuedAt = new Date().toISOString()
    sortScanQueue()
    void pumpScanQueue()
    return false
  }

  if (activeScanJob?.instanceId === instanceId && activeScanJob.kind === 'full') {
    return false
  }

  scanQueue.push({
    instanceId,
    kind: effectiveKind,
    trigger,
    queuedAt: new Date().toISOString()
  })
  sortScanQueue()
  void pumpScanQueue()
  return true
}

async function pumpScanQueue() {
  if (restoreInProgress || activeScanJob || scanQueue.length === 0) {
    return
  }

  const nextJob = scanQueue.shift()
  if (!nextJob) {
    return
  }

  try {
    await runScanJob(nextJob)
  } catch (error) {
    console.error(`failed to run ${nextJob.kind} scan for instance ${nextJob.instanceId}`, error)
  } finally {
    if (!restoreInProgress && scanQueue.length > 0) {
      void pumpScanQueue()
    }
  }
}

function requestFullScan(instanceId?: number | null) {
  const instances = instanceId == null
    ? store.getInstances().filter((instance) => instance.enabled)
    : store.getInstances().filter((instance) => instance.id === instanceId && instance.enabled)

  for (const instance of instances) {
    enqueueScanJob(instance.id, 'full', 'manual')
  }

  return instances.length
}

function requestQueueRefresh() {
  void refreshMaterializedQueue()
}

async function scheduleDueScans() {
  if (restoreInProgress) {
    return
  }

  const now = Date.now()

  for (const instance of store.getInstances()) {
    if (!instance.enabled) {
      continue
    }

    const state = getEmptyInstanceScanState(instance.id)
    const nextScanAt = parseTimestamp(state.nextScanAt)

    if (!state.lastSuccessfulScanAt || !parseStoredScanCatalog(instance.id)) {
      enqueueScanJob(instance.id, 'full', 'startup')
      continue
    }

    if (nextScanAt !== null && nextScanAt <= now) {
      enqueueScanJob(instance.id, getPreferredScanKind(state), 'scheduled')
      continue
    }

    if (nextScanAt === null && isTimestampOlderThan(state.catalogUpdatedAt, scanCatalogIntervalMs)) {
      enqueueScanJob(instance.id, getPreferredScanKind(state), 'scheduled')
    }
  }
}

function getScanStatus(): ScanStatusResponse {
  const instances = store.getInstances()
  const statesByInstanceId = new Map(store.getInstanceScanStates().map((entry) => [entry.instanceId, entry]))
  const currentActiveJob = activeScanJob

  return scanStatusResponseSchema.parse({
    worker: {
      state: queueRefreshInProgress ? 'rebuilding_queue' : activeScanJob ? 'scanning' : 'idle',
      detailConcurrency: scanDetailConcurrency,
      detailBatchSize: scanDetailBatchSize,
      queueLength: scanQueue.length,
      lastQueueRebuildAt,
      lastQueueRebuildDurationMs,
      lastError: scanWorkerLastError,
      activeJob: currentActiveJob
        ? {
            instanceId: currentActiveJob.instanceId,
            instanceName:
              instances.find((instance) => instance.id === currentActiveJob.instanceId)?.name ??
              `Instance ${currentActiveJob.instanceId}`,
            kind: currentActiveJob.kind,
            trigger: currentActiveJob.trigger,
            queuedAt: currentActiveJob.queuedAt,
            startedAt: currentActiveJob.startedAt,
            phase: currentActiveJob.phase,
            currentItem: currentActiveJob.currentItem,
            totalItems: currentActiveJob.totalItems,
            scannedItems: currentActiveJob.scannedItems,
            updatedItems: currentActiveJob.updatedItems,
            skippedItems: currentActiveJob.skippedItems
          }
        : null,
      queuedJobs: scanQueue.map((job) => ({
        instanceId: job.instanceId,
        instanceName: instances.find((instance) => instance.id === job.instanceId)?.name ?? `Instance ${job.instanceId}`,
        kind: job.kind,
        trigger: job.trigger,
        queuedAt: job.queuedAt
      }))
    },
    instances: instances.map((instance) => {
      const state = statesByInstanceId.get(instance.id) ?? getEmptyInstanceScanState(instance.id)
      const snapshotState =
        !state.catalogUpdatedAt
          ? 'empty'
          : state.pendingEntityCount > 0 && state.cachedEntityCount === 0
            ? 'warming'
            : isTimestampOlderThan(state.catalogUpdatedAt, scanCatalogIntervalMs) || state.staleEntityCount > 0
              ? 'stale'
              : 'ready'

      return {
        instanceId: instance.id,
        instanceName: instance.name,
        instanceKind: instance.kind,
        enabled: instance.enabled,
        catalogUpdatedAt: state.catalogUpdatedAt,
        lastScanAt: state.lastScanAt,
        lastSuccessfulScanAt: state.lastSuccessfulScanAt,
        lastFullScanAt: state.lastFullScanAt,
        lastIncrementalScanAt: state.lastIncrementalScanAt,
        nextScanAt: state.nextScanAt,
        lastError: state.lastError,
        eligibleEntityCount: state.eligibleEntityCount,
        cachedEntityCount: state.cachedEntityCount,
        pendingEntityCount: state.pendingEntityCount,
        staleEntityCount: state.staleEntityCount,
        snapshotState
      }
    }),
    runs: store.getScanRuns(),
    queueUpdatedAt: store.getQueueSnapshot().updatedAt
  })
}

async function postArrCommand(
  instance: ArrConnection,
  body: Record<string, unknown>
) {
  await requestArr(instance, '/api/v3/command', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

async function dispatchCandidate(
  instance: ArrConnection,
  candidate: QueueCandidate
) {
  switch (candidate.dispatch.kind) {
    case 'movie':
      await postArrCommand(instance, {
        name: 'MoviesSearch',
        movieIds: candidate.dispatch.movieIds
      })
      return
    case 'series':
      await postArrCommand(instance, {
        name: 'SeriesSearch',
        seriesId: candidate.dispatch.seriesId
      })
      return
    case 'season':
      await postArrCommand(instance, {
        name: 'SeasonSearch',
        seriesId: candidate.dispatch.seriesId,
        seasonNumber: candidate.dispatch.seasonNumber
      })
      return
    case 'episode':
      await postArrCommand(instance, {
        name: 'EpisodeSearch',
        episodeIds: candidate.dispatch.episodeIds
      })
  }
}

let queueRefreshInProgress = false
let queueRefreshRequested = false
const scanQueue: ScanJob[] = []
let activeScanJob: ActiveScanJobState | null = null
let scanWorkerLastError: string | null = null
let lastQueueRebuildAt: string | null = null
let lastQueueRebuildDurationMs: number | null = null

async function refreshMaterializedQueue() {
  if (restoreInProgress) {
    return
  }

  if (queueRefreshInProgress) {
    queueRefreshRequested = true
    return
  }

  queueRefreshInProgress = true

  try {
    do {
      queueRefreshRequested = false

      try {
        await rebuildMaterializedQueue()
      } catch (error) {
        console.error('failed to refresh queue snapshot', error)
      }
    } while (queueRefreshRequested)
  } finally {
    queueRefreshInProgress = false
  }
}

const runningRules = new Set<number>()
let schedulerTickInProgress = false
let backupTickInProgress = false
let instanceHealthTickInProgress = false
let lastBackupAttemptedSlot: string | null = null
let lastInvalidBackupScheduleLogged: string | null = null
let lastInstanceHealthCheckAt = 0
let restoreInProgress = false
const restoreBackgroundIdleTimeoutMs = parsePositiveIntEnv('POKARR_RESTORE_IDLE_TIMEOUT_MS', 30000)

async function recordRunAndNotify(
  rule: ReturnType<Store['getRules']>[number],
  instance: NonNullable<ReturnType<Store['getInstanceConnection']>>,
  input: Parameters<Store['recordRun']>[0]
) {
  const run = store.recordRun(input)
  const settings = store.getSettings()

  try {
    if (run.status === 'completed' && settings.notifications.runSuccess) {
      await sendNotification(settings.notifications.notificationUrl, buildRunNotification(rule, instance, run))
    }

    if (run.status === 'failed' && settings.notifications.runFailure) {
      await sendNotification(settings.notifications.notificationUrl, buildRunNotification(rule, instance, run))
    }
  } catch (notificationError) {
    console.error('failed to send run notification', notificationError)
  }

  return run
}

async function createBackupAndNotify(trigger: 'manual' | 'scheduled') {
  if (restoreInProgress) {
    throw new Error('Backup restore is in progress.')
  }

  const settings = store.getSettings()

  try {
    const backup = await store.createBackup(trigger)

    if (settings.notifications.backupSuccess) {
      try {
        await sendNotification(settings.notifications.notificationUrl, buildBackupCompletedNotification(backup))
      } catch (notificationError) {
        console.error('failed to send backup success notification', notificationError)
      }
    }

    return backup
  } catch (error) {
    if (settings.notifications.backupFailure) {
      try {
        await sendNotification(
          settings.notifications.notificationUrl,
          buildBackupFailedNotification(trigger, error instanceof Error ? error.message : 'Backup creation failed.')
        )
      } catch (notificationError) {
        console.error('failed to send backup failure notification', notificationError)
      }
    }

    throw error
  }
}

function hasBackgroundWorkInProgress() {
  return (
    runningRules.size > 0 ||
    schedulerTickInProgress ||
    queueRefreshInProgress ||
    activeScanJob !== null ||
    backupTickInProgress ||
    instanceHealthTickInProgress
  )
}

async function waitForBackgroundIdle(timeoutMs = restoreBackgroundIdleTimeoutMs) {
  const startedAt = Date.now()
  while (hasBackgroundWorkInProgress()) {
    if (Date.now() - startedAt >= timeoutMs) {
      return false
    }

    await Bun.sleep(100)
  }

  return true
}

async function checkInstanceHealth(instanceId: number) {
  const instance = store.getInstanceConnection(instanceId)
  if (!instance || !instance.enabled) {
    return { changed: false }
  }

  const previous = store.getInstances().find((item) => item.id === instance.id) ?? null

  try {
    await fetchValidatedInstanceStatus(instance)
  } catch {
    const current = store.getInstances().find((item) => item.id === instance.id) ?? null
      return {
        instance: current,
        changed: didInstanceHealthStateChange(previous, current)
      }
  }

  const current = store.getInstances().find((item) => item.id === instance.id) ?? null
  return {
    instance: current,
    changed: didInstanceHealthStateChange(previous, current ?? null)
  }
}

async function runRule(ruleId: number, trigger: 'manual' | 'scheduled') {
  if (restoreInProgress) {
    throw new Error('Backup restore is in progress.')
  }

  if (runningRules.has(ruleId)) {
    throw new Error('This rule is already running.')
  }

  const rule = store.getRules().find((item) => item.id === ruleId)
  if (!rule) {
    throw new Error('Rule not found')
  }

  const instance = store.getInstanceConnection(rule.instanceId)
  if (!instance) {
    throw new Error('Instance not found')
  }

  if (!instance.enabled) {
    const timestamp = new Date().toISOString()
    return recordRunAndNotify(rule, instance, {
      ruleId: rule.id,
      instanceId: rule.instanceId,
      trigger,
      startedAt: timestamp,
      endedAt: timestamp,
      status: 'skipped',
      selectedCount: 0,
      dispatchedCount: 0,
      summary: 'Instance is disabled.',
      skipReason: 'Instance is disabled.'
    })
  }

  runningRules.add(ruleId)
  const startedAt = new Date().toISOString()

  try {
    const evaluation = evaluateRuleCandidatesFromSnapshot(rule, instance, 'run')
    if (evaluation.requestScan) {
      enqueueScanJob(instance.id, evaluation.requestScan.kind, evaluation.requestScan.trigger)
    }

    if (evaluation.blocking) {
      const summary =
        evaluation.issues[0]?.message ??
        'Scan data is still warming. A priority refresh has been queued before this rule can run.'
      return recordRunAndNotify(rule, instance, {
        ruleId: rule.id,
        instanceId: rule.instanceId,
        trigger,
        startedAt,
        endedAt: new Date().toISOString(),
        status: 'skipped',
        selectedCount: 0,
        dispatchedCount: 0,
        summary,
        skipReason: summary
      })
    }

    const { candidates, issues } = evaluation
    const selected = candidates.slice(0, rule.batchSize)

    if (selected.length === 0) {
      const summary = issues[0]?.message ?? 'No eligible items.'
      return recordRunAndNotify(rule, instance, {
        ruleId: rule.id,
        instanceId: rule.instanceId,
        trigger,
        startedAt,
        endedAt: new Date().toISOString(),
        status: 'skipped',
        selectedCount: 0,
        dispatchedCount: 0,
        summary,
        skipReason: summary === 'No eligible items.' ? summary : null
      })
    }

    const successful: QueueCandidate[] = []
    const failures: string[] = []
    let skippedAfterFailure = 0

    for (const candidate of selected) {
      try {
        await dispatchCandidate(instance, candidate)
        successful.push(candidate)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Dispatch failed.'
        failures.push(`${candidate.title}: ${message}`)
        if (shouldAbortRemainingDispatches(error)) {
          skippedAfterFailure = selected.length - successful.length - failures.length
          break
        }
      }
    }

    if (successful.length > 0) {
      const timestamp = new Date().toISOString()
      const existingStates = new Map(store.getRuleEntityStates(rule.id).map((state) => [state.entityKey, state]))
      store.upsertRuleEntityStates(
        rule.id,
        successful.map((candidate) => {
          const existing = existingStates.get(candidate.entityKey)
          const consecutivePokes =
            existing && existing.lastSignature === candidate.signature ? existing.consecutivePokes + 1 : 1

          return {
            entityKey: candidate.entityKey,
            entityKind: candidate.kind,
            lastPokedAt: timestamp,
            lastSignature: candidate.signature,
            consecutivePokes
          }
        })
      )
    }

    const endedAt = new Date().toISOString()
    const summary =
      failures.length === 0
        ? `Triggered ${successful.length} ${successful.length === 1 ? 'search' : 'searches'}.`
        : successful.length === 0
          ? skippedAfterFailure > 0
            ? `${failures[0] ?? 'Failed to trigger a search.'} ${skippedAfterFailure} pending ${skippedAfterFailure === 1 ? 'search was' : 'searches were'} left for a later run.`
            : failures[0] ?? 'Failed to trigger a search.'
          : [
              `Triggered ${successful.length} of ${selected.length} searches.`,
              `${failures.length} failed.`,
              skippedAfterFailure > 0
                ? `${skippedAfterFailure} pending ${skippedAfterFailure === 1 ? 'search was' : 'searches were'} left for a later run.`
                : null
            ]
              .filter(Boolean)
              .join(' ')

    return recordRunAndNotify(rule, instance, {
      ruleId: rule.id,
      instanceId: rule.instanceId,
      trigger,
      startedAt,
      endedAt,
      status: failures.length === 0 ? 'completed' : successful.length > 0 ? 'failed' : 'failed',
      selectedCount: selected.length,
      dispatchedCount: successful.length,
      summary,
      skipReason: null
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to evaluate the rule.'
    const deferredByRecovery = error instanceof ArrRequestError && error.kind === 'recovery'
    return recordRunAndNotify(rule, instance, {
      ruleId: rule.id,
      instanceId: rule.instanceId,
      trigger,
      startedAt,
      endedAt: new Date().toISOString(),
      status: deferredByRecovery ? 'skipped' : 'failed',
      selectedCount: 0,
      dispatchedCount: 0,
      summary: message,
      skipReason: deferredByRecovery ? message : null
    })
  } finally {
    runningRules.delete(ruleId)
    await refreshMaterializedQueue()
  }
}

async function runDueRules() {
  if (restoreInProgress) {
    return
  }

  if (schedulerTickInProgress) {
    return
  }

  schedulerTickInProgress = true

  try {
    while (true) {
      const now = Date.now()
      const dueRules = store
        .getRules()
        .filter((rule) => {
          const nextRun = parseTimestamp(rule.nextRunAt)
          return rule.enabled && nextRun !== null && nextRun <= now
        })
        .sort((left, right) => {
          const leftRun = parseTimestamp(left.nextRunAt) ?? Number.MAX_SAFE_INTEGER
          const rightRun = parseTimestamp(right.nextRunAt) ?? Number.MAX_SAFE_INTEGER
          if (leftRun !== rightRun) {
            return leftRun - rightRun
          }

          return left.id - right.id
        })

      const nextRule = dueRules.find((rule) => !runningRules.has(rule.id))
      if (!nextRule) {
        break
      }

      try {
        await runRule(nextRule.id, 'scheduled')
      } catch (error) {
        console.error(`failed to run rule ${nextRule.id}`, error)
      }
    }
  } finally {
    schedulerTickInProgress = false
  }
}

async function runDueBackups() {
  if (restoreInProgress) {
    return
  }

  if (backupTickInProgress) {
    return
  }

  const settings = store.getSettings()
  const schedule = settings.backupSchedule.trim()
  if (!isValidCronExpression(schedule)) {
    if (lastInvalidBackupScheduleLogged !== schedule) {
      console.error(`invalid backup schedule ignored: ${schedule}`)
      lastInvalidBackupScheduleLogged = schedule
    }
    return
  }
  lastInvalidBackupScheduleLogged = null

  const now = new Date()
  const slot = truncateToMinute(now)
  if (!cronMatches(slot, schedule)) {
    return
  }

  const slotKey = slot.toISOString()
  if (lastBackupAttemptedSlot === slotKey) {
    return
  }

  const latestScheduledCreatedAt = store.getLatestBackupCreatedAt('scheduled')
  const latestScheduledTimestamp = parseTimestamp(latestScheduledCreatedAt)
  if (latestScheduledTimestamp !== null && latestScheduledTimestamp >= slot.getTime()) {
    lastBackupAttemptedSlot = slotKey
    return
  }

  backupTickInProgress = true
  lastBackupAttemptedSlot = slotKey

  try {
    await createBackupAndNotify('scheduled')
  } catch (error) {
    console.error('failed to run scheduled backup', error)
  } finally {
    backupTickInProgress = false
  }
}

async function runInstanceHealthChecks() {
  if (restoreInProgress) {
    return
  }

  if (instanceHealthTickInProgress) {
    return
  }

  const intervalMs = Number(process.env.POKARR_INSTANCE_HEALTH_POLL_MS ?? '60000')
  const effectiveIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60000
  const now = Date.now()
  if (now - lastInstanceHealthCheckAt < effectiveIntervalMs) {
    return
  }

  instanceHealthTickInProgress = true
  lastInstanceHealthCheckAt = now

  let changed = false

  try {
    for (const instance of store.getInstances()) {
      if (!instance.enabled) {
        continue
      }

      try {
        const result = await checkInstanceHealth(instance.id)
        changed = changed || result.changed
        if (result.changed && result.instance && !result.instance.lastError) {
          enqueueScanJob(instance.id, getPreferredScanKind(getEmptyInstanceScanState(instance.id)), 'health_recovery')
        }
      } catch (error) {
        console.error(`failed to check instance health for ${instance.id}`, error)
      }
    }
  } finally {
    instanceHealthTickInProgress = false
  }

  if (changed) {
    void refreshMaterializedQueue()
  }
}

function startScheduler() {
  void refreshMaterializedQueue()
  void scheduleDueScans()
  void runDueRules()
  void runDueBackups()
  void runInstanceHealthChecks()

  const pollMs = Number(process.env.POKARR_SCHEDULER_POLL_MS ?? '30000')
  setInterval(() => {
    void scheduleDueScans()
    void runDueRules()
    void runDueBackups()
    void runInstanceHealthChecks()
  }, Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 30000)
}

async function validateInstance(id: number) {
  const instance = store.getInstanceConnection(id)
  if (!instance) {
    return json({ error: 'Instance not found' }, 404)
  }

  return validateInstanceInput({
    kind: instance.kind as 'sonarr' | 'radarr',
    name: instance.name,
    baseUrl: instance.baseUrl,
    apiKey: instance.apiKey,
    enabled: instance.enabled
  }, id)
}

async function validateInstanceInput(
  input: {
    kind: 'sonarr' | 'radarr'
    name: string
    baseUrl: string
    apiKey: string
    enabled: boolean
  },
  persistId?: number
) {
  try {
    const connection = {
      id: persistId ?? 0,
      kind: input.kind,
      name: input.name,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      enabled: input.enabled
    } satisfies ArrConnection

    const status = await fetchValidatedInstanceStatus(
      connection,
      {
        persistHealth: Boolean(persistId),
        bypassRecovery: true
      }
    )

    const updated = persistId ? store.getInstances().find((item) => item.id === persistId) ?? null : null
    if (persistId) {
      enqueueScanJob(persistId, getPreferredScanKind(getEmptyInstanceScanState(persistId)), 'instance_change')
      void refreshMaterializedQueue()
    }
    return json({
      ok: true,
      instance: updated,
      status
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation failed'
    if (persistId) {
      void refreshMaterializedQueue()
    }
    return json({ error: message }, 400)
  }
}


  return {
    buildRestoreCompletedNotification,
    buildRestoreFailedNotification,
    createBackupAndNotify,
    fetchQualityOptions,
    getScanStatus,
    getRuleTargetError,
    requestScan(instanceId: number, kind: ScanKind, trigger: ScanTrigger) {
      return enqueueScanJob(instanceId, kind, trigger)
    },
    requestFullScan,
    requestQueueRefresh,
    rebuildMaterializedQueue,
    runRule,
    sendNotification,
    sendNotificationTest,
    startScheduler,
    validateInstance,
    validateInstanceInput,
    validateNotificationUrl,
    waitForBackgroundIdle,
    isRestoreInProgress: () => restoreInProgress,
    setRestoreInProgress(value: boolean) {
      restoreInProgress = value
    }
  }
}

export type ServerRuntime = ReturnType<typeof createRuntime>
