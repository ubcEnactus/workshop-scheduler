import { describe, expect, it } from 'vitest'

import { availabilityCovers, getDatesForDayOfWeek, timeToMinutes } from '../../time'

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

describe('timeToMinutes', () => {
  it('converts "09:00" to 540', () => {
    expect(timeToMinutes('09:00')).toBe(540)
  })

  it('converts "14:30" to 870', () => {
    expect(timeToMinutes('14:30')).toBe(870)
  })
})

describe('availabilityCovers', () => {
  it('returns true when availability fully covers the meeting', () => {
    expect(availabilityCovers('09:00', '10:00', '08:00', '11:00')).toBe(true)
  })

  it('returns true for exact match', () => {
    expect(availabilityCovers('09:00', '10:00', '09:00', '10:00')).toBe(true)
  })

  it('returns false when availability starts after meeting', () => {
    expect(availabilityCovers('09:00', '10:00', '09:30', '11:00')).toBe(false)
  })

  it('returns false when availability ends before meeting', () => {
    expect(availabilityCovers('09:00', '10:00', '08:00', '09:30')).toBe(false)
  })
})
