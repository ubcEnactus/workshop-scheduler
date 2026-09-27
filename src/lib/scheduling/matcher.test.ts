import { describe, expect, it } from 'vitest'
import { matchWorkshops } from './matcher'
import { matchPlanSchema } from '@/lib/schemas/matching'
import type { ScheduleSnapshot, ScheduledWorkshop } from './eligibility'
import { vancouverToUtc } from '@/lib/time'

function workshop(id: string, date = '2027-01-04', minute = 600): ScheduledWorkshop {
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

function snapshot(workshops: ScheduledWorkshop[], ids = ['a', 'b']): ScheduleSnapshot {
  return {
    minimumGapDays: null,
    pas: ids.map((id) => ({ id, name: id, email: `${id}@test.local` })),
    availability: ids.flatMap((userId) =>
      [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
        Array.from({ length: 28 }, (_, index) => ({
          userId,
          dayOfWeek,
          startMin: 510 + index * 15,
          effectiveFrom: '2020-01-01',
        }))
      )
    ),
    quotas: [],
    workshops,
  }
}

describe('pure automatic matcher', () => {
  it.each(['missing', 'partial'])(
    'never automatically selects a PA with %s availability',
    (kind) => {
      const target = workshop('target')
      const state = snapshot([target], ['a'])
      state.availability =
        kind === 'missing' ? [] : state.availability.filter((slot) => slot.startMin !== 630)
      const [proposal] = matchWorkshops(state, [target.id])
      expect(proposal.paIds).toEqual([])
      expect(proposal.automaticOutcome).toBe('PROVEN_SHORTAGE')
    }
  )

  it('repairs the four-session greedy counterexample within a bounded search', () => {
    const workshops = [
      workshop('w1', '2027-01-04'),
      workshop('w2', '2027-01-05'),
      workshop('w3', '2027-01-06'),
      workshop('w4', '2027-01-07'),
    ]
    const state = snapshot(workshops, ['a', 'b', 'c', 'd'])
    const allowed: Record<string, string[]> = {
      w1: ['a', 'b'],
      w2: ['a', 'c'],
      w3: ['b', 'd'],
      w4: ['a', 'c'],
    }
    state.availabilityExceptions = workshops.flatMap((item) =>
      state.pas
        .filter((pa) => !allowed[item.id].includes(pa.id))
        .map((pa) => ({
          userId: pa.id,
          date: item.scheduledStart,
          kind: 'UNAVAILABLE' as const,
        }))
    )

    const result = matchWorkshops(
      state,
      workshops.map((item) => item.id)
    )
    expect(result.every((proposal) => proposal.paIds.length === 1)).toBe(true)
    for (const proposal of result)
      expect(allowed[proposal.workshopSessionId]).toContain(proposal.paIds[0])
    expect(new Set(result.flatMap((proposal) => proposal.paIds))).toEqual(
      new Set(['a', 'b', 'c', 'd'])
    )
    expect(result.every((proposal) => proposal.automaticOutcome === 'COMPLETE')).toBe(true)
  })

  it('uses lower lifetime assignment totals as a soft deterministic tie-breaker', () => {
    const target = workshop('target', '2027-03-01')
    const history = [workshop('old-1', '2026-11-02'), workshop('old-2', '2026-11-09')]
    for (const item of history) {
      item.status = 'COMPLETED'
      item.assignments = [{ paId: 'b', status: 'PUBLISHED', source: 'MANUAL' }]
    }
    const state = snapshot([target, ...history])
    expect(matchWorkshops(state, ['target'])[0].paIds).toEqual(['a'])
    state.workshops[1].status = 'CANCELLED'
    state.workshops[2].status = 'CANCELLED'
    expect(matchWorkshops(state, ['target'])[0].paIds).toEqual(['a'])
  })

  it('never creates automatic same-day or same-week exceptions', () => {
    const monday = workshop('monday', '2027-01-04')
    const tuesday = workshop('tuesday', '2027-01-05')
    const state = snapshot([monday, tuesday], ['a'])
    const result = matchWorkshops(state, ['monday', 'tuesday'])
    expect(result.flatMap((proposal) => proposal.paIds)).toHaveLength(1)
    expect(result.find((proposal) => !proposal.paIds.length)?.reasons.join(' ')).toContain(
      'Already assigned another session in this Monday–Friday week.'
    )
  })

  it('preserves manual, locked, published, completed, and cancelled work exactly', () => {
    const workshops = ['manual', 'locked', 'published', 'completed', 'cancelled', 'auto'].map(
      (id, index) => workshop(id, `2027-0${index + 1}-04`)
    )
    workshops[0].assignments = [
      {
        paId: 'a',
        status: 'DRAFT',
        source: 'MANUAL',
        overrideWeek: true,
        overrideReason: 'Reviewed',
      },
    ]
    workshops[1].locked = true
    workshops[2].status = 'PUBLISHED'
    workshops[3].status = 'COMPLETED'
    workshops[4].status = 'CANCELLED'
    const state = snapshot(workshops)
    const before = JSON.stringify(state)
    const output = matchWorkshops(
      state,
      workshops.map((item) => item.id)
    )
    expect(output.filter((proposal) => proposal.protected)).toHaveLength(5)
    expect(JSON.stringify(state)).toBe(before)
    expect(output[0]).toHaveProperty('automaticOutcome')
  })

  it('returns a valid partial plan with a proved automatic shortage', () => {
    const one = workshop('one')
    const two = workshop('two', '2027-01-05')
    const state = snapshot([one, two], ['a'])
    const result = matchWorkshops(state, ['one', 'two'])
    expect(result.flatMap((proposal) => proposal.paIds)).toHaveLength(1)
    const unstaffed = result.find((proposal) => proposal.paIds.length === 0)!
    expect(unstaffed.automaticOutcome).toBe('PROVEN_SHORTAGE')
    expect(unstaffed.shortageWitness?.deficit).toBe(1)
  })

  it('fills every minimum before adding optional staffing', () => {
    const first = workshop('first', '2027-01-04')
    const second = workshop('second', '2027-01-11')
    first.maxPAs = 2
    const state = snapshot([first, second], ['a', 'b'])
    const result = matchWorkshops(state, ['first', 'second'])
    expect(result.find((proposal) => proposal.workshopSessionId === 'first')?.paIds).toHaveLength(2)
    expect(result.find((proposal) => proposal.workshopSessionId === 'second')?.paIds).toHaveLength(
      1
    )
  })

  it('reuses a PA in the next Vancouver week but only once within a week', () => {
    const monday = workshop('monday', '2027-01-04')
    const friday = workshop('friday', '2027-01-08')
    const nextMonday = workshop('next-monday', '2027-01-11')
    const result = matchWorkshops(snapshot([monday, friday, nextMonday], ['a']), [
      monday.id,
      friday.id,
      nextMonday.id,
    ])
    expect(result.flatMap((proposal) => proposal.paIds)).toHaveLength(2)
    expect(result.find((proposal) => proposal.workshopSessionId === 'next-monday')?.paIds).toEqual([
      'a',
    ])
  })

  it('prefers completing one minimum of three over splitting four PAs two-and-two', () => {
    const first = workshop('first', '2027-01-04')
    const second = workshop('second', '2027-01-05')
    first.minPAs = first.maxPAs = 3
    second.minPAs = second.maxPAs = 3
    const result = matchWorkshops(snapshot([first, second], ['a', 'b', 'c', 'd']), [
      first.id,
      second.id,
    ])
    expect(result.map((proposal) => proposal.paIds.length).sort()).toEqual([1, 3])
  })

  it('handles an enormous declared demand without expanding by demand', () => {
    const target = workshop('huge')
    target.minPAs = target.maxPAs = 2_147_483_647
    const [proposal] = matchWorkshops(snapshot([target], ['a', 'b']), [target.id])
    expect(proposal.paIds).toHaveLength(2)
    expect(proposal.shortageWitness).toMatchObject({
      requiredPlaces: 2_147_483_647,
      filledPlaces: 2,
    })
    expect(proposal.diagnostics.edges).toBeLessThan(20)
  })

  it('round-trips a newly generated versioned plan through persisted-plan parsing', () => {
    const target = workshop('target')
    const plan = matchWorkshops(snapshot([target]), [target.id])
    expect(matchPlanSchema.parse(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
  })

  it('preserves covered sessions while reassigning capacity to reduce the remaining deficit', () => {
    const minima = [3, 2, 3, 3, 2]
    const allowed = [['a', 'c'], ['b', 'c'], ['a'], ['a', 'b', 'c'], ['a', 'b', 'c']]
    const workshops = minima.map((minimum, index) => {
      const item = workshop(`s${index}`, index % 2 ? '2027-01-11' : '2027-01-04', 540 + index * 60)
      item.minPAs = item.maxPAs = minimum
      return item
    })
    const state = snapshot(workshops, ['a', 'b', 'c'])
    state.availabilityExceptions = workshops.flatMap((item, index) =>
      state.pas
        .filter((pa) => !allowed[index].includes(pa.id))
        .map((pa) => ({
          userId: pa.id,
          date: item.scheduledStart,
          kind: 'UNAVAILABLE' as const,
          startMinute: 540 + index * 60,
          endMinute: 600 + index * 60,
        }))
    )
    const plan = matchWorkshops(
      state,
      workshops.map((item) => item.id)
    )
    const covered = plan.filter((proposal, index) => proposal.paIds.length >= minima[index]).length
    const deficit = plan.reduce(
      (sum, proposal, index) => sum + Math.max(0, minima[index] - proposal.paIds.length),
      0
    )
    expect({ covered, deficit }).toEqual({ covered: 2, deficit: 7 })
  })
})
