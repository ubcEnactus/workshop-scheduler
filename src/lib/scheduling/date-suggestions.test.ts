import { describe, expect, it } from 'vitest'
import { suggestedSlots } from './date-suggestions'
describe('explicit workshop date suggestions', () => {
  const cls = { meetings: [{ dayOfWeek: 0, startMinute: 540, endMinute: 660 }] }
  it('suggests only dates within the month and full class availability', () => {
    const slots = suggestedSlots(cls, '2027-01', 60)
    expect(slots).toHaveLength(12)
    expect(slots[0]).toEqual({ date: '2027-01-04', startTime: '09:00', endTime: '10:00' })
    expect(slots.at(-1)?.date).toBe('2027-01-25')
    expect(suggestedSlots(cls, '2027-01', 121)).toEqual([])
  })
  it('excludes teacher commitments using Vancouver instants across DST', () => {
    const slots = suggestedSlots(
      { ...cls, busy: [{ start: '2027-03-15T16:00:00Z', end: '2027-03-15T17:00:00Z' }] },
      '2027-03',
      60
    )
    expect(slots.some((s) => s.date === '2027-03-15' && s.startTime === '09:00')).toBe(false)
    expect(slots.some((s) => s.date === '2027-03-15' && s.startTime === '10:00')).toBe(true)
  })
  it('handles leap dates, duplicates and invalid inputs', () => {
    const leap = {
      meetings: [
        { dayOfWeek: 3, startMinute: 540, endMinute: 600 },
        { dayOfWeek: 3, startMinute: 540, endMinute: 600 },
      ],
    }
    expect(suggestedSlots(leap, '2024-02', 60).at(-1)?.date).toBe('2024-02-29')
    expect(suggestedSlots(leap, '2024-02', 60)).toHaveLength(5)
    expect(suggestedSlots(cls, '2027-13', 60)).toEqual([])
    expect(suggestedSlots(cls, '2027-01', 0)).toEqual([])
  })
})
