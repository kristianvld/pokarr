export function normalizeConfiguredTimeZone(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('TZ must not be empty. Use an IANA timezone name such as "Europe/Amsterdam".')
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date())
  } catch {
    throw new Error(`Invalid TZ value "${value}". Use an IANA timezone name such as "Europe/Amsterdam".`)
  }

  return trimmed
}

export function configureProcessTimeZone(env: Record<string, string | undefined> = process.env) {
  const raw = env.TZ
  if (!raw) {
    return null
  }

  const normalized = normalizeConfiguredTimeZone(raw)
  env.TZ = normalized
  return normalized
}

export function getRuntimeTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || 'UTC'
}
