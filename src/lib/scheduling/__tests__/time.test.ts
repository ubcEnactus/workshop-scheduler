import { describe, expect, it } from 'vitest'

import {
  availabilityCovers,
  intervalsOverlap,
  vancouverMinuteOfDay,
  vancouverToUtc,
} from '../../time'

describe('availabilityCovers', () => {
  it('accepts an availability window that covers the workshop', () => {
    expect(availabilityCovers(540, 600, 480, 660)).toBe(true)
    expect(availabilityCovers(540, 600, 540, 600)).toBe(true)
  })

  it('rejects partial availability', () => {
    expect(availabilityCovers(540, 600, 570, 660)).toBe(false)
    expect(availabilityCovers(540, 600, 480, 570)).toBe(false)
  })
})

describe('intervalsOverlap', () => {
  it('detects overlapping assignments', () => {
    expect(intervalsOverlap(540, 600, 570, 630)).toBe(true)
  })

  it('allows assignments that meet at an endpoint', () => {
    expect(intervalsOverlap(540, 600, 600, 660)).toBe(false)
  })
})

describe('vancouverToUtc', () => {
  it('applies the PDT offset in summer', () => {
    expect(vancouverToUtc('2026-06-08', 540).toISOString()).toBe('2026-06-08T16:00:00.000Z')
  })

  it('applies the PST offset in winter', () => {
    expect(vancouverToUtc('2026-01-05', 540).toISOString()).toBe('2026-01-05T17:00:00.000Z')
  })

  it('round-trips school-hour times on both sides of DST', () => {
    for (const date of ['2026-01-05', '2026-06-08']) {
      for (const minute of [510, 690, 870]) {
        expect(vancouverMinuteOfDay(vancouverToUtc(date, minute))).toBe(minute)
      }
    }
  })
})
