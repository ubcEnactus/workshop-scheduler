import { performance } from 'node:perf_hooks'
import { describe, expect, it, vi } from 'vitest'
import { vancouverToUtc } from '@/lib/time'
import { autoFillMissingPAs } from './auto-fill'
import { staffingProblems, type ScheduleSnapshot, type ScheduledWorkshop } from './eligibility'
import * as exactFlow from './exact-flow'

function session(id: string, date = '2027-01-04', start = 600): ScheduledWorkshop {
  return {
    id,
    classSectionId: id,
    schoolId: id,
    scheduledStart: vancouverToUtc(date, start),
    scheduledEnd: vancouverToUtc(date, start + 60),
    minPAs: 1,
    maxPAs: 3,
    status: 'DRAFT',
    version: 0,
    locked: false,
    activeClass: true,
    hostingValid: true,
    assignments: [],
  }
}

function state(workshops: ScheduledWorkshop[], ids = ['a', 'b', 'c']): ScheduleSnapshot {
  return {
    minimumGapDays: null,
    quotas: [],
    pas: ids.map((id) => ({ id, name: id, email: `${id}@fixture.test` })),
    workshops,
    availability: ids.flatMap((userId) =>
      [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
        Array.from({ length: 32 }, (_, index) => ({
          userId,
          dayOfWeek,
          startMin: 480 + 15 * index,
          effectiveFrom: '2020-01-01',
        }))
      )
    ),
  }
}

function pinned(paId: string, source: 'MANUAL' | 'AUTOMATIC' = 'MANUAL') {
  return {
    id: `assignment-${paId}`,
    paId,
    status: 'DRAFT' as const,
    source,
    assignedAt: new Date('2026-09-23T10:15:00Z'),
    overrideAvailability: source === 'MANUAL',
    overrideWeek: source === 'MANUAL',
    overrideSameDay: source === 'MANUAL',
    overrideReason: source === 'MANUAL' ? 'Historical review' : null,
  }
}

describe('add-only private draft auto-fill', () => {
  it.each(['MANUAL', 'AUTOMATIC'] as const)(
    'fills the residual minimum while preserving a pinned %s record and all metadata',
    (source) => {
      const target = session('target')
      target.minPAs = 2
      target.maxPAs = 4
      const existing = pinned('a', source)
      target.assignments = [existing]
      const snapshot = state([target])
      const before = JSON.stringify(snapshot)
      expect(autoFillMissingPAs(snapshot, [target.id])).toEqual({
        additions: [{ workshopSessionId: target.id, paId: 'b' }],
        outcome: 'COMPLETE',
        remainingSessionIds: [],
        excludedSessionIds: [],
      })
      expect(JSON.stringify(snapshot)).toBe(before)
      expect(target.assignments[0]).toBe(existing)
    }
  )

  it('does not add optional PAs, replace a less-fair PA or move exact historical times', () => {
    const target = session('target', '2027-01-04', 607)
    target.minPAs = 2
    target.maxPAs = 4
    target.assignments = [pinned('a'), pinned('b', 'AUTOMATIC'), pinned('c')]
    const snapshot = state([target], ['a', 'b', 'c', 'fresh'])
    snapshot.assignmentTotals = { a: 30, b: 20, c: 10, fresh: 0 }
    snapshot.baselineAssignmentKeys = ['target:a', 'target:b', 'target:c']
    const before = JSON.stringify(snapshot)
    expect(autoFillMissingPAs(snapshot, [target.id])).toEqual({
      additions: [],
      outcome: 'COMPLETE',
      remainingSessionIds: [],
      excludedSessionIds: [],
    })
    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it('becomes an assignment-preserving no-op after its additions are saved', () => {
    const target = session('target')
    const snapshot = state([target])
    const first = autoFillMissingPAs(snapshot, [target.id])
    target.assignments = first.additions.map(({ paId }) => pinned(paId, 'AUTOMATIC'))
    const before = JSON.stringify(snapshot)
    expect(autoFillMissingPAs(snapshot, [target.id]).additions).toEqual([])
    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it('excludes locked and non-draft sessions while allowing a partially manual team', () => {
    const active = session('active')
    active.minPAs = 2
    active.assignments = [pinned('a')]
    const locked = session('locked', '2027-01-11')
    locked.locked = true
    const others = (['PUBLISHED', 'COMPLETED', 'CANCELLED'] as const).map((status) => ({
      ...session(status),
      status,
    }))
    const snapshot = state([active, locked, ...others])
    const result = autoFillMissingPAs(snapshot, [
      'missing',
      active.id,
      active.id,
      locked.id,
      ...others.map((row) => row.id),
    ])
    expect(result.additions).toEqual([{ workshopSessionId: active.id, paId: 'b' }])
    expect(result.excludedSessionIds).toEqual([
      'CANCELLED',
      'COMPLETED',
      'PUBLISHED',
      'locked',
      'missing',
    ])
    expect(result.outcome).toBe('COMPLETE')
    expect(autoFillMissingPAs(snapshot, [locked.id])).toMatchObject({
      outcome: 'COMPLETE',
      remainingSessionIds: [],
      additions: [],
    })
  })

  it('applies exclusions only to the specified session and can fill with another PA', () => {
    const first = session('first')
    const second = session('second', '2027-01-11')
    const snapshot = state([first, second], ['a', 'b'])
    const exclusions = Object.freeze({ first: Object.freeze(['a']), second: Object.freeze(['b']) })
    expect(autoFillMissingPAs(snapshot, [first.id, second.id], exclusions).additions).toEqual([
      { workshopSessionId: 'first', paId: 'b' },
      { workshopSessionId: 'second', paId: 'a' },
    ])
    expect(autoFillMissingPAs(snapshot, [first.id], { first: ['a', 'b'] })).toMatchObject({
      additions: [],
      outcome: 'PROVEN_SHORTAGE',
      remainingSessionIds: ['first'],
      excludedSessionIds: [],
    })
  })

  it('keeps fixed cross-run commitments, even approved manual exceptions, unavailable to fresh automatic additions', () => {
    const fixed = session('other-run', '2027-01-05')
    fixed.status = 'PUBLISHED'
    fixed.assignments = [pinned('a')]
    const target = session('target')
    const snapshot = state([target, fixed], ['a'])
    expect(autoFillMissingPAs(snapshot, [target.id])).toMatchObject({
      additions: [],
      outcome: 'PROVEN_SHORTAGE',
      remainingSessionIds: [target.id],
    })
    fixed.status = 'CANCELLED'
    expect(autoFillMissingPAs(snapshot, [target.id]).additions).toEqual([
      { workshopSessionId: target.id, paId: 'a' },
    ])
  })

  it.each(['missing', 'partial', 'dated unavailable'])('never relaxes %s availability', (kind) => {
    const target = session('target')
    const snapshot = state([target], ['a'])
    if (kind === 'missing') snapshot.availability = []
    if (kind === 'partial')
      snapshot.availability = snapshot.availability.filter((slot) => slot.startMin !== 630)
    if (kind === 'dated unavailable')
      snapshot.availabilityExceptions = [{ userId: 'a', date: '2027-01-04', kind: 'UNAVAILABLE' }]
    expect(autoFillMissingPAs(snapshot, [target.id])).toMatchObject({
      additions: [],
      outcome: 'PROVEN_SHORTAGE',
    })
  })

  it('honors hard hosting constraints while retaining a valid date exception', () => {
    const target = session('target')
    target.hostingValid = false
    const snapshot = state([target], ['a'])
    expect(autoFillMissingPAs(snapshot, [target.id]).additions).toEqual([])
    target.dateExceptionApproved = true
    expect(autoFillMissingPAs(snapshot, [target.id]).additions).toHaveLength(1)
    target.activeClass = false
    expect(autoFillMissingPAs(snapshot, [target.id]).additions).toEqual([])
  })

  it.each([630, 660])(
    'never bypasses an overlap or consecutive same-school commitment at %s',
    (start) => {
      const target = session('target')
      const existing = session('fixed', '2027-01-04', start)
      existing.schoolId = target.schoolId
      existing.assignments = [pinned('a')]
      expect(autoFillMissingPAs(state([target, existing], ['a']), [target.id]).additions).toEqual(
        []
      )
    }
  )

  it('preserves invalid existing staffing without confusing full minima with publication readiness', () => {
    const target = session('target')
    target.assignments = [pinned('inactive')]
    const snapshot = state([target], ['a'])
    expect(autoFillMissingPAs(snapshot, [target.id])).toMatchObject({
      additions: [],
      outcome: 'COMPLETE',
    })
    expect(staffingProblems(snapshot, target)).toContain('Inactive PA: PA account is inactive.')
    expect(target.assignments[0].paId).toBe('inactive')
  })

  it('counts existing lifetime totals without deleting their baseline contribution', () => {
    const fixed = session('fixed')
    fixed.assignments = [pinned('a', 'AUTOMATIC')]
    const target = session('target', '2027-01-11')
    const snapshot = state([fixed, target], ['a', 'b'])
    snapshot.assignmentTotals = { a: 1, b: 0 }
    snapshot.baselineAssignmentKeys = ['fixed:a']
    expect(autoFillMissingPAs(snapshot, [fixed.id, target.id]).additions).toEqual([
      { workshopSessionId: target.id, paId: 'b' },
    ])
  })

  it('balances only newly added workload across usable weeks', () => {
    const targets = ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25'].map((date, i) =>
      session(`w${i}`, date)
    )
    const snapshot = state(targets, ['a', 'b'])
    snapshot.assignmentTotals = { a: 5, b: 5 }
    snapshot.baselineAssignmentKeys = []
    const result = autoFillMissingPAs(
      snapshot,
      targets.map((target) => target.id)
    )
    expect(result.additions.filter((addition) => addition.paId === 'a')).toHaveLength(2)
    expect(result.additions.filter((addition) => addition.paId === 'b')).toHaveLength(2)
  })

  it('resets weekly capacity across Friday/Monday and DST, but not a month boundary', () => {
    const acrossDst = [session('friday', '2027-03-12'), session('monday', '2027-03-15')]
    expect(
      autoFillMissingPAs(
        state(acrossDst, ['a']),
        acrossDst.map((row) => row.id)
      ).additions
    ).toHaveLength(2)
    const acrossMonth = [session('march', '2027-03-31'), session('april', '2027-04-01')]
    expect(
      autoFillMissingPAs(
        state(acrossMonth, ['a']),
        acrossMonth.map((row) => row.id)
      )
    ).toMatchObject({ outcome: 'PROVEN_SHORTAGE' })
    expect(
      autoFillMissingPAs(
        state(acrossMonth, ['a']),
        acrossMonth.map((row) => row.id)
      ).additions
    ).toHaveLength(1)
  })

  it('prefers a completed minimum to splitting additions across incomplete pinned teams', () => {
    const first = session('first')
    const second = session('second', '2027-01-05')
    first.minPAs = first.maxPAs = second.minPAs = second.maxPAs = 4
    first.assignments = [pinned('fixed-a')]
    second.assignments = [pinned('fixed-b', 'AUTOMATIC')]
    const snapshot = state([first, second], ['a', 'b', 'c', 'd', 'fixed-a', 'fixed-b'])
    const before = JSON.stringify(snapshot)
    const result = autoFillMissingPAs(snapshot, [first.id, second.id])
    expect(result.outcome).toBe('PROVEN_SHORTAGE')
    expect(
      [first, second]
        .map(
          (target) =>
            result.additions.filter((addition) => addition.workshopSessionId === target.id).length
        )
        .sort()
    ).toEqual([1, 3])
    expect(result.remainingSessionIds).toHaveLength(1)
    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it('scopes shortages to fixed teams rather than rearranging them into another possible schedule', () => {
    const first = session('first')
    first.assignments = [pinned('a', 'AUTOMATIC')]
    const second = session('second', '2027-01-05')
    const snapshot = state([first, second], ['a', 'b'])
    const result = autoFillMissingPAs(snapshot, [first.id, second.id], { second: ['b'] })
    expect(result).toMatchObject({
      additions: [],
      outcome: 'PROVEN_SHORTAGE',
      remainingSessionIds: [second.id],
    })
    expect(first.assignments[0].paId).toBe('a')
  })

  it('stays deterministic across input order and handles enormous residual demand without demand-sized arrays', () => {
    const target = session('large')
    target.minPAs = target.maxPAs = 2_147_483_647
    const snapshot = state([target], ['b', 'a'])
    const result = autoFillMissingPAs(snapshot, [target.id, target.id])
    expect(result.additions).toEqual([
      { workshopSessionId: target.id, paId: 'a' },
      { workshopSessionId: target.id, paId: 'b' },
    ])
    expect(result.outcome).toBe('PROVEN_SHORTAGE')
    expect(
      autoFillMissingPAs({ ...snapshot, pas: [...snapshot.pas].reverse() }, [target.id])
    ).toEqual(result)
  })

  it('solves a realistic multi-week residual scope with shared capacity', () => {
    const dates = ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']
    const targets = dates.flatMap((date, week) =>
      Array.from({ length: 10 }, (_, index) => {
        const target = session(`week-${week}-session-${index}`, date)
        target.minPAs = 2
        return target
      })
    )
    const snapshot = state(
      targets,
      Array.from({ length: 20 }, (_, index) => `pa-${index}`)
    )
    const result = autoFillMissingPAs(
      snapshot,
      targets.map((target) => target.id)
    )
    expect(result.outcome).toBe('COMPLETE')
    expect(result.additions).toHaveLength(80)
    expect(result.remainingSessionIds).toEqual([])
  })

  it('bounds repair work at the 200-session dense-shortage limit without weakening the exact proof', () => {
    const targets = Array.from({ length: 200 }, (_, index) => session(`target-${index}`))
    const snapshot = state(
      targets,
      Array.from({ length: 150 }, (_, index) => `pa-${index}`)
    )
    snapshot.availability = snapshot.availability.filter(
      (slot) => slot.startMin >= 600 && slot.startMin < 660
    )
    const before = JSON.stringify(snapshot)
    const flow = vi.spyOn(exactFlow, 'minCostMaximumFlow')
    try {
      const started = performance.now()
      const result = autoFillMissingPAs(
        snapshot,
        targets.map((target) => target.id)
      )
      expect(performance.now() - started).toBeLessThan(5_000)
      // One completed exact solve establishes shortage; no hundreds of repairs.
      expect(flow).toHaveBeenCalledTimes(1)
      expect(result.outcome).toBe('PROVEN_SHORTAGE')
      expect(result.additions).toHaveLength(150)
      expect(result.remainingSessionIds).toHaveLength(50)
      expect(new Set(result.additions.map((item) => item.paId)).size).toBe(150)
      expect(new Set(result.additions.map((item) => item.workshopSessionId)).size).toBe(150)
      expect(JSON.stringify(snapshot)).toBe(before)
      const reversed = autoFillMissingPAs(
        { ...snapshot, pas: [...snapshot.pas].reverse() },
        [...targets].reverse().map((target) => target.id)
      )
      expect(reversed).toEqual(result)
      expect(flow).toHaveBeenCalledTimes(2)
    } finally {
      flow.mockRestore()
    }
  }, 15_000)
})
