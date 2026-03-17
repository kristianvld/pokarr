import { describe, expect, test } from 'bun:test'
import { isDevelopmentClientEnv } from './env'

describe('isDevelopmentClientEnv', () => {
  test('returns false when the import meta env object is missing', () => {
    expect(isDevelopmentClientEnv(undefined)).toBe(false)
  })

  test('returns false when DEV is false', () => {
    expect(isDevelopmentClientEnv({ DEV: false })).toBe(false)
  })

  test('returns true when DEV is true', () => {
    expect(isDevelopmentClientEnv({ DEV: true })).toBe(true)
  })
})
