import { describe, expect, it } from 'vitest'
import { vancouverToUtc } from '@/lib/time'
import type { ScheduleSnapshot, ScheduledWorkshop } from './eligibility'
import { matchWorkshops } from './matcher'

function session(id: string, date: string, minute = 600): ScheduledWorkshop {
  return {
    id,
    classSectionId: id,
    schoolId: id,
    scheduledStart: vancouverToUtc(date, minute),
    scheduledEnd: vancouverToUtc(date, minute + 60),
    minPAs: 1,
    maxPAs: 1,
    status: 'DRAFT',
    version: 0,
    locked: false,
    activeClass: true,
    assignments: [],
  }
}

function snapshot(workshops: ScheduledWorkshop[], paIds = ['a']): ScheduleSnapshot {
  return {
    minimumGapDays: null,
    quotas: [],
    workshops,
    pas: paIds.map((id) => ({ id, name: id, email: `${id}@example.test` })),
    availability: paIds.flatMap((userId) =>
      [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
        Array.from({ length: 44 }, (_, index) => ({
          userId,
          dayOfWeek,
          startMin: 480 + index * 15,
          effectiveFrom: '2020-01-01',
        }))
      )
    ),
  }
}

function assignments(result: ReturnType<typeof matchWorkshops>) {
  return Object.fromEntries(result.map((proposal) => [proposal.workshopSessionId, proposal.paIds]))
}

describe('exact automatic staffing policy regressions', () => {
  it('counts a fixed cross-run commitment against automatic weekly capacity', () => {
    const fixed = session('other-run', '2027-01-05')
    fixed.status = 'PUBLISHED'
    fixed.assignments = [{ paId: 'a', status: 'PUBLISHED', source: 'MANUAL' }]
    const state = snapshot([session('target', '2027-01-04'), fixed], ['a', 'b'])

    const result = matchWorkshops(state, ['target'])

    expect(assignments(result)).toEqual({ target: ['b'] })
    expect(result[0]).toMatchObject({ automaticOutcome: 'COMPLETE', protectedDeficit: false })
  })

  it('does not let an existing manual override authorize a fresh automatic exception', () => {
    const fixed = session('other-run', '2027-01-05')
    fixed.assignments = [
      {
        paId: 'a',
        status: 'DRAFT',
        source: 'MANUAL',
        overrideWeek: true,
        overrideSameDay: true,
        overrideReason: 'Already approved',
      },
    ]
    const result = matchWorkshops(snapshot([session('target', '2027-01-04'), fixed]), ['target'])

    expect(assignments(result)).toEqual({ target: [] })
    expect(result[0]).toMatchObject({
      automaticOutcome: 'PROVEN_SHORTAGE',
      protectedDeficit: false,
      shortageWitness: { requiredPlaces: 1, filledPlaces: 0, deficit: 1 },
    })
  })

  it('resets Friday to Monday across DST and keeps a cross-month week shared', () => {
    const dst = matchWorkshops(
      snapshot([session('friday', '2027-03-12'), session('monday', '2027-03-15')]),
      ['friday', 'monday']
    )
    expect(assignments(dst)).toEqual({ friday: ['a'], monday: ['a'] })
    expect(dst.every((proposal) => proposal.automaticOutcome === 'COMPLETE')).toBe(true)

    const crossMonth = matchWorkshops(
      snapshot([session('march', '2027-03-31'), session('april', '2027-04-01')]),
      ['march', 'april']
    )
    expect(assignments(crossMonth)).toEqual({ april: ['a'], march: [] })
    expect(crossMonth.every((proposal) => proposal.automaticOutcome === 'PROVEN_SHORTAGE')).toBe(
      true
    )
    expect(crossMonth[0].shortageWitness).toMatchObject({
      requiredPlaces: 2,
      filledPlaces: 1,
      deficit: 1,
    })
  })

  it('reports a protected deficit separately from a simultaneous mutable shortage', () => {
    const protectedSession = session('protected', '2027-01-04')
    protectedSession.minPAs = protectedSession.maxPAs = 2
    protectedSession.assignments = [{ paId: 'a', status: 'DRAFT', source: 'MANUAL' }]
    const result = matchWorkshops(
      snapshot(
        [protectedSession, session('first', '2027-01-11'), session('second', '2027-01-12')],
        ['a']
      ),
      ['protected', 'first', 'second']
    )

    expect(assignments(result)).toEqual({ first: ['a'], protected: ['a'], second: [] })
    expect(result.every((proposal) => proposal.automaticOutcome === 'PROVEN_SHORTAGE')).toBe(true)
    expect(result.find((proposal) => proposal.workshopSessionId === 'protected')).toMatchObject({
      protected: true,
      protectedDeficit: true,
    })
    expect(
      result
        .filter((proposal) => proposal.workshopSessionId !== 'protected')
        .every((proposal) => !proposal.protectedDeficit)
    ).toBe(true)
  })

  it('keeps PA availability mandatory for an approved date exception', () => {
    const target = session('target', '2027-01-04')
    target.hostingValid = false
    target.dateExceptionApproved = true
    const state = snapshot([target])

    const available = matchWorkshops(state, ['target'])
    expect(assignments(available)).toEqual({ target: ['a'] })
    expect(available[0].automaticOutcome).toBe('COMPLETE')

    state.availability = []
    const unavailable = matchWorkshops(state, ['target'])
    expect(assignments(unavailable)).toEqual({ target: [] })
    expect(unavailable[0]).toMatchObject({
      automaticOutcome: 'PROVEN_SHORTAGE',
      shortageWitness: { requiredPlaces: 1, filledPlaces: 0, deficit: 1 },
    })
  })

  it('removes rerun baseline workload and excludes cancelled history from fairness', () => {
    const rerunTarget = session('rerun-target', '2027-01-04')
    rerunTarget.assignments = [{ paId: 'a', status: 'DRAFT', source: 'AUTOMATIC' }]
    const rerun = snapshot([rerunTarget], ['a', 'b'])
    rerun.assignmentTotals = { a: 1, b: 0 }
    rerun.baselineAssignmentKeys = ['rerun-target:a']

    const rerunResult = matchWorkshops(rerun, ['rerun-target'])
    expect(assignments(rerunResult)).toEqual({ 'rerun-target': ['a'] })
    expect(rerunResult[0].automaticOutcome).toBe('COMPLETE')

    const target = session('target', '2027-01-04')
    const cancelled = session('cancelled', '2026-11-02')
    cancelled.status = 'CANCELLED'
    cancelled.assignments = [{ paId: 'a', status: 'PUBLISHED', source: 'MANUAL' }]
    const completed = session('completed', '2026-11-09')
    completed.status = 'COMPLETED'
    completed.assignments = [{ paId: 'b', status: 'PUBLISHED', source: 'MANUAL' }]

    const historyResult = matchWorkshops(snapshot([target, cancelled, completed], ['a', 'b']), [
      'target',
    ])
    expect(assignments(historyResult)).toEqual({ target: ['a'] })
    expect(historyResult[0].automaticOutcome).toBe('COMPLETE')
  })
})
