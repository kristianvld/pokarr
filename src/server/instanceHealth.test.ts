import { describe, expect, test } from 'bun:test'
import { didInstanceHealthStateChange, getInstanceHealthState } from './instanceHealth'

describe('getInstanceHealthState', () => {
  test('maps records to unknown, healthy, and unhealthy states', () => {
    expect(getInstanceHealthState({ lastValidatedAt: null, lastError: null })).toBe('unknown')
    expect(getInstanceHealthState({ lastValidatedAt: '2026-03-12T00:00:00.000Z', lastError: null })).toBe('healthy')
    expect(getInstanceHealthState({ lastValidatedAt: '2026-03-12T00:00:00.000Z', lastError: 'timeout' })).toBe('unhealthy')
  })
})

describe('didInstanceHealthStateChange', () => {
  test('treats repeated unhealthy errors as the same health state', () => {
    expect(
      didInstanceHealthStateChange(
        {
          lastValidatedAt: '2026-03-12T00:00:00.000Z',
          lastError: 'Network error while requesting /api/v3/qualityprofile'
        },
        {
          lastValidatedAt: '2026-03-12T00:05:00.000Z',
          lastError: 'Network error while requesting /api/v3/series'
        }
      )
    ).toBe(false)
  })

  test('detects transitions into and out of unhealthy state', () => {
    expect(
      didInstanceHealthStateChange(
        {
          lastValidatedAt: '2026-03-12T00:00:00.000Z',
          lastError: null
        },
        {
          lastValidatedAt: '2026-03-12T00:05:00.000Z',
          lastError: 'Network error'
        }
      )
    ).toBe(true)

    expect(
      didInstanceHealthStateChange(
        {
          lastValidatedAt: '2026-03-12T00:00:00.000Z',
          lastError: 'Network error'
        },
        {
          lastValidatedAt: '2026-03-12T00:05:00.000Z',
          lastError: null
        }
      )
    ).toBe(true)
  })
})
