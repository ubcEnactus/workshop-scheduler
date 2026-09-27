import { describe, expect, it } from 'vitest'

import { coalesceAvailability, paAvailabilityCoversInterval } from '../availability'

describe('coalesceAvailability', () => {
  it('merges contiguous slots into one window', () => {
    // Wed 13:00 + 13:15 + 13:30 ticked → 13:00–13:45
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 2, startMin: 780 },
      { userId: 'pa-1', dayOfWeek: 2, startMin: 795 },
      { userId: 'pa-1', dayOfWeek: 2, startMin: 810 },
    ])

    expect(windows).toEqual([{ paId: 'pa-1', dayOfWeek: 2, startMinute: 780, endMinute: 825 }])
  })

  it('splits on a gap', () => {
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 525 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 720 },
    ])

    expect(windows).toEqual([
      { paId: 'pa-1', dayOfWeek: 0, startMinute: 510, endMinute: 540 },
      { paId: 'pa-1', dayOfWeek: 0, startMinute: 720, endMinute: 735 },
    ])
  })

  it('sorts unordered input before merging', () => {
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 0, startMin: 540 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 525 },
    ])

    expect(windows).toEqual([{ paId: 'pa-1', dayOfWeek: 0, startMinute: 510, endMinute: 555 }])
  })

  it('never merges across users or days', () => {
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-2', dayOfWeek: 0, startMin: 540 },
      { userId: 'pa-1', dayOfWeek: 1, startMin: 540 },
    ])

    expect(windows).toHaveLength(3)
    expect(windows.every((w) => w.endMinute - w.startMinute === 15)).toBe(true)
  })

  it('ignores duplicate slots', () => {
    const windows = coalesceAvailability([
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
    ])

    expect(windows).toEqual([{ paId: 'pa-1', dayOfWeek: 0, startMinute: 510, endMinute: 525 }])
  })

  it('returns nothing for no ticked slots', () => {
    expect(coalesceAvailability([])).toEqual([])
  })
})

describe('paAvailabilityCoversInterval', () => {
  const slots = [540, 555, 570, 585].map((startMin) => ({
    userId: 'pa-1',
    dayOfWeek: 0,
    startMin,
    effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
    effectiveUntil: null,
  }))

  it('requires contiguous coverage for the full session on an effective weekday', () => {
    expect(
      paAvailabilityCoversInterval({
        paId: 'pa-1',
        date: '2026-10-05',
        startMinute: 540,
        endMinute: 600,
        slots,
      })
    ).toBe(true)
    expect(
      paAvailabilityCoversInterval({
        paId: 'pa-1',
        date: '2026-09-28',
        startMinute: 540,
        endMinute: 600,
        slots,
      })
    ).toBe(false)
  })

  it('lets an available exception add coverage and an unavailable exception take precedence', () => {
    const available = {
      userId: 'pa-1',
      date: new Date('2026-10-06T00:00:00.000Z'),
      kind: 'AVAILABLE' as const,
      startMinute: 600,
      endMinute: 660,
    }
    expect(
      paAvailabilityCoversInterval({
        paId: 'pa-1',
        date: '2026-10-06',
        startMinute: 600,
        endMinute: 660,
        slots,
        exceptions: [available],
      })
    ).toBe(true)
    expect(
      paAvailabilityCoversInterval({
        paId: 'pa-1',
        date: '2026-10-06',
        startMinute: 600,
        endMinute: 660,
        slots,
        exceptions: [available, { ...available, kind: 'UNAVAILABLE' }],
      })
    ).toBe(false)
  })

  it('joins adjacent recurring and additional intervals before checking full coverage', () => {
    expect(
      paAvailabilityCoversInterval({
        paId: 'pa-1',
        date: '2026-10-05',
        startMinute: 540,
        endMinute: 660,
        slots,
        exceptions: [
          {
            userId: 'pa-1',
            date: '2026-10-05',
            kind: 'AVAILABLE',
            startMinute: 600,
            endMinute: 660,
          },
        ],
      })
    ).toBe(true)
  })
})
