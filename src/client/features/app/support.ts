import {
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from 'react'
import {
  Activity,
  Archive,
  ArrowUpRight,
  LayoutDashboard,
  ServerCog,
  Settings2,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import {
  defaultListPageSize,
  getInitialVisibleCount,
  getNextVisibleCount,
  isListPageSize,
  listPageSizeOptions,
  type ListPageSize
} from '@/client/paging'
import { formatDateCompact } from '@/client/lib/utils'
import type {
  AppState,
  InstanceInput,
  InstanceKind,
  RuleInput,
  QueueItem,
  Settings,
  SettingsUpdate
} from '@/shared/models'

export { defaultListPageSize, isListPageSize, listPageSizeOptions }
export type { ListPageSize }
export type { InstanceKind }
export type SectionId = 'dashboard' | 'instances' | 'rules' | 'queue' | 'runs' | 'settings' | 'system'

export type PaneOption = {
  id: string
  label: string
}

export type SectionMeta = {
  navLabel: string
  title: string
  subtitle: string
  icon: LucideIcon
  panes: PaneOption[]
}

export type ToolbarAction = {
  label: string
  icon: LucideIcon
  onClick?: () => void
  tone?: 'primary' | 'neutral'
  disabled?: boolean
  spinning?: boolean
}

export type QueueEntry = {
  id: string
  title: string
  rule: string
  source: string
  target: string
  itemUrl: string | null
  cadence: string
  cooldown: string
  releaseDate: string
  nextRunAt: string | null
  nextRun: string
  backoff: string
  reason: string
}

export type OrderingColumnKey = 'position' | 'rule' | 'instance' | 'target' | 'release' | 'nextRun' | 'reason'

export type QueueFilterState = {
  rules: string[]
  instances: string[]
  targets: string[]
}

export type RuleSortKey = 'createdAt' | 'updatedAt' | 'name'

export type RuleSortState = {
  key: RuleSortKey
  direction: 'asc' | 'desc'
}

export type InstanceSortKey = 'createdAt' | 'updatedAt' | 'name'

export type InstanceSortState = {
  key: InstanceSortKey
  direction: 'asc' | 'desc'
}

export type ScopedMessage = {
  id: number
  message: string
  section: SectionId
}

export type NoticeTone = 'success' | 'danger'

export type NoticeItem = {
  id: number
  message: string
  tone: NoticeTone
  onDismiss: () => void
}

export type InlineTestState = {
  id: number
  message: string
  tone: NoticeTone
}

export type DurationFieldUnit = 'minutes' | 'hours' | 'delay'

export type DurationValidation = {
  valid: boolean
  message: string
  value: number | null
}

export type QualityOptionsState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  options: string[]
  message: string | null
}

export const browserPreferenceKeys = {
  instanceSort: 'pokarr.instance-sort',
  ruleSort: 'pokarr.rule-sort',
  orderingColumns: 'pokarr.queue-ordering-columns',
  listPageSize: 'pokarr.list-page-size'
} as const

export const defaultRuleSort: RuleSortState = {
  key: 'createdAt',
  direction: 'desc'
}

export const defaultInstanceSort: InstanceSortState = {
  key: 'createdAt',
  direction: 'desc'
}

export type NotificationValidationState = {
  status: 'idle' | 'validating' | 'valid' | 'invalid'
  message: string | null
}

export const sectionMeta: Record<SectionId, SectionMeta> = {
  dashboard: {
    navLabel: 'Overview',
    title: 'System Status',
    subtitle: 'Operational summary and current system state.',
    icon: LayoutDashboard,
    panes: [{ id: 'status', label: 'Status' }]
  },
  instances: {
    navLabel: 'Instances',
    title: 'Instances',
    subtitle: 'Connect services, validate access, and keep health visible.',
    icon: ServerCog,
    panes: [{ id: 'connected', label: 'Connected' }]
  },
  rules: {
    navLabel: 'Rules',
    title: 'Poke Rules',
    subtitle: 'Cadence, batch size, cooldown, scope, guards, and backoff live here.',
    icon: Wrench,
    panes: [{ id: 'rules', label: 'Rules' }]
  },
  queue: {
    navLabel: 'Queue',
    title: 'Queue',
    subtitle: 'What will be poked next and when rules are scheduled to run.',
    icon: ArrowUpRight,
    panes: [
      { id: 'queue', label: 'Queue' },
      { id: 'schedule', label: 'Scheduler' }
    ]
  },
  runs: {
    navLabel: 'Activity',
    title: 'Run Activity',
    subtitle: 'Recorded runs with status, timing, summary, and item-level results.',
    icon: Activity,
    panes: [{ id: 'history', label: 'History' }]
  },
  settings: {
    navLabel: 'Settings',
    title: 'Settings',
    subtitle: 'Notifications and operational defaults.',
    icon: Settings2,
    panes: [
      { id: 'general', label: 'General' },
      { id: 'backups', label: 'Backups' },
      { id: 'notifications', label: 'Notifications' }
    ]
  },
  system: {
    navLabel: 'System',
    title: 'System',
    subtitle: 'Status, scans, backups, and logs.',
    icon: Archive,
    panes: [
      { id: 'status', label: 'Status' },
      { id: 'scans', label: 'Scans' },
      { id: 'backups', label: 'Backups' },
      { id: 'logs', label: 'Logs' }
    ]
  }
}

export const defaultPaneState: Record<SectionId, string> = {
  dashboard: 'status',
  instances: 'connected',
  rules: 'rules',
  queue: 'queue',
  runs: 'history',
  settings: 'general',
  system: 'status'
}

export const defaultInstanceForm: InstanceInput = {
  kind: 'sonarr',
  name: '',
  baseUrl: '',
  apiKey: '',
  enabled: true
}

export const defaultQueueFilters: QueueFilterState = {
  rules: [],
  instances: [],
  targets: []
}

export const defaultOrderingColumns: Record<OrderingColumnKey, boolean> = {
  position: true,
  rule: true,
  instance: true,
  target: true,
  release: false,
  nextRun: true,
  reason: true
}

export function readBrowserPreference<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T
): T {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return fallback
    }

    const parsed = JSON.parse(raw)
    return isValid(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function writeBrowserPreference<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage failures and fall back to in-memory state.
  }
}

export function isSortDirection(value: unknown): value is 'asc' | 'desc' {
  return value === 'asc' || value === 'desc'
}

export function isRuleSortKey(value: unknown): value is RuleSortKey {
  return value === 'createdAt' || value === 'updatedAt' || value === 'name'
}

export function isInstanceSortKey(value: unknown): value is InstanceSortKey {
  return value === 'createdAt' || value === 'updatedAt' || value === 'name'
}

export function isRuleSortState(value: unknown): value is RuleSortState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<RuleSortState>
  return isRuleSortKey(candidate.key) && isSortDirection(candidate.direction)
}

export function isInstanceSortState(value: unknown): value is InstanceSortState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<InstanceSortState>
  return isInstanceSortKey(candidate.key) && isSortDirection(candidate.direction)
}

export function isOrderingColumnsRecord(value: unknown): value is Record<OrderingColumnKey, boolean> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Record<OrderingColumnKey, unknown>>
  const keys: OrderingColumnKey[] = ['position', 'rule', 'instance', 'target', 'release', 'nextRun', 'reason']
  return keys.every((key) => typeof candidate[key] === 'boolean')
}

export function useProgressiveList(totalCount: number, pageSize: ListPageSize) {
  const [visibleCount, setVisibleCount] = useState(() => getInitialVisibleCount(totalCount, pageSize))
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setVisibleCount((current) => {
      const minimum = getInitialVisibleCount(totalCount, pageSize)
      if (minimum === 0) {
        return 0
      }

      return Math.min(totalCount, Math.max(current, minimum))
    })
  }, [pageSize, totalCount])

  const loadMore = useEffectEvent(() => {
    setVisibleCount((current) => getNextVisibleCount(current, totalCount, pageSize))
  })

  const canLoadMore = visibleCount < totalCount

  useEffect(() => {
    if (!canLoadMore || typeof IntersectionObserver === 'undefined') {
      return
    }

    const target = sentinelRef.current
    if (!target) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore()
        }
      },
      {
        rootMargin: '320px 0px'
      }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [canLoadMore, loadMore, visibleCount])

  return {
    visibleCount,
    canLoadMore,
    loadMore: () => loadMore(),
    sentinelRef
  }
}

export function buildSettingsForm(settings?: Settings): SettingsUpdate {
  return {
    backupRetentionDays: settings?.backupRetentionDays ?? 90,
    backupSchedule: settings?.backupSchedule ?? '0 3 * * *',
    notifications: {
      notificationUrl: settings?.notifications.notificationUrl ?? null,
      runSuccess: settings?.notifications.runSuccess ?? true,
      runFailure: settings?.notifications.runFailure ?? true,
      backupSuccess: settings?.notifications.backupSuccess ?? true,
      backupFailure: settings?.notifications.backupFailure ?? true,
      instanceConnectionLost: settings?.notifications.instanceConnectionLost ?? true,
      instanceConnectionRestored: settings?.notifications.instanceConnectionRestored ?? true
    }
  }
}

export function defaultTargetKind(instanceKind?: 'sonarr' | 'radarr') {
  return instanceKind === 'sonarr' ? 'series' : 'movie'
}

export function buildRuleDraft(instanceId?: number, instanceKind?: 'sonarr' | 'radarr'): RuleInput {
  return {
    instanceId: instanceId ?? 0,
    name: '',
    cadenceMinutes: 10,
    batchSize: 5,
    cooldownHours: 24,
    targetKind: defaultTargetKind(instanceKind),
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
  }
}

export function disableBackoff(backoff: RuleInput['backoff']): RuleInput['backoff'] {
  return {
    ...backoff,
    enabled: false,
    episodeFallback: false
  }
}

export function formatHumanDuration(totalMinutes: number) {
  if (totalMinutes <= 0) {
    return '0m'
  }

  const units = [
    { suffix: 'w', size: 7 * 24 * 60 },
    { suffix: 'd', size: 24 * 60 },
    { suffix: 'h', size: 60 },
    { suffix: 'm', size: 1 }
  ] as const

  let remaining = totalMinutes
  const parts: string[] = []

  for (const unit of units) {
    const amount = Math.floor(remaining / unit.size)
    if (amount > 0) {
      parts.push(`${amount}${unit.suffix}`)
      remaining -= amount * unit.size
    }
  }

  return parts.join('')
}

export function formatMinutesInput(value: number) {
  return formatHumanDuration(value)
}

export function formatHoursInput(value: number) {
  return formatHumanDuration(Math.round(value * 60))
}

export function formatDelayInput(value: number) {
  return formatHumanDuration(value)
}

export function parseDurationInput(input: string, unit: DurationFieldUnit): DurationValidation {
  const value = input.trim().toLowerCase()
  const formatHint =
    unit === 'delay'
      ? 'Use values like 2h, 1d, or 1w3d.'
      : 'Use values like 30m, 1h30m, 6h, 1d, or 1w.'

  if (!value) {
    return {
      valid: false,
      message: formatHint,
      value: null
    }
  }

  const normalized = value.replace(/\s+/g, '')
  const tokens = Array.from(normalized.matchAll(/(\d+)([mhdw])/g))
  if (tokens.length === 0 || tokens.map((token) => token[0]).join('') !== normalized) {
    return {
      valid: false,
      message: formatHint,
      value: null
    }
  }

  const allowedUnits = new Set(['w', 'd', 'h', 'm'])
  const order = ['w', 'd', 'h', 'm'] as const
  const unitMinutes: Record<(typeof order)[number], number> = {
    w: 7 * 24 * 60,
    d: 24 * 60,
    h: 60,
    m: 1
  }
  const maxCombinedAmount: Partial<Record<(typeof order)[number], number>> = {
    d: 7,
    h: 24,
    m: 60
  }

  let totalMinutes = 0
  let previousOrderIndex = -1
  const seenUnits = new Set<string>()

  for (let index = 0; index < tokens.length; index += 1) {
    const [, rawAmount, rawSuffix] = tokens[index]
    const suffix = rawSuffix as (typeof order)[number]
    const amount = Number(rawAmount)

    if (!allowedUnits.has(suffix)) {
      return {
        valid: false,
        message: formatHint,
        value: null
      }
    }

    if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
      return {
        valid: false,
        message: 'Use whole-number durations.',
        value: null
      }
    }

    const orderIndex = order.indexOf(suffix)
    if (seenUnits.has(suffix) || orderIndex <= previousOrderIndex) {
      return {
        valid: false,
        message: 'Use largest units first, for example 1h30m or 1w3d.',
        value: null
      }
    }

    if (index > 0) {
      const maxAmount = maxCombinedAmount[suffix]
      if (maxAmount && amount >= maxAmount) {
        return {
          valid: false,
          message: 'Use combined values like 1h30m or 1w3d, with smaller units kept in range.',
          value: null
        }
      }
    }

    seenUnits.add(suffix)
    previousOrderIndex = orderIndex
    totalMinutes += amount * unitMinutes[suffix]
  }

  const allowsZero = unit === 'delay'
  if (totalMinutes < 0 || (!allowsZero && totalMinutes === 0)) {
    return {
      valid: false,
      message: allowsZero ? 'Enter zero or a positive duration.' : 'Enter a positive duration.',
      value: null
    }
  }

  if (unit === 'minutes') {
    if (!Number.isInteger(totalMinutes) || totalMinutes < 1 || totalMinutes > 365 * 24 * 60) {
      return {
        valid: false,
        message: 'Schedule must resolve to between 1m and 365d.',
        value: null
      }
    }

    return {
      valid: true,
      message: `Every ${formatHumanDuration(totalMinutes)}.`,
      value: totalMinutes
    }
  }

  if (unit === 'hours') {
    const totalHours = totalMinutes / 60
    if (totalHours < 1 / 60 || totalHours > 24 * 365) {
      return {
        valid: false,
        message: 'Cooldown must be between 1m and 365d.',
        value: null
      }
    }

    return {
      valid: true,
      message: `Retry after ${formatHumanDuration(totalMinutes)}.`,
      value: totalHours
    }
  }

  if (totalMinutes < 0 || totalMinutes > 3650 * 24 * 60) {
    return {
      valid: false,
      message: 'Release age must be between 0m and 3650d.',
      value: null
    }
  }

  return {
    valid: true,
    message: totalMinutes === 0 ? 'Available immediately.' : `Wait at least ${formatDelayInput(totalMinutes)} after release.`,
    value: totalMinutes
  }
}

export function targetLabel(targetKind: RuleInput['targetKind']) {
  switch (targetKind) {
    case 'movie':
      return 'Movie'
    case 'series':
      return 'Series'
    case 'season':
      return 'Season'
  }
}

export function targetNoun(targetKind: RuleInput['targetKind']) {
  return targetLabel(targetKind).toLowerCase()
}

export function targetPluralNoun(targetKind: RuleInput['targetKind']) {
  switch (targetKind) {
    case 'movie':
      return 'movies'
    case 'series':
      return 'series'
    case 'season':
      return 'seasons'
  }
}

export function releaseAgeHelpText(targetKind: RuleInput['targetKind']) {
  switch (targetKind) {
    case 'movie':
      return 'Only search for the movie after it has been released for at least this long. Use values like 2h, 1d, or 1w3d.'
    case 'season':
      return 'Only search for the season after the newest episode in that season has been released for at least this long. Use values like 2h, 1d, or 1w3d.'
    case 'series':
      return 'Only search for the series after the newest episode in the series has been released for at least this long. Use values like 2h, 1d, or 1w3d.'
  }
}

export function profileTargetSubject(targetKind: RuleInput['targetKind']) {
  return targetKind === 'movie' ? 'movie' : 'series'
}

export function instanceKindLabel(kind: InstanceKind) {
  return kind === 'sonarr' ? 'Sonarr' : 'Radarr'
}

export function targetOptionsForInstance(instanceKind?: 'sonarr' | 'radarr') {
  return instanceKind === 'sonarr'
    ? [
        { value: 'series' as const, label: 'Series' },
        { value: 'season' as const, label: 'Season' }
      ]
    : [{ value: 'movie' as const, label: 'Movie' }]
}

export function matchesSearch(values: Array<string | number | boolean | null | undefined>, query: string) {
  if (!query) {
    return true
  }

  const lowerQuery = query.toLowerCase()
  return values.some((value) => String(value ?? '').toLowerCase().includes(lowerQuery))
}

export function slugifySonarrTitle(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildFallbackQueueItemUrl(item: QueueItem, instances: AppState['instances']) {
  const instance = instances.find((entry) => entry.id === item.instanceId)
  if (!instance) {
    return null
  }

  const baseUrl = `${instance.baseUrl.replace(/\/+$/, '')}/`

  if (item.kind === 'movie') {
    const match = item.id.match(/^\d+:movie:(\d+)$/)
    return match ? new URL(`/movie/${match[1]}`, baseUrl).toString() : null
  }

  if (item.kind === 'series') {
    const slug = slugifySonarrTitle(item.title)
    return slug ? new URL(`/series/${slug}`, baseUrl).toString() : null
  }

  const seriesTitle = item.title.split(' · Season ')[0] ?? item.title
  const slug = slugifySonarrTitle(seriesTitle)
  return slug ? new URL(`/series/${slug}`, baseUrl).toString() : null
}

export function buildQueueEntries(
  queueItems: QueueItem[],
  rules: AppState['rules'],
  instances: AppState['instances']
): QueueEntry[] {
  if (queueItems.length === 0) {
    return []
  }

  const ruleById = new Map(rules.map((rule) => [rule.id, rule]))

  return queueItems
    .map((item) => {
      const rule = ruleById.get(item.ruleId)
      return {
        id: item.id,
        title: item.title,
        rule: item.ruleName,
        source: item.instanceName,
        target: item.kind,
        itemUrl: item.itemUrl ?? buildFallbackQueueItemUrl(item, instances),
        cadence: rule ? formatMinutesInput(rule.cadenceMinutes) : '—',
        cooldown: rule ? formatHoursInput(rule.cooldownHours) : '—',
        releaseDate: formatDateCompact(item.releaseDate),
        nextRunAt: item.nextRunAt,
        nextRun: formatDateCompact(item.nextRunAt),
        backoff: item.backoff,
        reason: item.reason
      }
    })
}

export function applyQueueFilters(entries: QueueEntry[], filters: QueueFilterState) {
  return entries.filter((entry) => {
    if (filters.rules.length > 0 && !filters.rules.includes(entry.rule)) {
      return false
    }

    if (filters.instances.length > 0 && !filters.instances.includes(entry.source)) {
      return false
    }

    if (filters.targets.length > 0 && !filters.targets.includes(entry.target)) {
      return false
    }

    return true
  })
}

export function toggleFilterValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export function compareRules(left: AppState['rules'][number], right: AppState['rules'][number], sort: RuleSortState) {
  if (sort.key === 'name') {
    const compared = left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
      numeric: true
    })
    if (compared !== 0) {
      return sort.direction === 'asc' ? compared : -compared
    }
  } else {
    const leftTime = Date.parse(left[sort.key]) || 0
    const rightTime = Date.parse(right[sort.key]) || 0
    if (leftTime !== rightTime) {
      return sort.direction === 'asc' ? leftTime - rightTime : rightTime - leftTime
    }
  }

  return left.id - right.id
}

export function ruleSortLabel(sort: RuleSortState) {
  const base =
    sort.key === 'createdAt' ? 'Added' : sort.key === 'updatedAt' ? 'Last edited' : 'Name'
  const suffix = sort.direction === 'asc' ? 'ascending' : 'descending'
  return `${base} · ${suffix}`
}

export function compareInstances(
  left: AppState['instances'][number],
  right: AppState['instances'][number],
  sort: InstanceSortState
) {
  if (sort.key === 'name') {
    const compared = left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
      numeric: true
    })
    if (compared !== 0) {
      return sort.direction === 'asc' ? compared : -compared
    }
  } else {
    const leftTime = Date.parse(left[sort.key]) || 0
    const rightTime = Date.parse(right[sort.key]) || 0
    if (leftTime !== rightTime) {
      return sort.direction === 'asc' ? leftTime - rightTime : rightTime - leftTime
    }
  }

  return left.id - right.id
}

export function instanceSortLabel(sort: InstanceSortState) {
  const base =
    sort.key === 'createdAt' ? 'Added' : sort.key === 'updatedAt' ? 'Last edited' : 'Name'
  const suffix = sort.direction === 'asc' ? 'ascending' : 'descending'
  return `${base} · ${suffix}`
}
