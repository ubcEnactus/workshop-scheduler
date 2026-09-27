import { describe, expect, it } from 'vitest'
import { workshopSchema, workshopVersionSchema } from '@/lib/schemas/workshops'
import {
  isCalendarDate,
  shiftMonth,
  vancouverDateKey,
  vancouverMonthBounds,
  vancouverMonthKey,
  vancouverToUtc,
} from '@/lib/time'

const valid = {
  workshopDefinitionId: 'fixture-definition-1',
  classSectionId: 'class',
  date: '2025-03-10',
  startTime: '10:00',
  endTime: '11:00',
  minPAs: '1',
  maxPAs: '3',
}

describe('dated workshop validation', () => {
  it('accepts a weekday, concrete time range and default staffing', () => {
    expect(workshopSchema.parse(valid).minPAs).toBe(1)
  })
  it.each([
    { date: '2025-02-29' },
    { date: '2026-04-31' },
    { date: '2025-03-09' },
    { date: '03/10/2025' },
    { startTime: '24:00' },
    { startTime: '09:60' },
    { startTime: '11:00' },
    { endTime: '09:00' },
    { minPAs: '0' },
    { maxPAs: '0' },
    { maxPAs: '1.5' },
    { minPAs: '4' },
    { minPAs: '' },
    { classSectionId: '' },
  ])('rejects invalid input %j', (change) => {
    expect(workshopSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  })
  it('validates calendar days and versions without coercing missing fields', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true)
    expect(isCalendarDate('2025-02-29')).toBe(false)
    for (const version of [null, '', '-1', '0.5'])
      expect(workshopVersionSchema.safeParse({ id: 'w', version }).success).toBe(false)
  })
})

describe('Vancouver date conversion and month navigation', () => {
  it('handles both sides of spring and autumn transitions', () => {
    expect(vancouverToUtc('2025-03-07', 600).toISOString()).toBe('2025-03-07T18:00:00.000Z')
    expect(vancouverToUtc('2025-03-10', 600).toISOString()).toBe('2025-03-10T17:00:00.000Z')
    expect(vancouverToUtc('2025-10-31', 600).toISOString()).toBe('2025-10-31T17:00:00.000Z')
    expect(vancouverToUtc('2025-11-03', 600).toISOString()).toBe('2025-11-03T18:00:00.000Z')
  })
  it('rejects the spring gap and ambiguous autumn hour', () => {
    expect(() => vancouverToUtc('2025-03-09', 150)).toThrow('missing or ambiguous')
    expect(() => vancouverToUtc('2025-11-02', 90)).toThrow('missing or ambiguous')
    expect(() => vancouverToUtc('2025-02-30', 600)).toThrow('valid Vancouver date')
  })
  it('uses local midnight even on the day of a transition', () => {
    const bounds = vancouverMonthBounds('2025-11')
    expect(bounds.start.toISOString()).toBe('2025-11-01T07:00:00.000Z')
    expect(bounds.end.toISOString()).toBe('2025-12-01T08:00:00.000Z')
    expect(vancouverToUtc('2025-11-02', 0).toISOString()).toBe('2025-11-02T07:00:00.000Z')
  })
  it('groups late evening instants in the correct month and year', () => {
    const instant = new Date('2026-01-01T07:59:00Z')
    expect(vancouverDateKey(instant)).toBe('2025-12-31')
    expect(vancouverMonthKey(instant)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})
