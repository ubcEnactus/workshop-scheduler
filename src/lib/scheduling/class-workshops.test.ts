import { describe, expect, it } from 'vitest'
import { runCoverageState, sessionsNeedingDateExceptions } from './class-workshops'

describe('runCoverageState', () => {
  it('keeps an enrolled class with no availability visible', () => {
    expect(
      runCoverageState({
        status: 'NEEDS_AVAILABILITY',
        availabilityCount: 0,
        windowEnded: false,
        sessions: [],
      })
    ).toBe('NEEDS_AVAILABILITY')
  })

  it('shows an ended window as an outstanding delivery', () => {
    expect(
      runCoverageState({
        status: 'READY_TO_SCHEDULE',
        availabilityCount: 3,
        windowEnded: true,
        sessions: [],
      })
    ).toBe('WINDOW_ENDED_OUTSTANDING')
  })

  it('does not treat a stored readiness status as proof of a currently valid time', () => {
    expect(
      runCoverageState({
        status: 'READY_TO_SCHEDULE',
        availabilityCount: 0,
        windowEnded: false,
        sessions: [],
      })
    ).toBe('NEEDS_AVAILABILITY')
  })

  it('derives staffing and publication readiness from the active session', () => {
    expect(
      runCoverageState({
        status: 'SCHEDULED',
        availabilityCount: 1,
        windowEnded: false,
        sessions: [{ status: 'DRAFT', minPAs: 2, assignmentCount: 1 }],
      })
    ).toBe('NEEDS_PAS')
    expect(
      runCoverageState({
        status: 'SCHEDULED',
        availabilityCount: 1,
        windowEnded: false,
        sessions: [{ status: 'DRAFT', minPAs: 2, assignmentCount: 2 }],
      })
    ).toBe('READY_TO_PUBLISH')
  })

  it('does not let cancelled sessions satisfy coverage', () => {
    expect(
      runCoverageState({
        status: 'CANCELLED',
        availabilityCount: 1,
        windowEnded: false,
        sessions: [{ status: 'CANCELLED', minPAs: 1, assignmentCount: 1 }],
      })
    ).toBe('READY_TO_SCHEDULE')
  })

  it('keeps an explicit waiver distinct from completion', () => {
    expect(
      runCoverageState({
        status: 'WAIVED',
        availabilityCount: 0,
        windowEnded: true,
        sessions: [],
      })
    ).toBe('WAIVED')
  })
})

describe('sessionsNeedingDateExceptions', () => {
  const window = {
    deliveryStartsOn: new Date('2026-10-05T00:00:00.000Z'),
    deliveryEndsOn: new Date('2026-10-23T00:00:00.000Z'),
  }
  const session = {
    scheduledStart: new Date('2026-10-26T17:00:00.000Z'),
    scheduledEnd: new Date('2026-10-26T18:00:00.000Z'),
    dateExceptionReason: null,
    dateExceptionApprovedBy: null,
  }

  it('requires review for a newly excluded session', () => {
    expect(sessionsNeedingDateExceptions(window, [session])).toEqual([session])
  })

  it('preserves an already approved date exception', () => {
    expect(
      sessionsNeedingDateExceptions(window, [
        {
          ...session,
          dateExceptionReason: 'Teacher confirmed this date.',
          dateExceptionApprovedBy: 'admin',
        },
      ])
    ).toEqual([])
  })
})
