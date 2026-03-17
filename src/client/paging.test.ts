import { describe, expect, test } from 'bun:test'
import {
  defaultListPageSize,
  getInitialVisibleCount,
  getNextVisibleCount,
  isListPageSize
} from './paging'

describe('paging helpers', () => {
  test('accepts only supported page sizes', () => {
    expect(isListPageSize(defaultListPageSize)).toBe(true)
    expect(isListPageSize(200)).toBe(true)
    expect(isListPageSize(75)).toBe(false)
  })

  test('caps initial and incremental visibility to the available total', () => {
    expect(getInitialVisibleCount(12, 20)).toBe(12)
    expect(getInitialVisibleCount(120, 20)).toBe(20)
    expect(getNextVisibleCount(20, 45, 20)).toBe(40)
    expect(getNextVisibleCount(40, 45, 20)).toBe(45)
    expect(getNextVisibleCount(0, 0, 20)).toBe(0)
  })
})
