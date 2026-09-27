import { expect, it } from 'vitest'
import { paCalendarWindows } from './pa-calendar'

it('shows effective weekly windows and switches versions across month boundaries', () => {
  const slots = [
    {
      userId: 'pa',
      dayOfWeek: 0,
      startMin: 600,
      effectiveFrom: '2026-01-01',
      effectiveUntil: '2026-12-31',
    },
    {
      userId: 'pa',
      dayOfWeek: 0,
      startMin: 615,
      effectiveFrom: '2026-01-01',
      effectiveUntil: '2026-12-31',
    },
    { userId: 'pa', dayOfWeek: 0, startMin: 660, effectiveFrom: '2027-01-01' },
    { userId: 'other', dayOfWeek: 0, startMin: 700, effectiveFrom: '2026-01-01' },
  ]
  expect(paCalendarWindows('pa', '2026-12-28', slots, [])).toEqual([
    { startMinute: 600, endMinute: 630 },
  ])
  expect(paCalendarWindows('pa', '2027-01-04', slots, [])).toEqual([
    { startMinute: 660, endMinute: 675 },
  ])
  expect(paCalendarWindows('pa', '2027-01-05', slots, [])).toEqual([])
})

it('respects existing admin restrictions and dated additions without rounding legacy times', () => {
  const slots = [600, 615, 630, 645].map((startMin) => ({
    userId: 'pa',
    dayOfWeek: 0,
    startMin,
    effectiveFrom: '2027-01-01',
  }))
  const exceptions = [
    {
      userId: 'pa',
      date: '2027-01-04',
      kind: 'UNAVAILABLE' as const,
      startMinute: 612,
      endMinute: 634,
    },
    {
      userId: 'pa',
      date: '2027-01-04',
      kind: 'AVAILABLE' as const,
      startMinute: 700,
      endMinute: 721,
    },
    { userId: 'other', date: '2027-01-04', kind: 'UNAVAILABLE' as const },
  ]
  expect(paCalendarWindows('pa', '2027-01-04', slots, exceptions)).toEqual([
    { startMinute: 600, endMinute: 612 },
    { startMinute: 634, endMinute: 660 },
    { startMinute: 700, endMinute: 721 },
  ])
  expect(
    paCalendarWindows('pa', '2027-01-04', slots, [
      ...exceptions,
      { userId: 'pa', date: '2027-01-04', kind: 'UNAVAILABLE' },
    ])
  ).toEqual([])
})
