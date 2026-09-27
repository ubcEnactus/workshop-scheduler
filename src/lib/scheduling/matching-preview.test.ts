import { describe, expect, it } from 'vitest'
import { vancouverToUtc } from '@/lib/time'
import type { ScheduleSnapshot } from './eligibility'
import { scheduleHash } from './matching-preview'
import { previewWeekAvailability, previewStaffingView, matchingPlanHash } from './preview-staffing'
import { matchWorkshops } from './matcher'
import { matchPlanSchema } from '@/lib/schemas/matching'

function snapshot(): ScheduleSnapshot {
  return {
    minimumGapDays: 7,
    pas: [{ id: 'pa', name: 'PA', email: 'pa@test.local' }],
    availability: [{ userId: 'pa', dayOfWeek: 0, startMin: 600, effectiveFrom: '2020-01-01' }],
    availabilityExceptions: [],
    quotas: [{ paId: 'pa', month: '2027-01', quota: 2 }],
    assignmentTotals: { pa: 4 },
    baselineAssignmentKeys: ['session:pa'],
    workshops: [
      {
        id: 'session',
        classSectionId: 'class',
        schoolId: 'school',
        scheduledStart: vancouverToUtc('2027-01-04', 600),
        scheduledEnd: vancouverToUtc('2027-01-04', 660),
        minPAs: 1,
        maxPAs: 2,
        status: 'DRAFT',
        version: 0,
        locked: false,
        activeClass: true,
        assignments: [{ paId: 'pa', status: 'DRAFT', source: 'AUTOMATIC' }],
      },
    ],
  }
}

describe('matching preview hash', () => {
  it('keeps the same revision after manual metadata is serialized and parsed again', () => {
    const plan = matchPlanSchema.parse(matchWorkshops(snapshot(), ['session']))
    plan[0].manuallyEdited = true
    plan[0].overrides = []
    expect(matchingPlanHash(plan)).toBe(
      matchingPlanHash(matchPlanSchema.parse(JSON.parse(JSON.stringify(plan))))
    )
  })
  it('shows exact effective weekly availability with dated additions and subtractions', () => {
    const state = snapshot()
    state.availability.push({
      userId: 'pa',
      dayOfWeek: 0,
      startMin: 615,
      effectiveFrom: '2027-01-11',
    })
    state.availabilityExceptions = [
      { userId: 'pa', date: '2027-01-04', kind: 'UNAVAILABLE', startMinute: 607, endMinute: 610 },
      { userId: 'pa', date: '2027-01-05', kind: 'AVAILABLE', startMinute: 601, endMinute: 644 },
    ]
    const week = previewWeekAvailability(state, 'pa', '2027-01-04')
    expect(week[0].windows).toEqual(['10:00–10:07 AM', '10:10–10:15 AM'])
    expect(week[1].windows).toEqual(['10:01–10:44 AM'])
    expect(week[2].windows).toEqual([])
    expect(previewWeekAvailability(state, 'pa', '2027-01-11')[0].windows).toEqual([
      '10:00–10:30 AM',
    ])
  })

  it('includes out-of-scope run and lifetime history while applying preview count deltas', () => {
    const state = snapshot()
    state.workshops[0].workshopDefinitionId = 'run'
    const plan = matchPlanSchema.parse(matchWorkshops(state, ['session']))
    plan[0].paIds = []
    const removed = previewStaffingView(state, plan, 'session', { pa: 3 })
    expect(removed.candidates[0]).toMatchObject({ weekCount: 0, runCount: 2, lifetimeCount: 3 })
    plan[0].paIds = ['pa']
    expect(previewStaffingView(state, plan, 'session', { pa: 3 }).candidates[0]).toMatchObject({
      weekCount: 1,
      runCount: 3,
      lifetimeCount: 4,
    })
  })

  it('anchors the availability panel to Monday even for a legacy weekend session', () => {
    const state = snapshot()
    state.workshops[0].scheduledStart = vancouverToUtc('2027-01-09', 600)
    state.workshops[0].scheduledEnd = vancouverToUtc('2027-01-09', 660)
    const plan = matchPlanSchema.parse(matchWorkshops(state, ['session']))
    expect(
      previewStaffingView(state, plan, 'session', {}).candidates[0].availability[0]
    ).toMatchObject({ day: 'Monday', date: '2027-01-04' })
  })
  it('invalidates when lifetime fairness totals change', () => {
    const state = snapshot()
    const before = scheduleHash(state)
    state.assignmentTotals = { pa: 5 }
    expect(scheduleHash(state)).not.toBe(before)
  })

  it('keeps the same revision when aggregate counts arrive in a different database order', () => {
    const state = snapshot()
    state.assignmentTotals = { pa: 4, second: 2, third: 1 }
    const before = scheduleHash(state)
    state.assignmentTotals = { third: 1, pa: 4, second: 2 }
    expect(scheduleHash(state)).toBe(before)
    state.assignmentTotals.second = 3
    expect(scheduleHash(state)).not.toBe(before)
  })

  it('ignores removed monthly quota and rolling-gap settings', () => {
    const state = snapshot()
    const before = scheduleHash(state)
    state.minimumGapDays = 30
    state.quotas = []
    expect(scheduleHash(state)).toBe(before)
  })
})
