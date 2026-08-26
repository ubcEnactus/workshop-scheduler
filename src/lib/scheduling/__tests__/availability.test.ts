import { describe, expect, it } from 'vitest'

import { coalesceAvailability } from '../availability'

describe('coalesceAvailability', () => {
  it('merges contiguous slots into one window', () => {
    // Wed 13:00 + 13:30 + 14:00 ticked → 13:00–14:30
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 2, startMin: 780 },
      { userId: 'pa-1', dayOfWeek: 2, startMin: 810 },
      { userId: 'pa-1', dayOfWeek: 2, startMin: 840 },
    ])

    expect(windows).toEqual([{ paId: 'pa-1', dayOfWeek: 2, startMinute: 780, endMinute: 870 }])
  })

  it('splits on a gap', () => {
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 540 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 720 },
    ])

    expect(windows).toEqual([
      { paId: 'pa-1', dayOfWeek: 0, startMinute: 510, endMinute: 570 },
      { paId: 'pa-1', dayOfWeek: 0, startMinute: 720, endMinute: 750 },
    ])
  })

  it('sorts unordered input before merging', () => {
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 0, startMin: 570 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 540 },
    ])

    expect(windows).toEqual([{ paId: 'pa-1', dayOfWeek: 0, startMinute: 510, endMinute: 600 }])
  })

  it('never merges across users or days', () => {
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-2', dayOfWeek: 0, startMin: 540 },
      { userId: 'pa-1', dayOfWeek: 1, startMin: 540 },
    ])

    expect(windows).toHaveLength(3)
    expect(windows.every((w) => w.endMinute - w.startMinute === 30)).toBe(true)
  })

  it('ignores duplicate slots', () => {
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
    ])

    expect(windows).toEqual([{ paId: 'pa-1', dayOfWeek: 0, startMinute: 510, endMinute: 540 }])
  })

  it('returns nothing for no ticked slots', () => {
    expect(coalesceAvailability([])).toEqual([])
  })
})
