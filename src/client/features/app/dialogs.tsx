import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Select } from '@/client/components/ui/select'
import { useQualityOptionsQuery } from '@/client/api/rules'
import { InstanceConnectionSelect, InstanceTypeSelect } from '@/client/features/app/controls'
import {
  disableBackoff,
  formatDelayInput,
  formatHoursInput,
  formatMinutesInput,
  instanceKindLabel,
  parseDurationInput,
  profileTargetSubject,
  releaseAgeHelpText,
  targetNoun,
  targetOptionsForInstance,
  targetPluralNoun,
  type InlineTestState,
  type QualityOptionsState
} from '@/client/features/app/support'
import {
  FieldBlock,
  FieldFeedback,
  InlineSwitchField,
  ModalSection,
  ModalShell
} from '@/client/features/app/shared'
import { cn } from '@/client/lib/utils'
import type { AppState, InstanceInput, RuleInput } from '@/shared/models'
import { ruleInputSchema } from '@/shared/models'
export function InstanceEditorDialog({
  editingInstanceId,
  form,
  open,
  onChange,
  onClose,
  onDelete,
  onSave,
  onTest,
  testPending,
  loading,
  testState
}: {
  editingInstanceId: number | null
  form: InstanceInput
  loading: boolean
  open: boolean
  onChange: (next: InstanceInput) => void
  onClose: () => void
  onDelete?: () => void
  onSave: () => void
  onTest: () => void
  testPending: boolean
  testState: InlineTestState | null
}) {
  return (
    <ModalShell
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            {onDelete ? (
              <Button
                variant="secondary"
                className="border-[rgba(234,107,103,0.4)] text-[var(--danger)] hover:bg-[rgba(234,107,103,0.12)]"
                onClick={onDelete}
              >
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="min-w-[220px] text-right text-[0.78rem]">
              {testState ? (
                <span
                  className={cn(
                    'inline-block',
                    testState.tone === 'success' ? 'text-[#74d99f]' : 'text-[var(--danger)]'
                  )}
                >
                  {testState.message}
                </span>
              ) : null}
            </div>
            <Button variant="secondary" onClick={onTest} disabled={testPending}>
              <span className="inline-flex items-center gap-2">
                {testPending ? <RefreshCw size={14} className="animate-spin" /> : null}
                {testPending ? 'Testing' : loading ? 'Loading' : 'Test'}
              </span>
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={loading} onClick={onSave}>{editingInstanceId ? 'Save' : 'Add instance'}</Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      title={editingInstanceId ? 'Edit Instance' : 'Add New Instance'}
    >
      <div className="space-y-4">
        {loading ? <FieldFeedback tone="success">Loading instance details...</FieldFeedback> : null}
        <ModalSection columnsClassName="grid-cols-1">
          <FieldBlock label="Type">
            <InstanceTypeSelect value={form.kind} onChange={(kind) => onChange({ ...form, kind })} />
          </FieldBlock>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <FieldBlock label="Name">
              <Input
                value={form.name}
                onChange={(event) => onChange({ ...form, name: event.target.value })}
                placeholder="sonarr"
              />
            </FieldBlock>
            <InlineSwitchField
              checked={form.enabled}
              className="md:self-end"
              label="Enabled"
              onCheckedChange={(checked) => onChange({ ...form, enabled: checked })}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FieldBlock label="Base URL">
              <Input
                value={form.baseUrl}
                onChange={(event) => onChange({ ...form, baseUrl: event.target.value })}
                placeholder="https://sonarr.example.com"
              />
            </FieldBlock>
            <FieldBlock label="API Key">
              <Input
                value={form.apiKey}
                onChange={(event) => onChange({ ...form, apiKey: event.target.value })}
                placeholder="API key"
              />
            </FieldBlock>
          </div>
        </ModalSection>
      </div>
    </ModalShell>
  )
}

export function RuleEditorDialog({
  instances,
  editingRuleId,
  form,
  open,
  onChange,
  onClose,
  onDelete,
  onRun,
  onSave
}: {
  instances: AppState['instances']
  editingRuleId: number | null
  form: RuleInput
  open: boolean
  onChange: (next: RuleInput) => void
  onClose: () => void
  onDelete?: () => void
  onRun?: () => void
  onSave: () => void
}) {
  const selectedInstance = instances.find((instance) => instance.id === form.instanceId)
  const targetOptions = targetOptionsForInstance(selectedInstance?.kind)
  const seasonBackoffAllowed = form.targetKind === 'season'
  const [cadenceInput, setCadenceInput] = useState(() => formatMinutesInput(form.cadenceMinutes))
  const [batchSizeInput, setBatchSizeInput] = useState(String(form.batchSize))
  const [cooldownInput, setCooldownInput] = useState(() => formatHoursInput(form.cooldownHours))
  const [releaseAgeInput, setReleaseAgeInput] = useState(() => formatDelayInput(form.guards.minimumReleaseAgeMinutes))
  const [formatScoreInput, setFormatScoreInput] = useState(
    form.scope.minimumCustomFormatScore === null ? '' : String(form.scope.minimumCustomFormatScore)
  )
  const [nameEdited, setNameEdited] = useState(form.name.trim().length > 0)
  const qualityOptionsQuery = useQualityOptionsQuery(
    selectedInstance?.id ?? null,
    open && Boolean(selectedInstance) && !form.scope.useProfileTargets
  )
  const qualityOptionsState: QualityOptionsState =
    !open || !selectedInstance || form.scope.useProfileTargets
      ? {
          status: 'idle',
          options: [],
          message: null
        }
      : qualityOptionsQuery.isPending
        ? {
            status: 'loading',
            options: [],
            message: null
          }
        : qualityOptionsQuery.isError
          ? {
              status: 'error',
              options: [],
              message:
                qualityOptionsQuery.error instanceof Error
                  ? qualityOptionsQuery.error.message
                  : 'Failed to load qualities'
            }
          : {
              status: 'ready',
              options: qualityOptionsQuery.data?.qualities ?? [],
              message: null
            }

  const syncRuleDialogInputs = useEffectEvent(() => {
    setCadenceInput(formatMinutesInput(form.cadenceMinutes))
    setBatchSizeInput(String(form.batchSize))
    setCooldownInput(formatHoursInput(form.cooldownHours))
    setReleaseAgeInput(formatDelayInput(form.guards.minimumReleaseAgeMinutes))
    setFormatScoreInput(form.scope.minimumCustomFormatScore === null ? '' : String(form.scope.minimumCustomFormatScore))
    setNameEdited(form.name.trim().length > 0)
  })
  const syncRuleDialogInputsRef = useRef(syncRuleDialogInputs)
  syncRuleDialogInputsRef.current = syncRuleDialogInputs

  useEffect(() => {
    if (!open) {
      return
    }

    syncRuleDialogInputsRef.current()
  }, [open, editingRuleId])

  const cadenceValidation = parseDurationInput(cadenceInput, 'minutes')
  const batchSizeValue = batchSizeInput === '' ? null : Number(batchSizeInput)
  const batchSizeError =
    /^\d*$/.test(batchSizeInput) && batchSizeInput !== '' && Number.isInteger(batchSizeValue) && batchSizeValue! >= 1 && batchSizeValue! <= 100
      ? null
      : 'Use a whole number between 1 and 100.'
  const cooldownValidation = parseDurationInput(cooldownInput, 'hours')
  const releaseAgeValidation = parseDurationInput(releaseAgeInput, 'delay')
  const formatScoreTrimmed = formatScoreInput.trim()
  const formatScoreValue = /^-?\d+$/.test(formatScoreTrimmed) ? Number(formatScoreTrimmed) : null
  const formatScoreError =
    formatScoreTrimmed === '' || /^-?\d+$/.test(formatScoreTrimmed) ? null : 'Use a whole number or leave this empty.'
  const selectedServiceLabel = selectedInstance ? instanceKindLabel(selectedInstance.kind) : 'service'
  const targetSingular = targetNoun(form.targetKind)
  const targetPlural = targetPluralNoun(form.targetKind)
  const profileSubject = profileTargetSubject(form.targetKind)

  const qualityOptions = [...qualityOptionsState.options]
  if (form.scope.minimumQuality && !qualityOptions.includes(form.scope.minimumQuality)) {
    qualityOptions.unshift(form.scope.minimumQuality)
  }

  const ruleCandidate: RuleInput = {
    ...form,
    cadenceMinutes: cadenceValidation.valid ? cadenceValidation.value! : form.cadenceMinutes,
    batchSize: !batchSizeError && batchSizeValue !== null ? batchSizeValue : form.batchSize,
    cooldownHours: cooldownValidation.valid ? cooldownValidation.value! : form.cooldownHours,
    scope: {
      ...form.scope,
      minimumCustomFormatScore: !formatScoreError ? formatScoreValue : form.scope.minimumCustomFormatScore
    },
    guards: {
      ...form.guards,
      minimumReleaseAgeMinutes: releaseAgeValidation.valid ? releaseAgeValidation.value! : form.guards.minimumReleaseAgeMinutes
    }
  }

  const ruleValidation = ruleInputSchema.safeParse(ruleCandidate)
  const nameError = form.name.trim().length >= 2 ? null : 'Enter a name with at least 2 characters.'
  const cadenceError = cadenceValidation.valid ? null : cadenceValidation.message
  const cooldownError = cooldownValidation.valid ? null : cooldownValidation.message
  const releaseAgeError = releaseAgeValidation.valid ? null : releaseAgeValidation.message
  const activeFormatScoreError = form.scope.useProfileTargets ? null : formatScoreError
  const backoffError =
    seasonBackoffAllowed && form.backoff.enabled && (!Number.isInteger(form.backoff.escalateAfterPokes) || form.backoff.escalateAfterPokes < 1)
      ? 'Use a whole number of misses before fallback.'
      : null
  const targetValid = Boolean(selectedInstance) && targetOptions.some((option) => option.value === form.targetKind)
  const isFormValid =
    instances.length > 0 &&
    form.instanceId > 0 &&
    Boolean(selectedInstance) &&
    targetValid &&
    !nameError &&
    !batchSizeError &&
    !cadenceError &&
    !cooldownError &&
    !releaseAgeError &&
    !activeFormatScoreError &&
    !backoffError &&
    ruleValidation.success

  return (
    <ModalShell
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            {onDelete ? (
              <Button
                variant="secondary"
                className="border-[rgba(234,107,103,0.4)] text-[var(--danger)] hover:bg-[rgba(234,107,103,0.12)]"
                onClick={onDelete}
              >
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {onRun ? (
              <Button variant="secondary" onClick={onRun}>
                Run now
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={!isFormValid}>
              {editingRuleId ? 'Save' : 'Add rule'}
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      title={editingRuleId ? 'Edit Rule' : 'Add New Rule'}
    >
      <div className="space-y-4">
        <ModalSection columnsClassName="md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" title="Basics">
          <FieldBlock label="Instance">
            <InstanceConnectionSelect
              instances={instances}
              value={form.instanceId}
              onChange={(instanceId) => {
                const instance = instances.find((item) => item.id === instanceId)
                const nextTarget =
                  instance?.kind === 'sonarr'
                    ? form.targetKind === 'movie'
                      ? 'series'
                      : form.targetKind
                    : 'movie'

                onChange({
                  ...form,
                  instanceId,
                  scope: {
                    ...form.scope,
                    minimumQuality: null
                  },
                  targetKind: nextTarget,
                  backoff: nextTarget === 'season' ? form.backoff : disableBackoff(form.backoff)
                })
              }}
            />
          </FieldBlock>
          <FieldBlock
            label="Type"
            help={
              selectedInstance?.kind === 'sonarr'
                ? 'Series searches the whole show. Season keeps the rule focused on one season at a time.'
                : selectedInstance?.kind === 'radarr'
                  ? 'Movies only.'
                  : 'Select an instance first.'
            }
          >
            <Select
              disabled={!selectedInstance}
              placeholder="Select an instance first"
              value={selectedInstance ? form.targetKind : undefined}
              onChange={(event) => {
                const nextTarget = event.target.value as RuleInput['targetKind']
                onChange({
                  ...form,
                  targetKind: nextTarget,
                  backoff: nextTarget === 'season' ? form.backoff : disableBackoff(form.backoff)
                })
              }}
            >
              {targetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FieldBlock>
          <InlineSwitchField
            checked={form.enabled}
            className="md:self-end"
            label="Enabled"
            onCheckedChange={(checked) =>
              onChange({
                ...form,
                enabled: checked
              })
            }
          />
          <FieldBlock className="md:col-span-3" label="Rule name">
            <Input
              value={form.name}
              onChange={(event) => {
                setNameEdited(true)
                onChange({ ...form, name: event.target.value })
              }}
              placeholder="Series every 30m"
            />
            {nameEdited && nameError ? <FieldFeedback tone="danger">{nameError}</FieldFeedback> : null}
          </FieldBlock>
        </ModalSection>

        <ModalSection columnsClassName="md:grid-cols-3" title="Scheduler">
            <FieldBlock label="Schedule" help="How often to run this rule. For example, 30m means every 30 minutes, 1d means once per day, and 1w means once per week.">
            <Input
              value={cadenceInput}
              onChange={(event) => {
                const nextValue = event.target.value
                setCadenceInput(nextValue)
                const parsed = parseDurationInput(nextValue, 'minutes')
                if (parsed.valid) {
                  onChange({
                    ...form,
                    cadenceMinutes: parsed.value!
                  })
                }
              }}
              placeholder="30m"
            />
            {!cadenceValidation.valid ? <FieldFeedback tone="danger">{cadenceValidation.message}</FieldFeedback> : null}
          </FieldBlock>
          <FieldBlock label="Batch size" help={`How many ${targetPlural} this rule can trigger a new search for each time it runs. If you set 5, one run can ask ${selectedServiceLabel} to search for up to 5 ${targetPlural} before waiting for the next scheduled run.`}>
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              value={batchSizeInput}
              onChange={(event) => {
                const nextValue = event.target.value
                if (!/^\d*$/.test(nextValue)) {
                  return
                }

                setBatchSizeInput(nextValue)
                if (nextValue === '') {
                  return
                }

                const parsed = Number(nextValue)
                if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 100) {
                  onChange({ ...form, batchSize: parsed })
                }
              }}
            />
            {batchSizeError ? <FieldFeedback tone="danger">{batchSizeError}</FieldFeedback> : null}
          </FieldBlock>
          <FieldBlock label="Cooldown" help={`How long this rule waits before searching for the same ${targetSingular} again. Use values like 30m, 1h30m, 12h, or 1d.`}>
            <Input
              value={cooldownInput}
              onChange={(event) => {
                const nextValue = event.target.value
                setCooldownInput(nextValue)
                const parsed = parseDurationInput(nextValue, 'hours')
                if (parsed.valid) {
                  onChange({
                    ...form,
                    cooldownHours: parsed.value!
                  })
                }
              }}
              placeholder="24h"
            />
            {!cooldownValidation.valid ? <FieldFeedback tone="danger">{cooldownValidation.message}</FieldFeedback> : null}
          </FieldBlock>
        </ModalSection>

        <ModalSection columnsClassName="grid-cols-1" title="Scope & Guards">
          <div className="grid gap-3 md:grid-cols-3">
            <InlineSwitchField
              checked={form.scope.missingOnly}
              help={`Only poke ${targetPlural} that are missing. When turned off, also poke existing ${targetPlural} to upgrade the quality.`}
              label="Missing only"
              onCheckedChange={(checked) =>
                onChange({
                  ...form,
                  scope: {
                    ...form.scope,
                    missingOnly: checked
                  }
                })
              }
            />
            <InlineSwitchField
              checked={form.guards.monitoredOnly}
              help={`Only search for monitored ${targetPlural}.`}
              label="Monitored only"
              onCheckedChange={(checked) =>
                onChange({
                  ...form,
                  guards: {
                    ...form.guards,
                    monitoredOnly: checked
                  }
                })
              }
            />
            <InlineSwitchField
              checked={form.scope.useProfileTargets}
              help={`Use the quality profile assigned to each ${profileSubject}. Pokarr stops searching once that profile target has been reached.`}
              label="Use profile targets"
              onCheckedChange={(checked) =>
                onChange({
                  ...form,
                  scope: {
                    ...form.scope,
                    useProfileTargets: checked
                  }
                })
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <FieldBlock label="Release age" help={releaseAgeHelpText(form.targetKind)}>
              <Input
                value={releaseAgeInput}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setReleaseAgeInput(nextValue)
                  const parsed = parseDurationInput(nextValue, 'delay')
                  if (parsed.valid) {
                    onChange({
                      ...form,
                      guards: { ...form.guards, minimumReleaseAgeMinutes: parsed.value! }
                    })
                  }
                }}
                placeholder="2h"
              />
              {!releaseAgeValidation.valid ? <FieldFeedback tone="danger">{releaseAgeValidation.message}</FieldFeedback> : null}
            </FieldBlock>
            {form.scope.useProfileTargets ? (
              <FieldBlock
                className="md:col-span-2"
                label="Targets"
                help={`Each ${profileSubject} keeps using its own quality profile. Pokarr stops searching when that profile's quality target or custom format target has been reached.`}
              >
                <div className="flex h-8 items-center rounded-[2px] border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-[0.82rem] text-[var(--foreground-soft)]">
                  Uses the assigned {profileSubject} profile target.
                </div>
              </FieldBlock>
            ) : (
              <>
                <FieldBlock
                  label="Quality target"
                  help={`Custom override. Stop searching once the ${targetSingular} reaches this quality or better.`}
                >
                  <Select
                    disabled={!selectedInstance || qualityOptionsState.status === 'loading' || qualityOptions.length === 0}
                    placeholder={
                      !selectedInstance
                        ? 'Select an instance first'
                        : qualityOptionsState.status === 'loading'
                          ? 'Loading qualities...'
                          : qualityOptions.length === 0
                            ? 'No qualities available'
                            : 'No quality target'
                    }
                    value={form.scope.minimumQuality ?? '__none'}
                    onChange={(event) =>
                      onChange({
                        ...form,
                        scope: {
                          ...form.scope,
                          minimumQuality: event.target.value === '__none' ? null : event.target.value
                        }
                      })
                    }
                  >
                    <option value="__none">No quality target</option>
                    {qualityOptions.map((quality) => (
                      <option key={quality} value={quality}>
                        {quality}
                      </option>
                    ))}
                  </Select>
                  {qualityOptionsState.status === 'error' && qualityOptionsState.message ? (
                    <FieldFeedback tone="danger">{qualityOptionsState.message}</FieldFeedback>
                  ) : null}
                </FieldBlock>
                <FieldBlock label="Format score" help={`Custom override. Keep searching for better releases until the ${targetSingular} reaches at least this custom format score.`}>
                  <Input
                    inputMode="numeric"
                    pattern="-?[0-9]*"
                    value={formatScoreInput}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      if (!/^-?\d*$/.test(nextValue)) {
                        return
                      }

                      setFormatScoreInput(nextValue)

                      const trimmed = nextValue.trim()
                      if (trimmed === '') {
                        onChange({
                          ...form,
                          scope: {
                            ...form.scope,
                            minimumCustomFormatScore: null
                          }
                        })
                        return
                      }

                      if (/^-?\d+$/.test(trimmed)) {
                        onChange({
                          ...form,
                          scope: {
                            ...form.scope,
                            minimumCustomFormatScore: Number(trimmed)
                          }
                        })
                      }
                    }}
                    placeholder="100"
                  />
                  {formatScoreError ? <FieldFeedback tone="danger">{formatScoreError}</FieldFeedback> : null}
                </FieldBlock>
              </>
            )}
          </div>
        </ModalSection>

        {seasonBackoffAllowed ? (
          <ModalSection columnsClassName="md:grid-cols-2" title="Backoff">
            <InlineSwitchField
              checked={form.backoff.enabled}
              help="Let a season rule fall back to episode searches after repeated misses."
              label="Episode fallback"
              onCheckedChange={(checked) =>
                onChange({
                  ...form,
                  backoff: {
                    ...form.backoff,
                    enabled: checked,
                    episodeFallback: checked
                  }
                })
              }
            />
            <FieldBlock
              disabled={!form.backoff.enabled}
              label="Escalate after"
              help="How many failed season pokes happen before episode fallback starts."
            >
              <Input
                type="number"
                value={form.backoff.escalateAfterPokes}
                disabled={!form.backoff.enabled}
                onChange={(event) =>
                  onChange({
                    ...form,
                    backoff: {
                      ...form.backoff,
                      escalateAfterPokes: Number(event.target.value)
                    }
                  })
                }
              />
              {backoffError ? <FieldFeedback tone="danger">{backoffError}</FieldFeedback> : null}
            </FieldBlock>
          </ModalSection>
        ) : null}
      </div>
    </ModalShell>
  )
}
