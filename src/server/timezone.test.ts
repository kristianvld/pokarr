import { describe, expect, test } from 'bun:test'
import { normalizeConfiguredTimeZone } from './timezone'

describe('normalizeConfiguredTimeZone', () => {
  test('accepts IANA timezone names', () => {
    expect(normalizeConfiguredTimeZone(' Europe/Amsterdam ')).toBe('Europe/Amsterdam')
  })

  test('rejects invalid timezone names', () => {
    expect(() => normalizeConfiguredTimeZone('Mars/Olympus')).toThrow(
      'Use an IANA timezone name such as "Europe/Amsterdam".'
    )
  })
})
