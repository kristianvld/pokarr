import { useDeferredValue, useEffect, useState } from 'react'
import { Database, LogOut, Plus, RefreshCw, Save, Search } from 'lucide-react'
import {
  useAppStateQuery,
  useQueueSnapshotQuery
} from '@/client/api/appState'
import {
  useCreateBackupMutation,
  useRestoreBackupMutation
} from '@/client/api/backups'
import {
  useRebuildQueueMutation,
  useRunScanMutation,
  useScanStatusQuery
} from '@/client/api/scans'
import {
  useCreateInstanceMutation,
  useDeleteInstanceMutation,
  useInstanceConnectionQuery,
  useTestInstanceMutation,
  useUpdateInstanceMutation,
  useValidateInstanceMutation
} from '@/client/api/instances'
import {
  useCreateRuleMutation,
  useDeleteRuleMutation,
  useRefreshRuleMutation,
  useRunRuleMutation,
  useToggleRuleMutation,
  useUpdateRuleMutation
} from '@/client/api/rules'
import {
  useNotificationTestMutation,
  useNotificationValidationQuery,
  useSaveSettingsMutation
} from '@/client/api/settings'
import { useDebouncedValue } from '@/client/hooks/useDebouncedValue'
import {
  applyQueueFilters,
  browserPreferenceKeys,
  buildRuleDraft,
  buildQueueEntries,
  buildSettingsForm,
  compareInstances,
  compareRules,
  defaultInstanceForm,
  defaultInstanceSort,
  defaultListPageSize,
  defaultPaneState,
  defaultRuleSort,
  defaultQueueFilters,
  isListPageSize,
  isRuleSortState,
  isInstanceSortState,
  matchesSearch,
  readBrowserPreference,
  sectionMeta,
  type InlineTestState,
  type InstanceSortState,
  type ListPageSize,
  type NoticeItem,
  type NotificationValidationState,
  type RuleSortState,
  type QueueFilterState,
  type SectionMeta,
  type ScopedMessage,
  type SectionId,
  type ToolbarAction,
  writeBrowserPreference
} from '@/client/features/app/support'
import {
  BrandIcon,
  BrandMark,
  InlineNotice,
  LoadingShell,
  NavCount,
  SidebarNoticeDock,
  ToolbarActionButton
} from '@/client/features/app/shared'
import { InstanceEditorDialog, RuleEditorDialog } from '@/client/features/app/dialogs'
import {
  InstancesContent,
  OverviewContent,
  RulesContent,
  QueueContent,
  RunsContent,
  SettingsContent,
  SystemContent
} from '@/client/features/app/sections'
import { formatDate } from '@/client/lib/utils'
import type { AuthSession, RuleInput, SettingsUpdate } from '@/shared/models'
import { isValidCronExpression } from '@/shared/models'
export function AuthenticatedApp({
  authSession,
  loggingOut,
  onLogout
}: {
  authSession: AuthSession
  loggingOut: boolean
  onLogout: () => Promise<void>
}) {
  const [section, setSection] = useState<SectionId>('dashboard')
  const [paneBySection, setPaneBySection] = useState<Record<SectionId, string>>(defaultPaneState)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery.trim())
  const [flash, setFlash] = useState<ScopedMessage | null>(null)
  const [error, setError] = useState<ScopedMessage | null>(null)
  const [instanceForm, setInstanceForm] = useState(defaultInstanceForm)
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false)
  const [editingInstanceId, setEditingInstanceId] = useState<number | null>(null)
  const [instanceTestState, setInstanceTestState] = useState<InlineTestState | null>(null)
  const [instanceSort, setInstanceSort] = useState<InstanceSortState>(() =>
    readBrowserPreference(browserPreferenceKeys.instanceSort, defaultInstanceSort, isInstanceSortState)
  )
  const [listPageSize, setListPageSize] = useState<ListPageSize>(() =>
    readBrowserPreference(browserPreferenceKeys.listPageSize, defaultListPageSize, isListPageSize)
  )
  const [ruleForm, setRuleForm] = useState<RuleInput>(() => buildRuleDraft())
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [ruleRefreshPendingIds, setRuleRefreshPendingIds] = useState<number[]>([])
  const [restorePendingId, setRestorePendingId] = useState<number | null>(null)
  const [queueFilters, setQueueFilters] = useState<QueueFilterState>(defaultQueueFilters)
  const [ruleSort, setRuleSort] = useState<RuleSortState>(() =>
    readBrowserPreference(browserPreferenceKeys.ruleSort, defaultRuleSort, isRuleSortState)
  )
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [settingsForm, setSettingsForm] = useState<SettingsUpdate>(() => buildSettingsForm())
  const [backupRetentionInput, setBackupRetentionInput] = useState(() => String(buildSettingsForm().backupRetentionDays))
  const [backupScheduleInput, setBackupScheduleInput] = useState(() => buildSettingsForm().backupSchedule)
  const [notificationTestState, setNotificationTestState] = useState<InlineTestState | null>(null)
  const stateQuery = useAppStateQuery()
  const queueQuery = useQueueSnapshotQuery()
  const scanStatusQuery = useScanStatusQuery()
  const createInstanceMutation = useCreateInstanceMutation()
  const updateInstanceMutation = useUpdateInstanceMutation()
  const deleteInstanceMutation = useDeleteInstanceMutation()
  const testInstanceMutation = useTestInstanceMutation()
  const validateInstanceMutation = useValidateInstanceMutation()
  const createRuleMutation = useCreateRuleMutation()
  const updateRuleMutation = useUpdateRuleMutation()
  const deleteRuleMutation = useDeleteRuleMutation()
  const toggleRuleMutation = useToggleRuleMutation()
  const runRuleMutation = useRunRuleMutation()
  const refreshRuleMutation = useRefreshRuleMutation()
  const createBackupMutation = useCreateBackupMutation()
  const restoreBackupMutation = useRestoreBackupMutation()
  const runScanMutation = useRunScanMutation()
  const rebuildQueueMutation = useRebuildQueueMutation()
  const saveSettingsMutation = useSaveSettingsMutation()
  const notificationTestMutation = useNotificationTestMutation()
  const editingInstanceQuery = useInstanceConnectionQuery(
    editingInstanceId,
    instanceDialogOpen && editingInstanceId !== null
  )
  const debouncedNotificationUrl = useDebouncedValue(settingsForm.notifications.notificationUrl?.trim() ?? '', 250)
  const notificationValidationQuery = useNotificationValidationQuery(
    debouncedNotificationUrl || null,
    debouncedNotificationUrl.length > 0
  )
  const state = stateQuery.data ?? null
  const scanStatus = scanStatusQuery.data ?? null
  const loading = stateQuery.isPending && !state
  const queueItems = queueQuery.data?.items ?? []
  const queueIssues = queueQuery.data?.issues ?? []
  const instanceTestPending = testInstanceMutation.isPending
  const notificationTestPending = notificationTestMutation.isPending
  const notificationValidation: NotificationValidationState =
    debouncedNotificationUrl.length === 0
      ? {
          status: 'idle',
          message: null
        }
      : notificationValidationQuery.isPending
        ? {
            status: 'validating',
            message: null
          }
        : notificationValidationQuery.isError
          ? {
              status: 'invalid',
              message:
                notificationValidationQuery.error instanceof Error
                  ? notificationValidationQuery.error.message
                  : 'Notification URL validation failed.'
            }
          : notificationValidationQuery.data
            ? {
                status: 'valid',
                message: null
              }
            : {
                status: 'idle',
                message: null
              }

  useEffect(() => {
    writeBrowserPreference(browserPreferenceKeys.instanceSort, instanceSort)
  }, [instanceSort])

  useEffect(() => {
    writeBrowserPreference(browserPreferenceKeys.ruleSort, ruleSort)
  }, [ruleSort])

  useEffect(() => {
    writeBrowserPreference(browserPreferenceKeys.listPageSize, listPageSize)
  }, [listPageSize])

  function showFlash(message: string, targetSection: SectionId) {
    setFlash({
      id: Date.now(),
      message,
      section: targetSection
    })
  }

  function showError(message: string, targetSection: SectionId) {
    setError({
      id: Date.now(),
      message,
      section: targetSection
    })
  }

  async function refresh() {
    setError(null)

    try {
      await Promise.all([
        stateQuery.refetch(),
        queueQuery.refetch(),
        scanStatusQuery.refetch()
      ])
    } catch (fetchError) {
      showError(fetchError instanceof Error ? fetchError.message : 'Failed to load state', section)
    }
  }

  useEffect(() => {
    if (!state) {
      return
    }

    setSettingsForm(buildSettingsForm(state.settings))
    setBackupRetentionInput(String(state.settings.backupRetentionDays))
    setBackupScheduleInput(state.settings.backupSchedule)
    setRuleForm((current) => {
      if (current.instanceId !== 0 || state.instances.length === 0) {
        return current
      }

      return buildRuleDraft(state.instances[0]?.id, state.instances[0]?.kind)
    })
  }, [state])

  useEffect(() => {
    if (!editingInstanceQuery.data) {
      return
    }

    const { instance } = editingInstanceQuery.data
    setInstanceForm({
      kind: instance.kind,
      name: instance.name,
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      enabled: instance.enabled
    })
    setInstanceTestState(null)
  }, [editingInstanceQuery.data])

  useEffect(() => {
    if (!editingInstanceQuery.error) {
      return
    }

    showError(
      editingInstanceQuery.error instanceof Error ? editingInstanceQuery.error.message : 'Failed to load instance',
      'instances'
    )
  }, [editingInstanceQuery.error])

  useEffect(() => {
    if (!stateQuery.error) {
      return
    }

    showError(stateQuery.error instanceof Error ? stateQuery.error.message : 'Failed to load state', section)
  }, [section, stateQuery.error])

  useEffect(() => {
    if (!queueQuery.error) {
      return
    }

    showError(queueQuery.error instanceof Error ? queueQuery.error.message : 'Failed to load queue', 'queue')
  }, [queueQuery.error])

  useEffect(() => {
    if (!scanStatusQuery.error) {
      return
    }

    showError(
      scanStatusQuery.error instanceof Error ? scanStatusQuery.error.message : 'Failed to load scan status',
      'system'
    )
  }, [scanStatusQuery.error])

  useEffect(() => {
    if (!flash) {
      return
    }

    const timeout = window.setTimeout(() => {
      setFlash((current) => (current?.id === flash.id ? null : current))
    }, 3500)

    return () => window.clearTimeout(timeout)
  }, [flash])

  useEffect(() => {
    if (!error) {
      return
    }

    const timeout = window.setTimeout(() => {
      setError((current) => (current?.id === error.id ? null : current))
    }, 5000)

    return () => window.clearTimeout(timeout)
  }, [error])

  useEffect(() => {
    if (!instanceTestState) {
      return
    }

    const timeout = window.setTimeout(() => {
      setInstanceTestState((current) => (current?.id === instanceTestState.id ? null : current))
    }, 15000)

    return () => window.clearTimeout(timeout)
  }, [instanceTestState])

  useEffect(() => {
    if (!notificationTestState) {
      return
    }

    const timeout = window.setTimeout(() => {
      setNotificationTestState((current) => (current?.id === notificationTestState.id ? null : current))
    }, 15000)

    return () => window.clearTimeout(timeout)
  }, [notificationTestState])

  function openCreateInstanceDialog() {
    setEditingInstanceId(null)
    setInstanceForm(defaultInstanceForm)
    setInstanceTestState(null)
    setInstanceDialogOpen(true)
  }

  function openEditInstanceDialog(id: number) {
    setEditingInstanceId(id)
    setInstanceForm(defaultInstanceForm)
    setInstanceTestState(null)
    setInstanceDialogOpen(true)
  }

  function closeInstanceDialog() {
    setInstanceDialogOpen(false)
    setEditingInstanceId(null)
    setInstanceForm(defaultInstanceForm)
    setInstanceTestState(null)
  }

  async function handleSaveInstance() {
    try {
      if (editingInstanceId) {
        await updateInstanceMutation.mutateAsync({
          id: editingInstanceId,
          input: instanceForm
        })
        showFlash(`Instance "${instanceForm.name}" updated`, 'instances')
      } else {
        await createInstanceMutation.mutateAsync(instanceForm)
        showFlash(`Instance "${instanceForm.name}" added`, 'instances')
      }

      closeInstanceDialog()
      setSection('instances')
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to save instance', 'instances')
    }
  }

  async function handleTestInstance() {
    setInstanceTestState(null)

    try {
      await testInstanceMutation.mutateAsync({
        ...instanceForm,
        ...(editingInstanceId !== null ? { persistId: editingInstanceId } : {})
      })
      setInstanceTestState({
        id: Date.now(),
        message: 'Connection succeeded',
        tone: 'success'
      })
    } catch (requestError) {
      setInstanceTestState({
        id: Date.now(),
        message: requestError instanceof Error ? requestError.message : 'Connection test failed',
        tone: 'danger'
      })
    }
  }

  async function handleValidateInstance(id: number) {
    try {
      await validateInstanceMutation.mutateAsync(id)
      showFlash('Instance validation completed', 'instances')
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Validation failed', 'instances')
    }
  }

  async function handleDeleteInstance(id: number) {
    try {
      await deleteInstanceMutation.mutateAsync(id)
      showFlash('Instance deleted. Related rules and runs were removed.', 'instances')
      if (editingInstanceId === id) {
        closeInstanceDialog()
      }
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to delete instance', 'instances')
    }
  }

  async function handleSaveRule() {
    try {
      if (editingRuleId) {
        await updateRuleMutation.mutateAsync({
          id: editingRuleId,
          input: ruleForm
        })
        showFlash(`Rule "${ruleForm.name}" updated`, 'rules')
      } else {
        await createRuleMutation.mutateAsync(ruleForm)
        showFlash(`Rule "${ruleForm.name}" added`, 'rules')
      }

      setEditingRuleId(null)
      setRuleDialogOpen(false)
      setRuleForm(buildRuleDraft(state?.instances[0]?.id, state?.instances[0]?.kind))
      setSection('rules')
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to save rule', 'rules')
    }
  }

  function handleEditRule(id: number) {
    const rule = state?.rules.find((item) => item.id === id)
    if (!rule) {
      return
    }

    setEditingRuleId(id)
    setRuleForm({
      instanceId: rule.instanceId,
      name: rule.name,
      cadenceMinutes: rule.cadenceMinutes,
      batchSize: rule.batchSize,
      cooldownHours: rule.cooldownHours,
      targetKind: rule.targetKind,
      scope: rule.scope,
      guards: rule.guards,
      backoff: rule.backoff,
      enabled: rule.enabled
    })
    setRuleDialogOpen(true)
    setSection('rules')
  }

  function openCreateRuleDialog() {
    setEditingRuleId(null)
    setRuleForm(buildRuleDraft(state?.instances[0]?.id, state?.instances[0]?.kind))
    setRuleDialogOpen(true)
    setSection('rules')
  }

  async function handleDeleteRule(id: number) {
    try {
      await deleteRuleMutation.mutateAsync(id)
      if (editingRuleId === id) {
        handleCancelRuleEdit()
      }
      showFlash('Rule deleted', 'rules')
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to delete rule', 'rules')
    }
  }

  async function handleToggleRule(id: number, enabled: boolean) {
    try {
      await toggleRuleMutation.mutateAsync({ id, enabled })
      showFlash(enabled ? 'Rule enabled' : 'Rule disabled', 'rules')
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to update rule', 'rules')
    }
  }

  function handleCancelRuleEdit() {
    setRuleDialogOpen(false)
    setEditingRuleId(null)
    setRuleForm(buildRuleDraft(state?.instances[0]?.id, state?.instances[0]?.kind))
  }

  async function handleRunRule(id: number) {
    try {
      const payload = await runRuleMutation.mutateAsync(id)
      if (payload.run.status === 'failed') {
        showError(payload.run.summary, 'runs')
      } else {
        showFlash(payload.run.summary, 'runs')
      }
      setSection('runs')
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to run rule', 'rules')
    }
  }

  async function handleRefreshRule(id: number) {
    const ruleName = state?.rules.find((item) => item.id === id)?.name ?? 'rule'
    setRuleRefreshPendingIds((current) => (current.includes(id) ? current : [...current, id]))

    try {
      await refreshRuleMutation.mutateAsync(id)
      showFlash(`Queue refreshed for "${ruleName}"`, 'rules')
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to refresh queue', 'rules')
    } finally {
      setRuleRefreshPendingIds((current) => current.filter((value) => value !== id))
    }
  }

  async function handleCreateBackup() {
    try {
      await createBackupMutation.mutateAsync()
      showFlash('Local backup created', 'system')
      setSection('system')
      setPaneBySection((current) => ({ ...current, system: 'backups' }))
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to create backup', 'system')
    }
  }

  async function handleRunFullScan(instanceId?: number) {
    try {
      await runScanMutation.mutateAsync(
        instanceId == null
          ? { kind: 'full' }
          : {
              instanceId,
              kind: 'full'
            }
      )
      showFlash(instanceId == null ? 'Full scan queued' : 'Full scan queued for instance', 'system')
      setSection('system')
      setPaneBySection((current) => ({ ...current, system: 'status' }))
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to queue scan', 'system')
    }
  }

  async function handleRebuildQueue() {
    try {
      await rebuildQueueMutation.mutateAsync()
      showFlash('Queue rebuilt from cached scan data', 'system')
      setSection('system')
      setPaneBySection((current) => ({ ...current, system: 'status' }))
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to rebuild queue', 'system')
    }
  }

  async function handleRestoreBackup(id: number) {
    const backup = state?.backups.find((item) => item.id === id)
    if (!backup) {
      return
    }

    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Restore backup #${backup.id} from ${formatDate(backup.createdAt)}?\n\nPokarr will create a safety backup first and briefly pause API work while the database is replaced.`
      )
    ) {
      return
    }

    setRestorePendingId(id)

    try {
      const payload = await restoreBackupMutation.mutateAsync(id)
      showFlash(`Backup #${payload.backup.id} restored`, 'system')
      setSection('system')
      setPaneBySection((current) => ({ ...current, system: 'backups' }))
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to restore backup', 'system')
    } finally {
      setRestorePendingId(null)
    }
  }

  async function handleSaveSettings(message: string, targetSection: SectionId) {
    try {
      await saveSettingsMutation.mutateAsync(settingsForm)
      showFlash(message, targetSection)
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : 'Failed to save settings', targetSection)
    }
  }

  async function handleTestNotifications() {
    setNotificationTestState(null)

    try {
      await notificationTestMutation.mutateAsync(settingsForm.notifications.notificationUrl)
      setNotificationTestState({
        id: Date.now(),
        message: 'Test notification sent',
        tone: 'success'
      })
    } catch (requestError) {
      setNotificationTestState({
        id: Date.now(),
        message: requestError instanceof Error ? requestError.message : 'Failed to send test notification',
        tone: 'danger'
      })
    }
  }

  const activeMeta = sectionMeta[section]
  const currentPane = paneBySection[section]
  const queueEntries = state ? buildQueueEntries(queueItems, state.rules, state.instances) : []

  const filteredInstances =
    state?.instances.filter((instance) =>
      matchesSearch([instance.name, instance.kind, instance.baseUrl, instance.lastError], deferredSearch)
    ).sort((left, right) => compareInstances(left, right, instanceSort)) ?? []
  const filteredRules =
    state?.rules.filter((rule) => {
      const instance = state.instances.find((item) => item.id === rule.instanceId)
      return matchesSearch(
        [
          rule.name,
          rule.targetKind,
          rule.cadenceMinutes,
          rule.batchSize,
          rule.cooldownHours,
          instance?.name
        ],
        deferredSearch
      )
    }).sort((left, right) => compareRules(left, right, ruleSort)) ?? []
  const filteredQueueIssues = queueIssues.filter((issue) =>
    matchesSearch([issue.ruleName, issue.instanceName, issue.message], deferredSearch)
  )
  const filteredRuns =
    state?.runs.filter((run) =>
      matchesSearch([run.id, run.status, run.summary, run.trigger, run.skipReason], deferredSearch)
    ) ?? []
  const filteredBackups =
    state?.backups.filter((backup) =>
      matchesSearch(
        [backup.id, backup.trigger, backup.path, backup.createdAt, backup.sizeBytes, backup.restoredAt, backup.restoreResult],
        deferredSearch
      )
    ) ?? []
  const searchedQueueEntries = queueEntries.filter((entry) =>
    matchesSearch(
      [entry.title, entry.rule, entry.source, entry.target, entry.cadence, entry.cooldown, entry.nextRun, entry.backoff, entry.reason],
      deferredSearch
    )
  )
  const filteredQueueEntries = applyQueueFilters(searchedQueueEntries, queueFilters)

  function setPane(paneId: string) {
    setPaneBySection((current) => ({
      ...current,
      [section]: paneId
    }))
  }

  function navBadge(id: SectionId) {
    if (!state) {
      return null
    }

    switch (id) {
      case 'instances':
        return state.instances.length
      case 'rules':
        return state.rules.filter((item) => item.enabled).length
      case 'queue':
        return queueEntries.length > 0 ? queueEntries.length : null
      case 'runs':
        return state.runs.length
      default:
        return null
    }
  }

  const backupRetentionTrimmed = backupRetentionInput.trim()
  const backupRetentionValue = /^\d+$/.test(backupRetentionTrimmed) ? Number(backupRetentionTrimmed) : null
  const backupRetentionError =
    backupRetentionTrimmed === ''
      ? 'Enter how many days to keep backups.'
      : backupRetentionValue !== null &&
          Number.isInteger(backupRetentionValue) &&
          backupRetentionValue >= 1 &&
          backupRetentionValue <= 3650
        ? null
        : 'Use a whole number between 1 and 3650.'

  const backupScheduleTrimmed = backupScheduleInput.trim()
  const backupScheduleError =
    backupScheduleTrimmed === ''
      ? 'Enter a backup schedule.'
      : isValidCronExpression(backupScheduleTrimmed)
        ? null
        : 'Use a valid 5-field cron expression.'

  const canRefresh =
    section === 'dashboard' ||
    section === 'runs' ||
    section === 'system' ||
    section === 'queue' ||
    (section === 'instances' && currentPane === 'connected') ||
    (section === 'rules' && currentPane === 'rules')

  const toolbarActions: ToolbarAction[] = [
    ...(canRefresh ? [{ label: 'Refresh', icon: RefreshCw, onClick: () => void refresh() }] : []),
    ...(section === 'instances'
      ? [
          {
            label: 'Add Instance',
            icon: Plus,
            onClick: openCreateInstanceDialog
          }
        ]
      : []),
    ...(section === 'rules'
      ? [
          {
            label: 'Add Rule',
            icon: Plus,
            onClick: openCreateRuleDialog,
            tone: 'primary' as const
          }
        ]
      : []),
    ...(section === 'system' && currentPane === 'backups'
      ? [{ label: 'Backup Now', icon: Database, onClick: () => void handleCreateBackup(), tone: 'primary' as const }]
      : []),
    ...(section === 'system' && (currentPane === 'status' || currentPane === 'scans')
      ? [
          {
            label: 'Scan Now',
            icon: RefreshCw,
            onClick: () => void handleRunFullScan(),
            tone: 'primary' as const
          },
          {
            label: 'Rebuild Queue',
            icon: RefreshCw,
            onClick: () => void handleRebuildQueue(),
            disabled: rebuildQueueMutation.isPending
          }
        ]
      : []),
    ...(section === 'settings' && currentPane === 'backups'
      ? [
          {
            label: 'Save',
            icon: Save,
            onClick: () => void handleSaveSettings('Backup settings saved', 'settings'),
            tone: 'primary' as const,
            disabled: Boolean(backupRetentionError || backupScheduleError)
          }
        ]
      : []),
    ...(section === 'settings' && currentPane === 'notifications'
      ? [
          {
            label: 'Save',
            icon: Save,
            onClick: () => void handleSaveSettings('Notification settings saved', 'settings'),
            tone: 'primary' as const,
            disabled:
              notificationValidation.status === 'validating' || notificationValidation.status === 'invalid'
          }
        ]
      : [])
  ]

  const notices: NoticeItem[] = [
    ...(flash
      ? [
          {
            id: flash.id,
            message: flash.message,
            tone: 'success' as const,
            onDismiss: () => setFlash(null)
          }
        ]
      : []),
    ...(error
      ? [
          {
            id: error.id,
            message: error.message,
            tone: 'danger' as const,
            onDismiss: () => setError(null)
          }
        ]
      : [])
  ]

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-40 flex h-[56px] shrink-0 border-b border-black/40 bg-[var(--chrome)]">
        <div className="hidden w-[220px] items-center border-r border-black/25 px-4 md:flex">
          <BrandMark />
        </div>
        <div className="flex flex-1 items-center justify-between gap-3 px-3 md:px-5">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <BrandIcon />
            </div>
            <div className="flex w-full min-w-0 max-w-[272px] items-center gap-2.5 border-b border-[var(--line-strong)] pb-[3px] text-[var(--foreground)]">
              <Search size={18} className="shrink-0 text-[var(--foreground-soft)]" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search"
                className="w-full bg-transparent text-[1rem] outline-none placeholder:text-[var(--foreground-soft)]"
              />
              {searchQuery ? (
                <button
                  className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-strong)] transition hover:text-white"
                  onClick={() => setSearchQuery('')}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[0.84rem] text-[var(--foreground-soft)]">
            <span className="hidden md:inline">{authSession.user?.username}</span>
            <button
              className="inline-flex items-center gap-2 rounded-[2px] border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 text-[var(--foreground-soft)] transition hover:border-[var(--line-strong)] hover:text-white"
              disabled={loggingOut}
              onClick={() => void onLogout()}
              type="button"
            >
              {loggingOut ? <RefreshCw size={14} className="animate-spin" /> : <LogOut size={14} />}
              <span>{loggingOut ? 'Signing out' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-[220px] shrink-0 border-r border-black/30 bg-[var(--sidebar)] md:flex md:flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <nav className="pb-2">
              {(
                Object.entries(sectionMeta) as Array<[SectionId, SectionMeta]>
              ).map(([id, meta]) => {
                const Icon = meta.icon
                const isActive = id === section
                const badge = navBadge(id)

                return (
                  <div key={id}>
                    <button
                      className={`flex w-full items-center gap-2.5 border-l-4 px-6 py-3 text-left text-[0.96rem] font-semibold transition ${
                        isActive
                          ? 'border-l-[var(--accent-warm)] bg-[var(--sidebar-strong)] text-white'
                          : 'border-l-transparent text-[var(--foreground-soft)] hover:bg-[rgba(0,0,0,0.12)]'
                      }`}
                      onClick={() => setSection(id)}
                    >
                      <Icon size={20} />
                      <span className="flex-1">{meta.navLabel}</span>
                      {badge ? <NavCount value={badge} /> : null}
                    </button>
                    {isActive && meta.panes.length > 1 ? (
                      <div className="relative bg-[rgba(0,0,0,0.14)] py-2">
                        <span className="absolute inset-y-0 left-0 w-[2px] bg-[var(--accent-warm)]" />
                        {meta.panes.map((pane) => (
                          <button
                            key={pane.id}
                            className={`relative block w-full px-10 py-2.5 text-left text-[0.9rem] transition ${
                              currentPane === pane.id
                                ? 'text-[var(--accent-warm)]'
                                : 'border-l-transparent text-[var(--foreground-soft)] hover:text-white'
                            }`}
                            onClick={() => setPaneBySection((current) => ({ ...current, [id]: pane.id }))}
                          >
                            {pane.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </nav>
          </div>
          <SidebarNoticeDock notices={notices} />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--page)]">
          {toolbarActions.length > 0 ? (
            <div className="sticky top-0 z-20 border-b border-black/30 bg-[var(--toolbar)]">
              <div className="flex min-w-max items-stretch overflow-x-auto">
                {toolbarActions.map((action, index) => (
                  <ToolbarActionButton
                    key={action.label}
                    action={action}
                    separated={index < toolbarActions.length - 1}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="px-4 py-3 md:hidden">
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {(Object.entries(sectionMeta) as Array<[SectionId, SectionMeta]>).map(([id, meta]) => (
                <button
                  key={id}
                  className={`rounded-[2px] border px-2.5 py-1.5 text-[0.82rem] font-semibold whitespace-nowrap ${
                    section === id
                      ? 'border-[var(--accent)] bg-[rgba(105,167,227,0.15)] text-white'
                      : 'border-[var(--line)] bg-[var(--panel)] text-[var(--foreground-soft)]'
                  }`}
                  onClick={() => setSection(id)}
                >
                  {meta.navLabel}
                </button>
              ))}
            </div>
            {activeMeta.panes.length > 1 ? (
              <div className="flex gap-1.5 overflow-x-auto border-t border-[var(--line)] pt-3">
                {activeMeta.panes.map((pane) => (
                  <button
                    key={pane.id}
                    className={`rounded-[2px] border px-2.5 py-1.5 text-[0.82rem] font-semibold whitespace-nowrap ${
                      currentPane === pane.id
                        ? 'border-[var(--accent)] bg-[rgba(105,167,227,0.16)] text-white'
                        : 'border-[var(--line)] bg-[var(--panel)] text-[var(--foreground-soft)] hover:bg-[var(--panel-soft)]'
                    }`}
                    onClick={() => setPane(pane.id)}
                  >
                    {pane.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="px-4 py-4 md:px-5 md:py-4">
            {loading || !state ? (
              <LoadingShell />
            ) : (
              <>
                {section === 'dashboard' ? (
                  <OverviewContent state={state} />
                ) : null}

                {section === 'instances' ? (
                  <InstancesContent
                    state={state}
                    onAdd={openCreateInstanceDialog}
                    onEdit={(id) => void openEditInstanceDialog(id)}
                    onValidate={(id) => void handleValidateInstance(id)}
                    filteredInstances={filteredInstances}
                    instanceSort={instanceSort}
                    listPageSize={listPageSize}
                    onInstanceSortChange={setInstanceSort}
                    onListPageSizeChange={setListPageSize}
                  />
                ) : null}

                {section === 'rules' ? (
                  <RulesContent
                    state={state}
                    onAdd={openCreateRuleDialog}
                    onEdit={handleEditRule}
                    onRefresh={(id) => void handleRefreshRule(id)}
                    onToggle={(id, enabled) => void handleToggleRule(id, enabled)}
                    onRun={(id) => void handleRunRule(id)}
                    filteredRules={filteredRules}
                    listPageSize={listPageSize}
                    ruleSort={ruleSort}
                    refreshingRuleIds={ruleRefreshPendingIds}
                    onListPageSizeChange={setListPageSize}
                    onRuleSortChange={setRuleSort}
                  />
                ) : null}

                {section === 'queue' ? (
                  <QueueContent
                    allQueueEntries={searchedQueueEntries}
                    pane={currentPane}
                    issues={filteredQueueIssues}
                    listPageSize={listPageSize}
                    rules={state.rules}
                    queueFilters={queueFilters}
                    queueEntries={filteredQueueEntries}
                    onListPageSizeChange={setListPageSize}
                    onQueueFiltersChange={setQueueFilters}
                  />
                ) : null}

                {section === 'runs' ? (
                  <RunsContent
                    listPageSize={listPageSize}
                    runs={filteredRuns}
                    totalRuns={state.runs.length}
                    onListPageSizeChange={setListPageSize}
                  />
                ) : null}

                {section === 'settings' ? (
                  <SettingsContent
                    state={state}
                    pane={currentPane}
                    settingsForm={settingsForm}
                    backupRetentionInput={backupRetentionInput}
                    backupRetentionError={backupRetentionError}
                    backupScheduleInput={backupScheduleInput}
                    backupScheduleError={backupScheduleError}
                    notificationValidation={notificationValidation}
                    notificationTestPending={notificationTestPending}
                    notificationTestState={notificationTestState}
                    onBackupRetentionInputChange={setBackupRetentionInput}
                    onBackupScheduleInputChange={setBackupScheduleInput}
                    onTestNotifications={() => void handleTestNotifications()}
                    onSettingsFormChange={setSettingsForm}
                  />
                ) : null}

                {section === 'system' ? (
                  <SystemContent
                    state={state}
                    scanStatus={scanStatus}
                    pane={currentPane}
                    backups={filteredBackups}
                    onCreate={() => void handleCreateBackup()}
                    onQueueRebuild={() => void handleRebuildQueue()}
                    onRunFullScan={(instanceId) => void handleRunFullScan(instanceId)}
                    onListPageSizeChange={setListPageSize}
                    onRestore={(id) => void handleRestoreBackup(id)}
                    restoringBackupId={restorePendingId}
                    scanActionPending={runScanMutation.isPending || rebuildQueueMutation.isPending}
                    listPageSize={listPageSize}
                  />
                ) : null}
              </>
            )}
          </div>
        </main>
      </div>

      {state ? (
        <>
          <InstanceEditorDialog
            editingInstanceId={editingInstanceId}
            form={instanceForm}
            loading={editingInstanceQuery.isPending}
            open={instanceDialogOpen}
            onChange={(next) => {
              setInstanceForm(next)
              setInstanceTestState(null)
            }}
            onClose={closeInstanceDialog}
            onDelete={
              editingInstanceId !== null
                ? () => void handleDeleteInstance(editingInstanceId)
                : undefined
            }
            onSave={() => void handleSaveInstance()}
            onTest={() => void handleTestInstance()}
            testPending={instanceTestPending}
            testState={instanceTestState}
          />
          <RuleEditorDialog
            instances={state.instances}
            editingRuleId={editingRuleId}
            form={ruleForm}
            open={ruleDialogOpen}
            onChange={setRuleForm}
            onClose={handleCancelRuleEdit}
            onDelete={
              editingRuleId !== null
                ? () => void handleDeleteRule(editingRuleId)
                : undefined
            }
            onRun={
              editingRuleId !== null
                ? () => void handleRunRule(editingRuleId)
                : undefined
            }
            onSave={() => void handleSaveRule()}
          />
        </>
      ) : null}

      <div className="pointer-events-none fixed right-3 bottom-3 left-3 z-50 space-y-2 md:hidden">
        {notices.map((notice) => (
          <InlineNotice key={notice.id} notice={notice} />
        ))}
      </div>
    </div>
  )
}
