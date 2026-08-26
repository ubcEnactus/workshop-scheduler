import { describe, expect, it } from 'vitest'

import {
  availabilityCovers,
  getDatesForDayOfWeek,
  vancouverMinuteOfDay,
  vancouverToUtc,
} from '../../time'

describe('getDatesForDayOfWeek', () => {
  const START = '2026-06-08' // Monday
  const END = '2026-06-12' // Friday

  it('returns the Monday date for dayOfWeek=0', () => {
    expect(getDatesForDayOfWeek(0, START, END)).toEqual(['2026-06-08'])
  })

  it('returns the Wednesday date for dayOfWeek=2', () => {
    expect(getDatesForDayOfWeek(2, START, END)).toEqual(['2026-06-10'])
  })

  it('returns the Friday date for dayOfWeek=4', () => {
    expect(getDatesForDayOfWeek(4, START, END)).toEqual(['2026-06-12'])
  })

  it('returns empty array when day falls outside the cycle', () => {
    // Saturday (5) does not fall in a Mon-Fri cycle
    expect(getDatesForDayOfWeek(5, START, END)).toEqual([])
  })

  it('returns multiple occurrences across a multi-week cycle', () => {
    const dates = getDatesForDayOfWeek(0, '2026-06-08', '2026-06-22')
    expect(dates).toEqual(['2026-06-08', '2026-06-15', '2026-06-22'])
  })
})

describe('availabilityCovers', () => {
  it('returns true when availability fully covers the meeting', () => {
    expect(availabilityCovers(540, 600, 480, 660)).toBe(true)
  })

  it('returns true for exact match', () => {
    expect(availabilityCovers(540, 600, 540, 600)).toBe(true)
  })

  it('returns false when availability starts after meeting', () => {
    expect(availabilityCovers(540, 600, 570, 660)).toBe(false)
  })

  it('returns false when availability ends before meeting', () => {
    expect(availabilityCovers(540, 600, 480, 570)).toBe(false)
  })
})

describe('vancouverToUtc', () => {
  it('applies the PDT offset in summer', () => {
    // June 8 2026, 09:00 Vancouver (UTC-7) → 16:00Z
    expect(vancouverToUtc('2026-06-08', 540).toISOString()).toBe('2026-06-08T16:00:00.000Z')
  })

  it('applies the PST offset in winter', () => {
    // January 5 2026, 09:00 Vancouver (UTC-8) → 17:00Z
    expect(vancouverToUtc('2026-01-05', 540).toISOString()).toBe('2026-01-05T17:00:00.000Z')
  })

  it('round-trips through vancouverMinuteOfDay on both sides of DST', () => {
    for (const date of ['2026-01-05', '2026-06-08']) {
      for (const minute of [510, 690, 870]) {
        expect(vancouverMinuteOfDay(vancouverToUtc(date, minute))).toBe(minute)
      }
    }
  })
})
