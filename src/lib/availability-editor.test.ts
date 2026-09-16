import { describe, expect, it } from 'vitest'
import { addAvailabilityRange, copyAvailabilityDays } from './availability-editor'
describe('availability range editing', () => {
  it('merges overlapping/adjacent ranges and deduplicates copied days', () => {
    let slots = addAvailabilityRange(new Set(), 0, 540, 600)
    slots = addAvailabilityRange(slots, 0, 570, 630)
    expect([...slots]).toEqual(['0-540', '0-570', '0-600'])
    expect(copyAvailabilityDays(slots, 0, [0, 1, 1]).size).toBe(6)
    expect(copyAvailabilityDays(slots, 2, [3])).toEqual(slots)
  })
  it.each([
    [0, 540, 540],
    [0, 570, 540],
    [0, 500, 540],
    [0, 870, 930],
    [0, 541, 600],
    [5, 540, 600],
    [-1, 540, 600],
  ])('rejects invalid bounds %s %s %s', (d, s, e) =>
    expect(() => addAvailabilityRange(new Set(), d, s, e)).toThrow()
  )
  it('covers the whole school day and accepts an empty schedule', () => {
    const slots = addAvailabilityRange(new Set(), 4, 510, 900)
    expect(slots.size).toBe(13)
    expect(slots.has('4-870')).toBe(true)
    expect(copyAvailabilityDays(new Set(), 0, [1]).size).toBe(0)
  })
})
