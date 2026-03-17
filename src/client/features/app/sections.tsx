import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  Archive,
  ArrowUpDown,
  ArrowUpRight,
  Database,
  Funnel,
  Pencil,
  Power,
  RefreshCw,
  Settings2,
  ServerCog,
  Wrench,
  X
} from 'lucide-react'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { ArrTypeIcon } from '@/client/features/app/controls'
import {
  browserPreferenceKeys,
  defaultOrderingColumns,
  defaultQueueFilters,
  formatHoursInput,
  formatMinutesInput,
  instanceSortLabel,
  instanceKindLabel,
  isOrderingColumnsRecord,
  ruleSortLabel,
  readBrowserPreference,
  targetLabel,
  toggleFilterValue,
  type InstanceSortKey,
  type InstanceSortState,
  type ListPageSize,
  type NotificationValidationState,
  type OrderingColumnKey,
  type RuleSortKey,
  type RuleSortState,
  type QueueEntry,
  type QueueFilterState
} from '@/client/features/app/support'
import {
  CardGrid,
  CardMetricRow,
  ContentBlock,
  EmptyCardGrid,
  FieldBlock,
  FieldFeedback,
  FormRow,
  InfoLine,
  ListResultsSummary,
  MetricPanel,
  MutedSummary,
  PageSizeControl,
  ProgressiveListFooter,
  SelectableCard,
  SettingsGroupCard,
  SettingsToggleRow,
  TableFrame
} from '@/client/features/app/shared'
import { cn, formatBytes, formatDate, formatDateCompact } from '@/client/lib/utils'
import { isValidCronExpression } from '@/shared/models'
import { useProgressiveList, writeBrowserPreference, type InlineTestState } from '@/client/features/app/support'
import type {
  AppState,
  RuleInput,
  QueueIssue,
  ScanStatusResponse,
  SettingsUpdate
} from '@/shared/models'

function formatRunDuration(startedAt: string, endedAt: string | null) {
  const start = Date.parse(startedAt)
  const end = endedAt ? Date.parse(endedAt) : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 'Unknown'
  }

  const seconds = Math.max(1, Math.round((end - start) / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainderSeconds = seconds % 60
  if (minutes < 60) {
    return remainderSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainderSeconds}s`
  }

  const hours = Math.floor(minutes / 60)
  const remainderMinutes = minutes % 60
  return remainderMinutes === 0 ? `${hours}h` : `${hours}h ${remainderMinutes}m`
}

function scanSnapshotVariant(state: ScanStatusResponse['instances'][number]['snapshotState']) {
  switch (state) {
    case 'ready':
      return 'success' as const
    case 'stale':
      return 'warning' as const
    case 'warming':
      return 'warning' as const
    default:
      return 'neutral' as const
  }
}

function scanWorkerVariant(state: ScanStatusResponse['worker']['state']) {
  switch (state) {
    case 'scanning':
      return 'warning' as const
    case 'rebuilding_queue':
      return 'warning' as const
    default:
      return 'success' as const
  }
}
export function OverviewContent({ state }: { state: AppState }) {
  const latestBackupAt = state.backups[0]?.createdAt ?? null
  const backupMetricNote = latestBackupAt ? `Latest ${formatDateCompact(latestBackupAt)}` : 'No backups yet'

  return (
      <div className="space-y-6">
        <div className="grid gap-3 xl:grid-cols-4">
          <MetricPanel label="Instances" value={String(state.dashboard.instanceCount)} note="Connected services" icon={ServerCog} />
          <MetricPanel label="Enabled Rules" value={String(state.dashboard.enabledRuleCount)} note="Cadence-driven rules" icon={Wrench} />
          <MetricPanel label="Run Activity" value={String(state.dashboard.totalRunCount)} note="Manual or scheduled entries" icon={Activity} />
          <MetricPanel label="Backups" value={String(state.dashboard.backupCount)} note={backupMetricNote} icon={Archive} />
        </div>

      <ContentBlock title="Status" subtitle="Current runtime and saved configuration.">
        <Card>
          <CardContent className="space-y-3 text-sm text-[var(--foreground-soft)]">
            <InfoLine label="Mode" value={state.app.mode} />
            <InfoLine label="Version" value={state.app.version} />
            <InfoLine label="Next run" value={formatDate(state.dashboard.nextRunAt)} />
            <InfoLine label="Backup schedule" value={state.settings.backupSchedule} />
            <InfoLine label="Retention" value={`${state.settings.backupRetentionDays} days`} />
            <InfoLine
              label="Notifications"
              value={state.settings.notifications.notificationUrl ? 'Configured' : 'Disabled'}
            />
          </CardContent>
        </Card>
      </ContentBlock>
    </div>
  )
}

export function InstancesContent({
  state,
  onAdd,
  onEdit,
  onValidate,
  filteredInstances,
  listPageSize,
  instanceSort,
  onInstanceSortChange,
  onListPageSizeChange
}: {
  state: AppState
  onAdd: () => void
  onEdit: (id: number) => void
  onValidate: (id: number) => void
  filteredInstances: AppState['instances']
  listPageSize: ListPageSize
  instanceSort: InstanceSortState
  onInstanceSortChange: (next: InstanceSortState) => void
  onListPageSizeChange: (next: ListPageSize) => void
}) {
  const { canLoadMore, loadMore, sentinelRef, visibleCount } = useProgressiveList(
    filteredInstances.length,
    listPageSize
  )
  const visibleInstances = filteredInstances.slice(0, visibleCount)

  return (
    <div className="space-y-6">
      <ContentBlock
        title="Instances"
        subtitle="Configured connections and their current health."
        action={
          state.instances.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <PageSizeControl value={listPageSize} onChange={onListPageSizeChange} />
              <InstanceSortMenu sort={instanceSort} onChange={onInstanceSortChange} />
            </div>
          ) : null
        }
      >
        <ListResultsSummary shownCount={visibleInstances.length} matchingCount={filteredInstances.length} totalCount={state.instances.length} />
        {state.instances.length === 0 ? (
          <EmptyCardGrid
            actionLabel="Add instance"
            body="Add a connection, test it, and save it."
            onAction={onAdd}
            title="No instances configured"
          />
        ) : (
          <CardGrid>
            {visibleInstances.map((instance) => {
              const relatedRules = state.rules.filter((rule) => rule.instanceId === instance.id).length
              return (
                <SelectableCard key={instance.id} onClick={() => onEdit(instance.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ArrTypeIcon kind={instance.kind} className="h-[18px] w-[18px] shrink-0" />
                        <h3 className="truncate text-[1rem] font-semibold text-[var(--foreground)]">{instance.name}</h3>
                      </div>
                      <p className="mt-1 text-[0.8rem] text-[var(--muted)]">{instance.baseUrl}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="rounded-[2px] p-1 text-[var(--muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation()
                          onEdit(instance.id)
                        }}
                        title="Edit instance"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge>
                      <span className="inline-flex items-center gap-1.5">
                        <ArrTypeIcon kind={instance.kind} className="h-3.5 w-3.5 shrink-0" />
                        {instanceKindLabel(instance.kind)}
                      </span>
                    </Badge>
                    <Badge variant={instance.enabled ? 'success' : 'warning'}>
                      {instance.enabled ? 'enabled' : 'disabled'}
                    </Badge>
                    <Badge variant={instance.lastError ? 'danger' : 'neutral'}>
                      {instance.lastError ? 'error' : instance.lastValidatedAt ? 'validated' : 'untested'}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-[rgba(255,255,255,0.08)] pt-3 text-[0.82rem] text-[var(--foreground-soft)]">
                    <CardMetricRow label="Rules" value={String(relatedRules)} />
                    <CardMetricRow label="Last check" value={formatDateCompact(instance.lastValidatedAt)} />
                    <CardMetricRow
                      label="Status"
                      value={instance.lastError ? instance.lastError : instance.enabled ? 'Ready' : 'Disabled'}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[rgba(255,255,255,0.08)] pt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation()
                        void onValidate(instance.id)
                      }}
                    >
                      Test
                    </Button>
                  </div>
                </SelectableCard>
              )
            })}
          </CardGrid>
        )}
        <ProgressiveListFooter
          canLoadMore={canLoadMore}
          onLoadMore={loadMore}
          sentinelRef={sentinelRef}
          shownCount={visibleInstances.length}
          totalCount={filteredInstances.length}
        />
        {state.instances.length > 0 && filteredInstances.length === 0 ? (
          <MutedSummary>No instances match the current search.</MutedSummary>
        ) : null}
      </ContentBlock>
    </div>
  )
}

export function RulesContent({
  state,
  onAdd,
  onEdit,
  onRefresh,
  onToggle,
  onRun,
  filteredRules,
  listPageSize,
  ruleSort,
  refreshingRuleIds,
  onListPageSizeChange,
  onRuleSortChange
}: {
  state: AppState
  onAdd: () => void
  onEdit: (id: number) => void
  onRefresh: (id: number) => void
  onToggle: (id: number, enabled: boolean) => void
  onRun: (id: number) => void
  filteredRules: AppState['rules']
  listPageSize: ListPageSize
  ruleSort: RuleSortState
  refreshingRuleIds: number[]
  onListPageSizeChange: (next: ListPageSize) => void
  onRuleSortChange: (next: RuleSortState) => void
}) {
  const { canLoadMore, loadMore, sentinelRef, visibleCount } = useProgressiveList(
    filteredRules.length,
    listPageSize
  )
  const visibleRules = filteredRules.slice(0, visibleCount)

  return (
    <div className="space-y-6">
      <ContentBlock
        title="Rules"
        subtitle="Cadence, scope, guards, and backoff per rule."
        action={
          state.rules.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <PageSizeControl value={listPageSize} onChange={onListPageSizeChange} />
              <RuleSortMenu sort={ruleSort} onChange={onRuleSortChange} />
            </div>
          ) : null
        }
      >
        <ListResultsSummary shownCount={visibleRules.length} matchingCount={filteredRules.length} totalCount={state.rules.length} />
        {state.instances.length === 0 ? (
          <EmptyCardGrid
            actionLabel="Add instance first"
            body="Rules need a saved instance before they can be created."
            disabled
            title="No instances available"
          />
        ) : state.rules.length === 0 ? (
          <EmptyCardGrid
            actionLabel="Add rule"
            body="Create the first rule to define cadence, batch size, and guard behavior."
            onAction={onAdd}
            title="No rules configured"
          />
        ) : (
          <CardGrid>
            {visibleRules.map((rule) => {
              const instance = state.instances.find((item) => item.id === rule.instanceId)
              const isRefreshing = refreshingRuleIds.includes(rule.id)
              return (
                <SelectableCard key={rule.id} onClick={() => onEdit(rule.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[1rem] font-semibold text-[var(--foreground)]">{rule.name}</h3>
                      <div className="mt-1 flex items-center gap-1.5 text-[0.8rem] text-[var(--muted)]">
                        {instance ? <ArrTypeIcon kind={instance.kind} className="h-[14px] w-[14px] shrink-0" /> : null}
                        <span className="truncate">{instance?.name ?? 'Unknown instance'}</span>
                        <span className="text-[var(--line-strong)]">·</span>
                        <span>{targetLabel(rule.targetKind)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="rounded-[2px] p-1 text-[var(--muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation()
                          onEdit(rule.id)
                        }}
                        title="Edit rule"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge>{targetLabel(rule.targetKind)}</Badge>
                    <Badge variant={rule.enabled ? 'success' : 'warning'}>
                      {rule.enabled ? 'enabled' : 'disabled'}
                    </Badge>
                    {rule.scope.missingOnly ? <Badge>missing only</Badge> : null}
                    {rule.guards.monitoredOnly ? <Badge>monitored</Badge> : null}
                    {rule.backoff.enabled ? <Badge variant="warning">backoff</Badge> : null}
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-[rgba(255,255,255,0.08)] pt-3 text-[0.82rem] text-[var(--foreground-soft)]">
                    <CardMetricRow label="Every" value={formatMinutesInput(rule.cadenceMinutes)} />
                    <CardMetricRow label="Batch" value={String(rule.batchSize)} />
                    <CardMetricRow label="Cooldown" value={formatHoursInput(rule.cooldownHours)} />
                    <CardMetricRow label="Next run" value={formatDateCompact(rule.nextRunAt)} />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-[rgba(255,255,255,0.08)] pt-3">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation()
                          void onRun(rule.id)
                        }}
                      >
                        Run now
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isRefreshing}
                        onClick={(event) => {
                          event.stopPropagation()
                          onRefresh(rule.id)
                        }}
                        title="Refresh queue for this rule"
                      >
                        {isRefreshing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation()
                          void onToggle(rule.id, !rule.enabled)
                        }}
                        title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                      >
                        <Power size={14} />
                      </Button>
                    </div>
                  </div>
                </SelectableCard>
              )
            })}
          </CardGrid>
        )}
        <ProgressiveListFooter
          canLoadMore={canLoadMore}
          onLoadMore={loadMore}
          sentinelRef={sentinelRef}
          shownCount={visibleRules.length}
          totalCount={filteredRules.length}
        />
        {state.rules.length > 0 && filteredRules.length === 0 ? (
          <MutedSummary>No rules match the current search.</MutedSummary>
        ) : null}
      </ContentBlock>
    </div>
  )
}

export function QueueContent({
  allQueueEntries,
  pane,
  queueEntries,
  listPageSize,
  rules,
  issues,
  queueFilters,
  onListPageSizeChange,
  onQueueFiltersChange
}: {
  allQueueEntries: QueueEntry[]
  pane: string
  queueEntries: QueueEntry[]
  listPageSize: ListPageSize
  rules: AppState['rules']
  issues: QueueIssue[]
  queueFilters: QueueFilterState
  onListPageSizeChange: (next: ListPageSize) => void
  onQueueFiltersChange: (next: QueueFilterState) => void
}) {
  const ruleOptions = [...new Set(allQueueEntries.map((entry) => entry.rule))].sort((left, right) =>
    left.localeCompare(right)
  )
  const instanceOptions = [...new Set(allQueueEntries.map((entry) => entry.source))].sort((left, right) =>
    left.localeCompare(right)
  )
  const targetOptions = [...new Set(allQueueEntries.map((entry) => entry.target))].sort((left, right) =>
    left.localeCompare(right)
  )
  const [orderingColumns, setOrderingColumns] = useState<Record<OrderingColumnKey, boolean>>(() =>
    readBrowserPreference(
      browserPreferenceKeys.orderingColumns,
      defaultOrderingColumns,
      isOrderingColumnsRecord
    )
  )

  useEffect(() => {
    writeBrowserPreference(browserPreferenceKeys.orderingColumns, orderingColumns)
  }, [orderingColumns])

  const hasActiveFilters =
    queueFilters.rules.length > 0 || queueFilters.instances.length > 0 || queueFilters.targets.length > 0

  const setSingleFilter = (key: keyof QueueFilterState, value: string) => {
    onQueueFiltersChange({
      ...queueFilters,
      [key]: queueFilters[key].length === 1 && queueFilters[key][0] === value ? [] : [value]
    })
  }

  const ruleHeader = (
    <ColumnFilterMenu
      label="Rule"
      options={ruleOptions}
      selectedValues={queueFilters.rules}
      onChange={(values) => onQueueFiltersChange({ ...queueFilters, rules: values })}
      variant="header"
    />
  )
  const instanceHeader = (
    <ColumnFilterMenu
      label="Instance"
      options={instanceOptions}
      selectedValues={queueFilters.instances}
      onChange={(values) => onQueueFiltersChange({ ...queueFilters, instances: values })}
      variant="header"
    />
  )
  const typeHeader = (
    <ColumnFilterMenu
      formatOption={(value) => targetLabel(value as RuleInput['targetKind'])}
      label="Type"
      options={targetOptions}
      selectedValues={queueFilters.targets}
      onChange={(values) => onQueueFiltersChange({ ...queueFilters, targets: values })}
      variant="header"
    />
  )
  const orderingAction = (
    <div className="flex items-center gap-2">
      <PageSizeControl value={listPageSize} onChange={onListPageSizeChange} />
      {hasActiveFilters ? (
        <Button size="sm" variant="secondary" onClick={() => onQueueFiltersChange(defaultQueueFilters)}>
          Clear filters
        </Button>
      ) : null}
      <ColumnVisibilityMenu columns={orderingColumns} onChange={setOrderingColumns} />
    </div>
  )

  const orderingHeaders = [{ key: 'item', content: 'Item' as ReactNode }]
  if (orderingColumns.position) {
    orderingHeaders.unshift({ key: 'position', content: 'Position' })
  }
  if (orderingColumns.rule) {
    orderingHeaders.push({ key: 'rule', content: ruleHeader })
  }
  if (orderingColumns.instance) {
    orderingHeaders.push({ key: 'instance', content: instanceHeader })
  }
  if (orderingColumns.target) {
    orderingHeaders.push({ key: 'target', content: typeHeader })
  }
  if (orderingColumns.release) {
    orderingHeaders.push({ key: 'release', content: 'Release' })
  }
  if (orderingColumns.nextRun) {
    orderingHeaders.push({ key: 'next-run', content: 'Next run' })
  }
  if (orderingColumns.reason) {
    orderingHeaders.push({ key: 'reason', content: 'Reason' })
  }
  const queueList = useProgressiveList(queueEntries.length, listPageSize)
  const visibleQueueEntries = queueEntries.slice(0, queueList.visibleCount)
  const scheduleList = useProgressiveList(rules.length, listPageSize)
  const visibleRules = rules.slice(0, scheduleList.visibleCount)

  if (pane === 'schedule') {
    return (
      <div className="space-y-6">
        <ContentBlock
          title="Scheduler"
          subtitle="Rule timing, batch size, cooldown, and next run."
          action={<PageSizeControl value={listPageSize} onChange={onListPageSizeChange} />}
        >
          <ListResultsSummary shownCount={visibleRules.length} matchingCount={rules.length} totalCount={rules.length} />
          <TableFrame
            columns={[
              { key: 'rule', content: 'Rule' },
              { key: 'schedule', content: 'Schedule' },
              { key: 'batch', content: 'Batch' },
              { key: 'cooldown', content: 'Cooldown' },
              { key: 'next-run', content: 'Next run' }
            ]}
            rows={
              visibleRules.length > 0
                ? visibleRules.map((rule) => ({
                    key: `schedule-${rule.id}`,
                    cells: [
                      { key: 'rule', content: rule.name },
                      { key: 'schedule', content: formatMinutesInput(rule.cadenceMinutes) },
                      { key: 'batch', content: `${rule.batchSize}` },
                      { key: 'cooldown', content: formatHoursInput(rule.cooldownHours) },
                      {
                        key: 'next-run',
                        content: <span className="whitespace-nowrap">{formatDateCompact(rule.nextRunAt)}</span>
                      }
                    ]
                  }))
                : []
            }
            emptyTitle="No rules configured"
            emptyBody="Create a rule to start scheduling pokes."
          />
          <ProgressiveListFooter
            canLoadMore={scheduleList.canLoadMore}
            onLoadMore={scheduleList.loadMore}
            sentinelRef={scheduleList.sentinelRef}
            shownCount={visibleRules.length}
            totalCount={rules.length}
          />
        </ContentBlock>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ContentBlock
        title="Queue"
        subtitle="Full queue order produced by the background worker."
        action={orderingAction}
      >
        {hasActiveFilters ? (
          <QueueFilterSummary
            filters={queueFilters}
            onClearAll={() => onQueueFiltersChange(defaultQueueFilters)}
            onClearValue={(key, value) =>
              onQueueFiltersChange({
                ...queueFilters,
                [key]: queueFilters[key].filter((item) => item !== value)
              })
            }
          />
        ) : null}
        <ListResultsSummary
          shownCount={visibleQueueEntries.length}
          matchingCount={queueEntries.length}
          totalCount={allQueueEntries.length}
        />
        {issues.length > 0 ? <QueueIssuesPanel issues={issues} /> : null}
        <TableFrame
          columns={orderingHeaders}
          rows={
            visibleQueueEntries.length > 0
              ? visibleQueueEntries.map((entry, index) => {
                  const row: Array<{ key: string; content: ReactNode }> = [
                    {
                      key: 'item',
                      content: <QueueItemLink title={entry.title} url={entry.itemUrl} />
                    }
                  ]

                  if (orderingColumns.position) {
                    row.unshift({ key: 'position', content: index + 1 })
                  }
                  if (orderingColumns.rule) {
                    row.push(
                      {
                        key: 'rule',
                        content: (
                          <FilterValueButton
                            active={queueFilters.rules.includes(entry.rule)}
                            label={entry.rule}
                            onClick={() => setSingleFilter('rules', entry.rule)}
                          />
                        )
                      }
                    )
                  }
                  if (orderingColumns.instance) {
                    row.push(
                      {
                        key: 'instance',
                        content: (
                          <FilterValueButton
                            active={queueFilters.instances.includes(entry.source)}
                            label={entry.source}
                            onClick={() => setSingleFilter('instances', entry.source)}
                          />
                        )
                      }
                    )
                  }
                  if (orderingColumns.target) {
                    row.push(
                      {
                        key: 'target',
                        content: (
                          <FilterValueButton
                            active={queueFilters.targets.includes(entry.target)}
                            label={targetLabel(entry.target as RuleInput['targetKind'])}
                            onClick={() => setSingleFilter('targets', entry.target)}
                          />
                        )
                      }
                    )
                  }
                  if (orderingColumns.release) {
                    row.push(
                      {
                        key: 'release',
                        content: <span className="whitespace-nowrap">{entry.releaseDate}</span>
                      }
                    )
                  }
                  if (orderingColumns.nextRun) {
                    row.push(
                      {
                        key: 'next-run',
                        content: <span className="whitespace-nowrap">{entry.nextRun}</span>
                      }
                    )
                  }
                  if (orderingColumns.reason) {
                    row.push({ key: 'reason', content: entry.reason })
                  }

                  return {
                    key: entry.id,
                    cells: row
                  }
                })
              : []
          }
          emptyTitle="Queue is empty"
          emptyBody={
            issues.length > 0
              ? 'Queue data could not be loaded for one or more rules.'
              : hasActiveFilters
                ? 'No queue entries match the current filters.'
                : rules.length === 0
                  ? 'No rules exist yet, so there is nothing to queue.'
                  : 'Connect an instance and create a rule to populate the queue.'
          }
        />
        <ProgressiveListFooter
          canLoadMore={queueList.canLoadMore}
          onLoadMore={queueList.loadMore}
          sentinelRef={queueList.sentinelRef}
          shownCount={visibleQueueEntries.length}
          totalCount={queueEntries.length}
        />
      </ContentBlock>
    </div>
  )
}

export function QueueFilterSummary({
  filters,
  onClearValue,
  onClearAll
}: {
  filters: QueueFilterState
  onClearValue: (key: keyof QueueFilterState, value: string) => void
  onClearAll: () => void
}) {
  const entries: Array<{ key: keyof QueueFilterState; label: string; value: string; display: string }> = [
    ...filters.rules.map((value) => ({ key: 'rules' as const, label: 'Rule', value, display: value })),
    ...filters.instances.map((value) => ({ key: 'instances' as const, label: 'Instance', value, display: value })),
    ...filters.targets.map((value) => ({
      key: 'targets' as const,
      label: 'Type',
      value,
      display: targetLabel(value as RuleInput['targetKind'])
    }))
  ]

  if (entries.length === 0) {
    return null
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {entries.map((entry) => (
        <button
          key={`${entry.key}-${entry.value}`}
          className="inline-flex items-center gap-1 rounded-[2px] border border-[var(--line-strong)] bg-[var(--panel-soft)] px-2 py-1 text-[0.76rem] text-[var(--foreground-soft)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
          onClick={() => onClearValue(entry.key, entry.value)}
        >
          <span className="text-[var(--muted)]">{entry.label}:</span>
          <span>{entry.display}</span>
          <X size={12} />
        </button>
      ))}
      <button
        className="text-[0.78rem] text-[var(--accent)] transition hover:text-white"
        onClick={onClearAll}
      >
        Clear all
      </button>
    </div>
  )
}

export function FilterValueButton({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'rounded-[2px] px-1.5 py-0.5 text-left transition hover:bg-[rgba(255,255,255,0.06)]',
        active ? 'bg-[rgba(243,194,90,0.14)] text-[var(--accent-warm)]' : 'text-[var(--foreground)]'
      )}
      onClick={onClick}
      title="Click to filter by this value"
    >
      {label}
    </button>
  )
}

export function ColumnFilterMenu({
  label,
  options,
  selectedValues,
  onChange,
  formatOption = (value) => value,
  variant = 'toolbar'
}: {
  label: string
  options: string[]
  selectedValues: string[]
  onChange: (next: string[]) => void
  formatOption?: (value: string) => string
  variant?: 'toolbar' | 'header'
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; ready: boolean }>({
    top: 0,
    left: 0,
    ready: false
  })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const activeCount = selectedValues.length

  useLayoutEffect(() => {
    if (!open) {
      setPosition((current) => ({ ...current, ready: false }))
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) {
        return
      }

      const triggerRect = trigger.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const viewportPadding = 8
      let left = triggerRect.left
      let top = triggerRect.bottom + 6

      if (left + panelRect.width > window.innerWidth - viewportPadding) {
        left = Math.max(viewportPadding, window.innerWidth - panelRect.width - viewportPadding)
      }

      if (top + panelRect.height > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, triggerRect.top - panelRect.height - 6)
      }

      setPosition({ top, left, ready: true })
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }

    updatePosition()
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, options.length])

  return (
    <>
      <button
        ref={triggerRef}
        className={cn(
          variant === 'header'
            ? 'inline-flex items-center gap-1 rounded-[2px] px-0.5 py-0.5 text-left text-inherit transition hover:text-white'
            : 'inline-flex h-8 items-center gap-2 rounded-[2px] border px-2.5 text-[0.8rem] transition',
          variant === 'header'
            ? activeCount > 0
              ? 'text-[var(--accent-warm)]'
              : 'text-[var(--foreground-soft)]'
            : activeCount > 0
              ? 'border-[rgba(243,194,90,0.45)] bg-[rgba(243,194,90,0.1)] text-[var(--accent-warm)]'
              : 'border-[var(--line)] bg-[var(--panel)] text-[var(--foreground-soft)] hover:bg-[var(--panel-soft)]'
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {variant === 'header' ? (
          <>
            <span>{label}</span>
            <Funnel size={13} />
          </>
        ) : (
          <>
            <Funnel size={14} />
            <span>{label}</span>
          </>
        )}
        {activeCount > 0 ? (
          <span className="rounded-[2px] bg-[rgba(243,194,90,0.16)] px-1 py-px text-[0.68rem] font-semibold text-[var(--accent-warm)]">
            {activeCount}
          </span>
        ) : null}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[80] w-64 overflow-hidden rounded-[2px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
              style={{
                left: position.left,
                top: position.top,
                visibility: position.ready ? 'visible' : 'hidden'
              }}
            >
              <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
                <span className="text-[0.82rem] font-semibold text-[var(--foreground)]">{label}</span>
                <div className="flex items-center gap-2 text-[0.72rem]">
                  <button
                    className="text-[var(--muted)] transition hover:text-white"
                    onClick={() => onChange(options)}
                    type="button"
                  >
                    All
                  </button>
                  <button
                    className="text-[var(--muted)] transition hover:text-white"
                    onClick={() => onChange([])}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {options.length > 0 ? (
                  options.map((option) => {
                    const checked = selectedValues.includes(option)
                    return (
                      <label
                        key={option}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[0.8rem] text-[var(--foreground-soft)] transition hover:bg-[rgba(255,255,255,0.05)]"
                      >
                        <input
                          checked={checked}
                          className="h-3.5 w-3.5 accent-[var(--accent)]"
                          onChange={() => onChange(toggleFilterValue(selectedValues, option))}
                          type="checkbox"
                        />
                        <span className="truncate">{formatOption(option)}</span>
                      </label>
                    )
                  })
                ) : (
                  <div className="px-3 py-2 text-[0.78rem] text-[var(--muted)]">No values</div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export function ColumnVisibilityMenu({
  columns,
  onChange
}: {
  columns: Record<OrderingColumnKey, boolean>
  onChange: (next: Record<OrderingColumnKey, boolean>) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; ready: boolean }>({
    top: 0,
    left: 0,
    ready: false
  })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const options: Array<{ key: OrderingColumnKey; label: string }> = [
    { key: 'position', label: 'Position' },
    { key: 'rule', label: 'Rule' },
    { key: 'instance', label: 'Instance' },
    { key: 'target', label: 'Type' },
    { key: 'release', label: 'Release' },
    { key: 'nextRun', label: 'Next run' },
    { key: 'reason', label: 'Reason' }
  ]

  useLayoutEffect(() => {
    if (!open) {
      setPosition((current) => ({ ...current, ready: false }))
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) {
        return
      }

      const triggerRect = trigger.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const viewportPadding = 8
      let left = triggerRect.right - panelRect.width
      let top = triggerRect.bottom + 6

      if (left < viewportPadding) {
        left = viewportPadding
      }

      if (top + panelRect.height > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, triggerRect.top - panelRect.height - 6)
      }

      setPosition({ top, left, ready: true })
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && !triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    updatePosition()
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        className="inline-flex h-8 items-center justify-center rounded-[2px] border border-[var(--line)] bg-[var(--panel)] px-2 text-[var(--foreground-soft)] transition hover:bg-[var(--panel-soft)] hover:text-white"
        onClick={() => setOpen((current) => !current)}
        title="Choose columns"
        type="button"
      >
        <Settings2 size={15} />
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[80] w-56 overflow-hidden rounded-[2px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
              style={{
                left: position.left,
                top: position.top,
                visibility: position.ready ? 'visible' : 'hidden'
              }}
            >
              <div className="border-b border-[var(--line)] px-3 py-2 text-[0.82rem] font-semibold text-[var(--foreground)]">
                Columns
              </div>
              <div className="py-1">
                {options.map((option) => {
                  const enabledCount = options.filter((entry) => columns[entry.key]).length
                  const checked = columns[option.key]
                  const blocked = checked && enabledCount === 1
                  return (
                    <label
                      key={option.key}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 text-[0.8rem] transition',
                        blocked
                          ? 'cursor-not-allowed text-[var(--muted)]'
                          : 'cursor-pointer text-[var(--foreground-soft)] hover:bg-[rgba(255,255,255,0.05)]'
                      )}
                    >
                      <input
                        checked={checked}
                        className="h-3.5 w-3.5 accent-[var(--accent)]"
                        disabled={blocked}
                        onChange={() =>
                          onChange({
                            ...columns,
                            [option.key]: !checked
                          })
                        }
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export function RuleSortMenu({
  sort,
  onChange
}: {
  sort: RuleSortState
  onChange: (next: RuleSortState) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; ready: boolean }>({
    top: 0,
    left: 0,
    ready: false
  })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const options: Array<{ key: RuleSortKey; label: string; defaultDirection: 'asc' | 'desc' }> = [
    { key: 'createdAt', label: 'Added', defaultDirection: 'desc' },
    { key: 'updatedAt', label: 'Last edited', defaultDirection: 'desc' },
    { key: 'name', label: 'Name', defaultDirection: 'asc' }
  ]

  useLayoutEffect(() => {
    if (!open) {
      setPosition((current) => ({ ...current, ready: false }))
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) {
        return
      }

      const triggerRect = trigger.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const viewportPadding = 8
      let left = triggerRect.right - panelRect.width
      let top = triggerRect.bottom + 6

      if (left < viewportPadding) {
        left = viewportPadding
      }

      if (top + panelRect.height > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, triggerRect.top - panelRect.height - 6)
      }

      setPosition({ top, left, ready: true })
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && !triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    updatePosition()
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        className="inline-flex h-8 items-center gap-2 rounded-[2px] border border-[var(--line)] bg-[var(--panel)] px-2.5 text-[0.78rem] text-[var(--foreground-soft)] transition hover:bg-[var(--panel-soft)] hover:text-white"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ArrowUpDown size={14} />
        <span>{ruleSortLabel(sort)}</span>
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[80] w-52 overflow-hidden rounded-[2px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
              style={{
                left: position.left,
                top: position.top,
                visibility: position.ready ? 'visible' : 'hidden'
              }}
            >
              <div className="border-b border-[var(--line)] px-3 py-2 text-[0.82rem] font-semibold text-[var(--foreground)]">
                Sort rules
              </div>
              <div className="py-1">
                {options.map((option) => {
                  const active = sort.key === option.key
                  const direction = active ? sort.direction : option.defaultDirection
                  return (
                    <button
                      key={option.key}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-1.5 text-left text-[0.8rem] transition',
                        active
                          ? 'bg-[rgba(243,194,90,0.08)] text-[var(--foreground)]'
                          : 'text-[var(--foreground-soft)] hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                      )}
                      onClick={() => {
                        if (active) {
                          onChange({
                            key: option.key,
                            direction: sort.direction === 'asc' ? 'desc' : 'asc'
                          })
                        } else {
                          onChange({
                            key: option.key,
                            direction: option.defaultDirection
                          })
                        }
                        setOpen(false)
                      }}
                      type="button"
                    >
                      <span>{option.label}</span>
                      <span className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                        {direction}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export function InstanceSortMenu({
  sort,
  onChange
}: {
  sort: InstanceSortState
  onChange: (next: InstanceSortState) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; ready: boolean }>({
    top: 0,
    left: 0,
    ready: false
  })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const options: Array<{ key: InstanceSortKey; label: string; defaultDirection: 'asc' | 'desc' }> = [
    { key: 'createdAt', label: 'Added', defaultDirection: 'desc' },
    { key: 'updatedAt', label: 'Last edited', defaultDirection: 'desc' },
    { key: 'name', label: 'Name', defaultDirection: 'asc' }
  ]

  useLayoutEffect(() => {
    if (!open) {
      setPosition((current) => ({ ...current, ready: false }))
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) {
        return
      }

      const triggerRect = trigger.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const viewportPadding = 8
      let left = triggerRect.right - panelRect.width
      let top = triggerRect.bottom + 6

      if (left < viewportPadding) {
        left = viewportPadding
      }

      if (top + panelRect.height > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, triggerRect.top - panelRect.height - 6)
      }

      setPosition({ top, left, ready: true })
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && !triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    updatePosition()
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        className="inline-flex h-8 items-center gap-2 rounded-[2px] border border-[var(--line)] bg-[var(--panel)] px-2.5 text-[0.78rem] text-[var(--foreground-soft)] transition hover:bg-[var(--panel-soft)] hover:text-white"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ArrowUpDown size={14} />
        <span>{instanceSortLabel(sort)}</span>
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[80] w-52 overflow-hidden rounded-[2px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
              style={{
                left: position.left,
                top: position.top,
                visibility: position.ready ? 'visible' : 'hidden'
              }}
            >
              <div className="border-b border-[var(--line)] px-3 py-2 text-[0.82rem] font-semibold text-[var(--foreground)]">
                Sort instances
              </div>
              <div className="py-1">
                {options.map((option) => {
                  const active = sort.key === option.key
                  const direction = active ? sort.direction : option.defaultDirection
                  return (
                    <button
                      key={option.key}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-1.5 text-left text-[0.8rem] transition',
                        active
                          ? 'bg-[rgba(243,194,90,0.08)] text-[var(--foreground)]'
                          : 'text-[var(--foreground-soft)] hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                      )}
                      onClick={() => {
                        if (active) {
                          onChange({
                            key: option.key,
                            direction: sort.direction === 'asc' ? 'desc' : 'asc'
                          })
                        } else {
                          onChange({
                            key: option.key,
                            direction: option.defaultDirection
                          })
                        }
                        setOpen(false)
                      }}
                      type="button"
                    >
                      <span>{option.label}</span>
                      <span className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                        {direction}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export function QueueItemLink({ title, url }: { title: string; url: string | null }) {
  if (!url) {
    return <span>{title}</span>
  }

  return (
    <a
      className="inline-flex items-center gap-1 text-[var(--foreground)] transition hover:text-[var(--accent)] hover:underline"
      href={url}
      rel="noreferrer"
      target="_blank"
      title="Open in the connected service"
    >
      <span>{title}</span>
      <ArrowUpRight size={13} className="shrink-0" />
    </a>
  )
}

export function QueueIssuesPanel({ issues }: { issues: QueueIssue[] }) {
  return (
    <div className="mb-4 rounded-[2px] border border-[rgba(243,194,90,0.35)] bg-[rgba(243,194,90,0.08)] px-4 py-3 text-sm text-[var(--foreground-soft)]">
      <div className="font-semibold text-[var(--warning)]">Queue data is partially unavailable</div>
      <div className="mt-1">
        One or more rules could not load queue data from their connected service.
      </div>
      <ul className="mt-3 space-y-1.5">
        {issues.map((issue) => (
          <li
            key={`${issue.ruleId}-${issue.instanceId}`}
            className="flex flex-wrap gap-x-2 gap-y-1"
          >
            <span className="font-medium text-[var(--foreground)]">{issue.ruleName}</span>
            <span className="text-[var(--line-strong)]">·</span>
            <span>{issue.instanceName}</span>
            <span className="text-[var(--line-strong)]">·</span>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RunsContent({
  runs,
  totalRuns,
  listPageSize,
  onListPageSizeChange
}: {
  runs: AppState['runs']
  totalRuns: number
  listPageSize: ListPageSize
  onListPageSizeChange: (next: ListPageSize) => void
}) {
  const { canLoadMore, loadMore, sentinelRef, visibleCount } = useProgressiveList(runs.length, listPageSize)
  const visibleRuns = runs.slice(0, visibleCount)

  return (
    <div className="space-y-6">
      <ContentBlock
        title="Run History"
        subtitle="Recorded manual and scheduled runs."
        action={<PageSizeControl value={listPageSize} onChange={onListPageSizeChange} />}
      >
        <ListResultsSummary shownCount={visibleRuns.length} matchingCount={runs.length} totalCount={totalRuns} />
        <TableFrame
          columns={[
            { key: 'run', content: 'Run' },
            { key: 'started', content: 'Started' },
            { key: 'trigger', content: 'Trigger' },
            { key: 'status', content: 'Status' },
            { key: 'selected', content: 'Selected' },
            { key: 'dispatched', content: 'Dispatched' },
            { key: 'summary', content: 'Summary' }
          ]}
          rows={
            visibleRuns.length > 0
              ? visibleRuns.map((run) => ({
                  key: `run-${run.id}`,
                  cells: [
                    { key: 'run', content: `#${run.id}` },
                    { key: 'started', content: formatDate(run.startedAt) },
                    { key: 'trigger', content: run.trigger },
                    { key: 'status', content: run.status },
                    { key: 'selected', content: `${run.selectedCount}` },
                    { key: 'dispatched', content: `${run.dispatchedCount}` },
                    { key: 'summary', content: run.summary }
                  ]
                }))
              : []
          }
          emptyTitle="No runs logged"
          emptyBody="Record the first run from a rule to start building activity history."
        />
        <ProgressiveListFooter
          canLoadMore={canLoadMore}
          onLoadMore={loadMore}
          sentinelRef={sentinelRef}
          shownCount={visibleRuns.length}
          totalCount={runs.length}
        />
      </ContentBlock>
    </div>
  )
}

export function SystemContent({
  state,
  scanStatus,
  pane,
  backups,
  onCreate,
  onQueueRebuild,
  onRunFullScan,
  onListPageSizeChange,
  onRestore,
  restoringBackupId,
  scanActionPending,
  listPageSize
}: {
  state: AppState
  scanStatus: ScanStatusResponse | null
  pane: string
  backups: AppState['backups']
  onCreate: () => void
  onQueueRebuild: () => void
  onRunFullScan: (instanceId?: number) => void
  onListPageSizeChange: (next: ListPageSize) => void
  onRestore: (id: number) => void
  restoringBackupId: number | null
  scanActionPending: boolean
  listPageSize: ListPageSize
}) {
  const worker = scanStatus?.worker ?? null
  const scanInstances = scanStatus?.instances ?? []
  const scanRuns = scanStatus?.runs ?? []
  const logRows = [
    ...scanRuns.map((run) => ({
      at: run.startedAt,
      type: 'Scan',
      summary: run.summary
    })),
    ...state.runs.map((run) => ({
      at: run.startedAt,
      type: 'Run',
      summary: run.summary || `${run.status} via ${run.trigger}`
    })),
    ...state.backups.map((backup) => ({
      at: backup.createdAt,
      type: backup.trigger === 'pre_restore' ? 'Safety backup' : 'Backup',
      summary: `Local ${backup.trigger === 'scheduled' ? 'scheduled' : backup.trigger === 'pre_restore' ? 'pre-restore' : 'manual'} backup saved to ${backup.path}`
    })),
    ...state.backups
      .filter((backup) => Boolean(backup.restoreResult))
      .map((backup) => ({
        at: backup.restoredAt ?? backup.createdAt,
        type: 'Restore',
        summary: backup.restoreResult ?? `Backup #${backup.id} restored`
      }))
  ].sort((left, right) => right.at.localeCompare(left.at))
  const logsList = useProgressiveList(logRows.length, listPageSize)
  const visibleLogRows = logRows.slice(0, logsList.visibleCount)
  const backupsList = useProgressiveList(backups.length, listPageSize)
  const visibleBackups = backups.slice(0, backupsList.visibleCount)
  const scanRunsList = useProgressiveList(scanRuns.length, listPageSize)
  const visibleScanRuns = scanRuns.slice(0, scanRunsList.visibleCount)

  if (pane === 'logs') {

    return (
      <div className="space-y-6">
        <ContentBlock
          title="Logs"
          subtitle="Recent run, backup, and restore events."
          action={<PageSizeControl value={listPageSize} onChange={onListPageSizeChange} />}
        >
          <ListResultsSummary shownCount={visibleLogRows.length} matchingCount={logRows.length} totalCount={logRows.length} />
          <TableFrame
            columns={[
              { key: 'when', content: 'When' },
              { key: 'type', content: 'Type' },
              { key: 'summary', content: 'Summary' }
            ]}
            rows={visibleLogRows.map((entry, index) => ({
              key: `log-${entry.at}-${entry.type}-${index}`,
              cells: [
                { key: 'when', content: formatDate(entry.at) },
                { key: 'type', content: entry.type },
                { key: 'summary', content: entry.summary }
              ]
            }))}
            emptyTitle="No system events yet"
            emptyBody="Runs and backups appear here when activity is recorded."
          />
          <ProgressiveListFooter
            canLoadMore={logsList.canLoadMore}
            onLoadMore={logsList.loadMore}
            sentinelRef={logsList.sentinelRef}
            shownCount={visibleLogRows.length}
            totalCount={logRows.length}
          />
        </ContentBlock>
      </div>
    )
  }

  if (pane === 'scans') {
    return (
      <div className="space-y-6">
        <ContentBlock
          title="Scan History"
          subtitle="Background and manual scan runs, with current worker state."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <PageSizeControl value={listPageSize} onChange={onListPageSizeChange} />
              <Button disabled={scanActionPending} variant="secondary" onClick={onQueueRebuild}>
                <RefreshCw size={16} className="mr-2" />
                Rebuild queue
              </Button>
              <Button disabled={scanActionPending} onClick={() => onRunFullScan()}>
                <RefreshCw size={16} className="mr-2" />
                Scan now
              </Button>
            </div>
          }
        >
          <Card className="mb-4">
            <CardContent className="grid gap-3 py-4 text-sm text-[var(--foreground-soft)] md:grid-cols-3">
              <InfoLine label="Worker" value={worker ? worker.state.replace('_', ' ') : 'Unavailable'} />
              <InfoLine label="Backlog" value={worker ? String(worker.queueLength) : '0'} />
              <InfoLine
                label="Queue snapshot"
                value={formatDateCompact(scanStatus?.queueUpdatedAt ?? null)}
              />
            </CardContent>
          </Card>
          <ListResultsSummary shownCount={visibleScanRuns.length} matchingCount={scanRuns.length} totalCount={scanRuns.length} />
          <TableFrame
            columns={[
              { key: 'instance', content: 'Instance' },
              { key: 'kind', content: 'Kind' },
              { key: 'trigger', content: 'Trigger' },
              { key: 'status', content: 'Status' },
              { key: 'started', content: 'Started' },
              { key: 'duration', content: 'Duration' },
              { key: 'work', content: 'Work' },
              { key: 'summary', content: 'Summary' }
            ]}
            rows={
              visibleScanRuns.length > 0
                ? visibleScanRuns.map((run) => {
                    const instanceName =
                      state.instances.find((instance) => instance.id === run.instanceId)?.name ?? `#${run.instanceId}`

                    return {
                      key: `scan-run-${run.id}`,
                      cells: [
                        { key: 'instance', content: instanceName },
                        { key: 'kind', content: run.kind },
                        { key: 'trigger', content: run.trigger.replace('_', ' ') },
                        {
                          key: 'status',
                          content: <Badge variant={run.status === 'completed' ? 'success' : 'danger'}>{run.status}</Badge>
                        },
                        { key: 'started', content: formatDate(run.startedAt) },
                        { key: 'duration', content: formatRunDuration(run.startedAt, run.endedAt) },
                        {
                          key: 'work',
                          content: `${run.updatedItems}/${run.totalItems} updated${run.skippedItems > 0 ? `, ${run.skippedItems} deferred` : ''}`
                        },
                        { key: 'summary', content: run.summary }
                      ]
                    }
                  })
                : []
            }
            emptyTitle="No scans recorded"
            emptyBody="The worker will add history here once it starts scanning instances."
          />
          <ProgressiveListFooter
            canLoadMore={scanRunsList.canLoadMore}
            onLoadMore={scanRunsList.loadMore}
            sentinelRef={scanRunsList.sentinelRef}
            shownCount={visibleScanRuns.length}
            totalCount={scanRuns.length}
          />
        </ContentBlock>
      </div>
    )
  }

  if (pane === 'backups') {
    return (
      <div className="space-y-6">
        <ContentBlock
          title="Backup History"
          subtitle="Current settings and stored backup snapshots."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <PageSizeControl value={listPageSize} onChange={onListPageSizeChange} />
              <Button onClick={onCreate}>
                <Database size={16} className="mr-2" />
                Backup now
              </Button>
            </div>
          }
        >
          <ListResultsSummary shownCount={visibleBackups.length} matchingCount={backups.length} totalCount={state.backups.length} />
          <Card className="mb-4">
            <CardContent className="grid gap-3 py-4 text-sm text-[var(--foreground-soft)] md:grid-cols-3">
              <InfoLine label="Schedule" value={state.settings.backupSchedule} />
              <InfoLine label="Retention" value={`${state.settings.backupRetentionDays} days`} />
              <InfoLine label="Stored backups" value={String(state.backups.length)} />
            </CardContent>
          </Card>
          <TableFrame
            columns={[
              { key: 'backup', content: 'Backup' },
              { key: 'trigger', content: 'Trigger' },
              { key: 'created', content: 'Created' },
              { key: 'restored', content: 'Restored' },
              { key: 'size', content: 'Size' },
              { key: 'result', content: 'Result' },
              { key: 'path', content: 'Path' },
              { key: 'action', content: 'Action' }
            ]}
            rows={
              visibleBackups.length > 0
                ? visibleBackups.map((backup) => ({
                    key: `backup-${backup.id}`,
                    cells: [
                      { key: 'backup', content: `#${backup.id}` },
                      {
                        key: 'trigger',
                        content: backup.trigger === 'pre_restore' ? 'pre-restore' : backup.trigger
                      },
                      { key: 'created', content: formatDate(backup.createdAt) },
                      { key: 'restored', content: formatDateCompact(backup.restoredAt) },
                      { key: 'size', content: formatBytes(backup.sizeBytes) },
                      { key: 'result', content: backup.restoreResult ?? 'Not restored yet' },
                      { key: 'path', content: backup.path },
                      {
                        key: 'action',
                        content: (
                          <Button
                            disabled={restoringBackupId !== null}
                            size="sm"
                            variant="secondary"
                            onClick={() => onRestore(backup.id)}
                          >
                            {restoringBackupId === backup.id ? (
                              <RefreshCw size={14} className="animate-spin" />
                            ) : (
                              'Restore'
                            )}
                          </Button>
                        )
                      }
                    ]
                  }))
                : []
            }
            emptyTitle="No backups created"
            emptyBody="Create a backup to store the first local snapshot."
          />
          <ProgressiveListFooter
            canLoadMore={backupsList.canLoadMore}
            onLoadMore={backupsList.loadMore}
            sentinelRef={backupsList.sentinelRef}
            shownCount={visibleBackups.length}
            totalCount={backups.length}
          />
        </ContentBlock>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ContentBlock
        title="Status"
        subtitle="Runtime, scan worker, and per-instance cache state."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button disabled={scanActionPending} variant="secondary" onClick={onQueueRebuild}>
              <RefreshCw size={16} className="mr-2" />
              Rebuild queue
            </Button>
            <Button disabled={scanActionPending} onClick={() => onRunFullScan()}>
              <RefreshCw size={16} className="mr-2" />
              Scan now
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 py-4 text-sm text-[var(--foreground-soft)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={worker ? scanWorkerVariant(worker.state) : 'neutral'}>
                  {worker ? worker.state.replace('_', ' ') : 'worker unavailable'}
                </Badge>
                {worker?.activeJob ? (
                  <Badge variant="warning">{worker.activeJob.kind}</Badge>
                ) : null}
              </div>
              <InfoLine label="Mode" value={state.app.mode} />
              <InfoLine label="Version" value={state.app.version} />
              <InfoLine label="Queue snapshot" value={formatDateCompact(scanStatus?.queueUpdatedAt ?? null)} />
              <InfoLine label="Last queue rebuild" value={formatDateCompact(worker?.lastQueueRebuildAt ?? null)} />
              <InfoLine label="Queue backlog" value={String(worker?.queueLength ?? 0)} />
              <InfoLine
                label="Detail concurrency"
                value={
                  worker ? `${worker.detailConcurrency} workers, batch ${worker.detailBatchSize}` : 'Unavailable'
                }
              />
              <InfoLine
                label="Current job"
                value={
                  worker?.activeJob
                    ? `${worker.activeJob.instanceName} · ${worker.activeJob.phase}`
                    : 'Idle'
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 py-4 text-sm text-[var(--foreground-soft)]">
              <InfoLine label="Connected instances" value={String(state.instances.length)} />
              <InfoLine label="Enabled rules" value={String(state.rules.filter((item) => item.enabled).length)} />
              <InfoLine label="Recorded runs" value={String(state.runs.length)} />
              <InfoLine label="Stored backups" value={String(state.backups.length)} />
              <InfoLine label="Backup schedule" value={state.settings.backupSchedule} />
              <InfoLine label="Retention" value={`${state.settings.backupRetentionDays} days`} />
              <InfoLine
                label="Notifications"
                value={state.settings.notifications.notificationUrl ? 'Configured' : 'Disabled'}
              />
              <InfoLine
                label="Worker error"
                value={worker?.lastError ?? 'None'}
              />
            </CardContent>
          </Card>
        </div>
        {worker?.activeJob ? (
          <Card className="mt-4">
            <CardContent className="space-y-3 py-4 text-sm text-[var(--foreground-soft)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">Active job</Badge>
                <span className="font-semibold text-[var(--foreground)]">{worker.activeJob.instanceName}</span>
              </div>
              <InfoLine label="Phase" value={worker.activeJob.phase} />
              <InfoLine label="Current item" value={worker.activeJob.currentItem ?? 'Waiting'} />
              <InfoLine
                label="Progress"
                value={`${worker.activeJob.updatedItems}/${worker.activeJob.totalItems} updated`}
              />
              <InfoLine label="Started" value={formatDate(worker.activeJob.startedAt)} />
            </CardContent>
          </Card>
        ) : null}
        <div className="mt-4">
          <TableFrame
            columns={[
              { key: 'instance', content: 'Instance' },
              { key: 'snapshot', content: 'Snapshot' },
              { key: 'last-scan', content: 'Last scan' },
              { key: 'next-scan', content: 'Next scan' },
              { key: 'coverage', content: 'Coverage' },
              { key: 'error', content: 'Issue' },
              { key: 'action', content: 'Action' }
            ]}
            rows={
              scanInstances.length > 0
                ? scanInstances.map((entry) => ({
                    key: `scan-instance-${entry.instanceId}`,
                    cells: [
                      {
                        key: 'instance',
                        content: (
                          <div className="space-y-1">
                            <div className="font-semibold text-[var(--foreground)]">{entry.instanceName}</div>
                            <div className="text-[0.78rem] text-[var(--muted)]">{entry.instanceKind}</div>
                          </div>
                        )
                      },
                      {
                        key: 'snapshot',
                        content: (
                          <Badge variant={scanSnapshotVariant(entry.snapshotState)}>
                            {entry.snapshotState}
                          </Badge>
                        )
                      },
                      { key: 'last-scan', content: formatDateCompact(entry.lastScanAt) },
                      { key: 'next-scan', content: formatDateCompact(entry.nextScanAt) },
                      {
                        key: 'coverage',
                        content:
                          entry.eligibleEntityCount === 0
                            ? 'No rule-tracked items'
                            : `${entry.cachedEntityCount}/${entry.eligibleEntityCount} cached, ${entry.pendingEntityCount} pending`
                      },
                      { key: 'error', content: entry.lastError ?? 'None' },
                      {
                        key: 'action',
                        content: (
                          <Button
                            disabled={scanActionPending || !entry.enabled}
                            size="sm"
                            variant="secondary"
                            onClick={() => onRunFullScan(entry.instanceId)}
                          >
                            Scan now
                          </Button>
                        )
                      }
                    ]
                  }))
                : []
            }
            emptyTitle="No scan state yet"
            emptyBody="Add and validate an instance to start the background scanner."
          />
        </div>
      </ContentBlock>
    </div>
  )
}

export function SettingsContent({
  state,
  pane,
  settingsForm,
  backupRetentionInput,
  backupRetentionError,
  backupScheduleInput,
  backupScheduleError,
  notificationValidation,
  notificationTestPending,
  notificationTestState,
  onBackupRetentionInputChange,
  onBackupScheduleInputChange,
  onTestNotifications,
  onSettingsFormChange
}: {
  state: AppState
  pane: string
  settingsForm: SettingsUpdate
  backupRetentionInput: string
  backupRetentionError: string | null
  backupScheduleInput: string
  backupScheduleError: string | null
  notificationValidation: NotificationValidationState
  notificationTestPending: boolean
  notificationTestState: InlineTestState | null
  onBackupRetentionInputChange: (next: string) => void
  onBackupScheduleInputChange: (next: string) => void
  onTestNotifications: () => void
  onSettingsFormChange: (next: SettingsUpdate) => void
}) {
  if (pane === 'backups') {
    return (
      <div className="space-y-6">
        <ContentBlock title="Backup Configuration" subtitle="Backup retention and schedule.">
          <Card>
            <CardContent className="space-y-3">
              <FormRow label="Retention days" hint="Used immediately when pruning old backup files">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={backupRetentionInput}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    if (!/^\d*$/.test(nextValue)) {
                      return
                    }

                    onBackupRetentionInputChange(nextValue)
                    if (nextValue === '') {
                      return
                    }

                    const parsed = Number(nextValue)
                    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650) {
                      onSettingsFormChange({
                        ...settingsForm,
                        backupRetentionDays: parsed
                      })
                    }
                  }}
                />
                {backupRetentionError ? <FieldFeedback tone="danger">{backupRetentionError}</FieldFeedback> : null}
              </FormRow>
              <FormRow label="Backup schedule" hint="Cron expression, for example 0 3 * * *">
                <Input
                  value={backupScheduleInput}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    onBackupScheduleInputChange(nextValue)

                    const trimmed = nextValue.trim()
                    if (trimmed !== '' && isValidCronExpression(trimmed)) {
                      onSettingsFormChange({
                        ...settingsForm,
                        backupSchedule: trimmed
                      })
                    }
                  }}
                  placeholder="0 3 * * *"
                />
                {backupScheduleError ? <FieldFeedback tone="danger">{backupScheduleError}</FieldFeedback> : null}
              </FormRow>
            </CardContent>
          </Card>
        </ContentBlock>
      </div>
    )
  }
  if (pane === 'notifications') {
    return (
      <div className="space-y-6">
        <ContentBlock title="Notifications" subtitle="Choose where notifications go and which events send them.">
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3">
                <FieldBlock
                  label="Notification URL"
                  hint="Leave blank to disable notifications."
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      value={settingsForm.notifications.notificationUrl ?? ''}
                      onChange={(event) =>
                        onSettingsFormChange({
                          ...settingsForm,
                          notifications: {
                            ...settingsForm.notifications,
                            notificationUrl: event.target.value
                          }
                        })
                      }
                      placeholder="discord://..., mailto://..., https://discord.com/api/webhooks/..."
                    />
                    <Button
                      variant="secondary"
                      className="md:self-start"
                      disabled={
                        !settingsForm.notifications.notificationUrl?.trim() ||
                        notificationValidation.status === 'validating' ||
                        notificationValidation.status === 'invalid' ||
                        notificationTestPending
                      }
                      onClick={onTestNotifications}
                    >
                      <span className="inline-flex items-center gap-2">
                        {notificationTestPending ? <RefreshCw size={14} className="animate-spin" /> : null}
                        {notificationTestPending ? 'Testing' : 'Test'}
                      </span>
                    </Button>
                  </div>
                  {notificationValidation.status === 'invalid' && notificationValidation.message ? (
                    <FieldFeedback tone="danger">{notificationValidation.message}</FieldFeedback>
                  ) : null}
                  {notificationValidation.status !== 'invalid' && notificationTestState ? (
                    <FieldFeedback tone={notificationTestState.tone}>{notificationTestState.message}</FieldFeedback>
                  ) : null}
                </FieldBlock>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <SettingsGroupCard
                subtitle="Choose which rule run outcomes send a notification."
                title="Rule Runs"
              >
                <SettingsToggleRow
                  checked={settingsForm.notifications.runSuccess}
                  description="Send a notification when a rule run completes successfully."
                  label="Run success"
                  onCheckedChange={(checked) =>
                    onSettingsFormChange({
                      ...settingsForm,
                      notifications: {
                        ...settingsForm.notifications,
                        runSuccess: checked
                      }
                    })
                  }
                />
                <SettingsToggleRow
                  checked={settingsForm.notifications.runFailure}
                  description="Send a notification when a rule run fails."
                  label="Run failure"
                  onCheckedChange={(checked) =>
                    onSettingsFormChange({
                      ...settingsForm,
                      notifications: {
                        ...settingsForm.notifications,
                        runFailure: checked
                      }
                    })
                  }
                />
              </SettingsGroupCard>

              <SettingsGroupCard
                subtitle="Choose which backup outcomes send a notification."
                title="Backups"
              >
                <SettingsToggleRow
                  checked={settingsForm.notifications.backupSuccess}
                  description="Send a notification when a backup finishes successfully."
                  label="Backup success"
                  onCheckedChange={(checked) =>
                    onSettingsFormChange({
                      ...settingsForm,
                      notifications: {
                        ...settingsForm.notifications,
                        backupSuccess: checked
                      }
                    })
                  }
                />
                <SettingsToggleRow
                  checked={settingsForm.notifications.backupFailure}
                  description="Send a notification when a backup fails."
                  label="Backup failure"
                  onCheckedChange={(checked) =>
                    onSettingsFormChange({
                      ...settingsForm,
                      notifications: {
                        ...settingsForm.notifications,
                        backupFailure: checked
                      }
                    })
                  }
                  />
                </SettingsGroupCard>

              <SettingsGroupCard
                subtitle="Choose whether connection problems and recoveries send a notification."
                title="Instance Health"
              >
                <SettingsToggleRow
                  checked={settingsForm.notifications.instanceConnectionLost}
                  description="Send a notification when an instance becomes unreachable."
                  label="Connection lost"
                  onCheckedChange={(checked) =>
                    onSettingsFormChange({
                      ...settingsForm,
                      notifications: {
                        ...settingsForm.notifications,
                        instanceConnectionLost: checked
                      }
                    })
                  }
                />
                <SettingsToggleRow
                  checked={settingsForm.notifications.instanceConnectionRestored}
                  description="Send a notification when an instance becomes reachable again."
                  label="Connection restored"
                  onCheckedChange={(checked) =>
                    onSettingsFormChange({
                      ...settingsForm,
                      notifications: {
                        ...settingsForm.notifications,
                        instanceConnectionRestored: checked
                      }
                    })
                  }
                />
              </SettingsGroupCard>
            </div>
          </div>
        </ContentBlock>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ContentBlock title="General" subtitle="Current saved configuration.">
        <Card>
          <CardContent className="space-y-3 text-sm text-[var(--foreground-soft)]">
            <InfoLine label="Mode" value={state.app.mode} />
            <InfoLine label="Version" value={state.app.version} />
            <InfoLine label="Backup schedule" value={state.settings.backupSchedule} />
            <InfoLine label="Retention" value={`${state.settings.backupRetentionDays} days`} />
            <InfoLine label="Notifications configured" value={state.settings.notifications.notificationUrl ? 'Yes' : 'No'} />
          </CardContent>
        </Card>
      </ContentBlock>
    </div>
  )
}
