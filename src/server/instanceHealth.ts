export type InstanceHealthRecord = {
  lastValidatedAt: string | null
  lastError: string | null
}

export type InstanceHealthState = 'unknown' | 'healthy' | 'unhealthy'

export function getInstanceHealthState(record: InstanceHealthRecord) {
  if (record.lastError) {
    return 'unhealthy' as const
  }

  if (record.lastValidatedAt) {
    return 'healthy' as const
  }

  return 'unknown' as const
}

export function didInstanceHealthStateChange(previous: InstanceHealthRecord | null, next: InstanceHealthRecord | null) {
  if (!previous || !next) {
    return false
  }

  return getInstanceHealthState(previous) !== getInstanceHealthState(next)
}
