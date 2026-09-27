import { describe, expect, it } from 'vitest'
import { classOccurrenceSchema, recurringClassAvailabilitySchema } from './class-availability'

describe('recurringClassAvailabilitySchema', () => {
  it('accepts active 15-minute ranges with effective dates and copy days', () => {
    const parsed = recurringClassAvailabilitySchema.parse({
      classSectionId: 'class-1',
      days: ['0', '2', '4'],
      startTime: '09:15',
      endTime: '11:45',
      effectiveFrom: '2026-10-01',
      effectiveUntil: '2026-12-18',
      activeForScheduling: '1',
    })
    expect(parsed).toMatchObject({
      startMinute: 555,
      endMinute: 705,
      activeForScheduling: true,
      days: [0, 2, 4],
    })
  })

  it('rejects unsupported precision and reversed effective dates', () => {
    expect(
      recurringClassAvailabilitySchema.safeParse({
        classSectionId: 'class-1',
        days: ['0', '2', '4'],
        startTime: '09:10',
        endTime: '10:00',
        effectiveFrom: '2026-10-02',
        effectiveUntil: '2026-10-01',
      }).success
    ).toBe(false)
  })
})

describe('classOccurrenceSchema', () => {
  it('requires a real date and last-seen revision without accepting submitted hours', () => {
    const input = {
      classSectionId: 'teacher-profile',
      id: 'weekly-time',
      date: '2026-10-06',
      expectedUpdatedAt: '2026-09-27T12:00:00.000Z',
    }
    expect(classOccurrenceSchema.parse({ ...input, startMinute: 0 })).toEqual({
      ...input,
      skipId: '',
    })
    expect(classOccurrenceSchema.safeParse({ ...input, date: '2026-02-30' }).success).toBe(false)
    expect(classOccurrenceSchema.safeParse({ ...input, expectedUpdatedAt: '' }).success).toBe(false)
  })
})
