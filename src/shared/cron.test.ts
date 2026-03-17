import { describe, expect, test } from 'bun:test'
import { cronMatches, isValidCronExpression } from './cron'

function findMondayThatIsNotTheFirst() {
  const date = new Date(2026, 5, 1, 3, 0, 0, 0)
  while (date.getDay() !== 1 || date.getDate() === 1) {
    date.setDate(date.getDate() + 1)
  }

  return date
}

function findFirstOfMonthThatIsNotMonday() {
  const date = new Date(2026, 0, 1, 3, 0, 0, 0)
  while (date.getDay() === 1) {
    date.setMonth(date.getMonth() + 1, 1)
  }

  return date
}

describe('cronMatches', () => {
  test('uses OR semantics when both day-of-month and day-of-week are restricted', () => {
    const mondayOnly = findMondayThatIsNotTheFirst()
    const firstOnly = findFirstOfMonthThatIsNotMonday()
    const neither = new Date(2026, 5, 10, 3, 0, 0, 0)

    expect(cronMatches(mondayOnly, '0 3 1 * 1')).toBe(true)
    expect(cronMatches(firstOnly, '0 3 1 * 1')).toBe(true)
    expect(cronMatches(neither, '0 3 1 * 1')).toBe(false)
  })

  test('supports standard numeric five-field expressions', () => {
    expect(isValidCronExpression('*/15 3 1-5 * 1,3,5')).toBe(true)
    expect(cronMatches(new Date(2026, 2, 4, 3, 15, 0, 0), '*/15 3 1-5 * 1,3,5')).toBe(true)
    expect(cronMatches(new Date(2026, 2, 4, 3, 16, 0, 0), '*/15 3 1-5 * 1,3,5')).toBe(false)
  })
})
