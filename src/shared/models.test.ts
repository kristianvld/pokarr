import { describe, expect, test } from 'bun:test'
import { guardsSchema } from './models'

describe('guardsSchema', () => {
  test('keeps explicit release-age minutes and strips unrelated fields', () => {
    const parsed = guardsSchema.parse({
      monitoredOnly: true,
      minimumReleaseAgeMinutes: 7 * 24 * 60,
      cooldownHours: 24
    })

    expect(parsed).toEqual({
      monitoredOnly: true,
      minimumReleaseAgeMinutes: 7 * 24 * 60
    })
    expect('cooldownHours' in parsed).toBe(false)
  })
})
