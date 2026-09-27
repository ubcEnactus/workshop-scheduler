import { describe, expect, it } from 'vitest'

import { vancouverToUtc } from '@/lib/time'
import type { ScheduleSnapshot, ScheduledWorkshop } from './eligibility'
import {
  automaticBackupCount,
  feasibilityPlanKind,
  findManualFeasibilityPlan,
} from './manual-feasibility'

function workshop(id: string, date: string, startMinute = 600, schoolId = id): ScheduledWorkshop {
  return {
    id,
    classSectionId: id,
    schoolId,
    scheduledStart: vancouverToUtc(date, startMinute),
    scheduledEnd: vancouverToUtc(date, startMinute + 60),
    minPAs: 1,
    maxPAs: 2,
    status: 'DRAFT',
    version: 0,
    locked: false,
    activeClass: true,
    hostingValid: true,
    assignments: [],
  }
}

function snapshot(paIds = ['pa']): ScheduleSnapshot {
  return {
    minimumGapDays: null,
    pas: paIds.map((id) => ({ id, name: id, email: `${id}@test.local` })),
    availability: paIds.flatMap((userId) =>
      [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
        Array.from({ length: 24 }, (_, index) => ({
          userId,
          dayOfWeek,
          startMin: 540 + index * 15,
          effectiveFrom: '2020-01-01',
        }))
      )
    ),
    quotas: [],
    workshops: [],
  }
}

const automatic = (paId: string) => ({
  paId,
  status: 'DRAFT' as const,
  source: 'AUTOMATIC' as const,
})

describe('manual batch feasibility', () => {
  it.each(['missing', 'partial'])(
    'does not suggest a workload override plan for %s availability',
    (kind) => {
      const state = snapshot()
      const target = workshop('target', '2027-01-04')
      state.workshops = [target]
      state.availability =
        kind === 'missing' ? [] : state.availability.filter((slot) => slot.startMin !== 630)
      for (const relaxation of ['WEEKLY', 'SAME_DAY'] as const) {
        expect(findManualFeasibilityPlan(state, [target.id], relaxation)).toMatchObject({
          status: 'NO_PLAN_FOUND',
          assignments: [],
        })
      }
      expect(automaticBackupCount(state, target.id)).toBe(0)
    }
  )

  it('finds a concrete weekly override plan when one PA is shared by two selected days', () => {
    const state = snapshot()
    const monday = workshop('monday', '2027-01-04')
    const tuesday = workshop('tuesday', '2027-01-05')
    monday.assignments = [automatic('pa')]
    state.workshops = [monday, tuesday]

    expect(findManualFeasibilityPlan(state, ['monday', 'tuesday'], 'WEEKLY')).toMatchObject({
      status: 'COMPLETE',
      assignments: [{ workshopSessionId: 'tuesday', paId: 'pa', warningCodes: ['SAME_WEEK'] }],
    })
  })

  it('requires the same-day phase for nonoverlapping visits and records both approvals', () => {
    const state = snapshot()
    const morning = workshop('morning', '2027-01-04', 600, 'school-a')
    const afternoon = workshop('afternoon', '2027-01-04', 780, 'school-b')
    morning.assignments = [automatic('pa')]
    state.workshops = [morning, afternoon]

    expect(findManualFeasibilityPlan(state, ['morning', 'afternoon'], 'WEEKLY').status).toBe(
      'NO_PLAN_FOUND'
    )
    expect(findManualFeasibilityPlan(state, ['morning', 'afternoon'], 'SAME_DAY')).toMatchObject({
      status: 'COMPLETE',
      assignments: [
        {
          workshopSessionId: 'afternoon',
          paId: 'pa',
          warningCodes: ['SAME_DAY', 'SAME_WEEK'],
        },
      ],
    })
  })

  it('never relaxes an overlap hard block for a competing PA', () => {
    const state = snapshot()
    const one = workshop('one', '2027-01-04', 600, 'school-a')
    const two = workshop('two', '2027-01-04', 630, 'school-b')
    one.assignments = [automatic('pa')]
    state.workshops = [one, two]
    expect(findManualFeasibilityPlan(state, ['one', 'two'], 'SAME_DAY').status).toBe(
      'NO_PLAN_FOUND'
    )
  })

  it('reports a bounded search neutrally instead of claiming no plan exists', () => {
    const state = snapshot(['pa-1', 'pa-2'])
    state.workshops = [workshop('one', '2027-01-04'), workshop('two', '2027-01-11')]
    expect(
      findManualFeasibilityPlan(state, ['one', 'two'], 'WEEKLY', { searchBudget: 1 })
    ).toMatchObject({ status: 'BUDGET_REACHED', assignments: [] })
  })

  it('classifies a warning-free bounded recovery as an automatic plan', () => {
    const state = snapshot()
    state.workshops = [workshop('unfilled', '2027-01-04')]
    const recovered = findManualFeasibilityPlan(state, ['unfilled'], 'WEEKLY')
    expect(recovered).toMatchObject({
      status: 'COMPLETE',
      assignments: [{ paId: 'pa', warningCodes: [] }],
    })
    expect(feasibilityPlanKind(recovered)).toBe('AUTOMATIC')
  })

  it('counts automatic substitutes against the final assignment state', () => {
    const state = snapshot(['pa-1', 'pa-2', 'pa-3'])
    const target = workshop('target', '2027-01-04')
    target.assignments = [automatic('pa-1')]
    const otherSelectedSlot = workshop('other', '2027-01-05')
    otherSelectedSlot.assignments = [automatic('pa-2')]
    state.workshops = [target, otherSelectedSlot]
    expect(automaticBackupCount(state, target.id)).toBe(1)
  })
})
