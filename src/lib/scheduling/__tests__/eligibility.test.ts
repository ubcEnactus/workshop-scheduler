import { describe, expect, it } from 'vitest'
import {
  assessAssignment,
  assignmentPolicyHash,
  eligibility,
  manualAssignmentDecision,
  totalAssignments,
  type ScheduleSnapshot,
  type ScheduledWorkshop,
} from '../eligibility'
import { vancouverToUtc } from '@/lib/time'

function workshop(id: string, date = '2027-01-04', start = 600, end = 660): ScheduledWorkshop {
  return {
    id,
    classSectionId: id,
    schoolId: 'school',
    scheduledStart: vancouverToUtc(date, start),
    scheduledEnd: vancouverToUtc(date, end),
    minPAs: 1,
    maxPAs: 3,
    status: 'DRAFT',
    version: 0,
    locked: false,
    activeClass: true,
    assignments: [],
  }
}

function snapshot(): ScheduleSnapshot {
  return {
    minimumGapDays: null,
    pas: [{ id: 'pa', name: 'PA', email: 'pa@test.local' }],
    availability: [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
      Array.from({ length: 28 }, (_, index) => ({
        userId: 'pa',
        dayOfWeek,
        startMin: 510 + 15 * index,
        effectiveFrom: '2020-01-01',
      }))
    ),
    quotas: [],
    workshops: [],
  }
}

const assignment = (paId = 'pa') => ({
  paId,
  status: 'DRAFT' as const,
  source: 'MANUAL' as const,
})

describe('shared staffing assessment', () => {
  it('does not require a quota or legacy rolling-day gap', () => {
    const state = snapshot()
    state.minimumGapDays = null
    state.quotas = []
    expect(assessAssignment(state, workshop('target'), 'pa')).toMatchObject({
      hardErrors: [],
      manualWarnings: [],
      manualEligible: true,
      automaticEligible: true,
      totalAssignments: 0,
    })
  })

  it.each([
    { availability: 'missing', message: 'Availability is missing.' },
    { availability: 'partial', message: 'Availability does not cover the full workshop.' },
  ])(
    'warns about $availability availability without blocking an admin choice',
    ({ availability, message }) => {
      const state = snapshot()
      const target = workshop('target')
      state.availability =
        availability === 'missing' ? [] : state.availability.filter((slot) => slot.startMin !== 630)
      const assessment = assessAssignment(state, target, 'pa')
      expect(assessment).toMatchObject({
        hardErrors: [],
        availabilityWarnings: [message],
        manualWarnings: [],
        manualEligible: true,
        automaticEligible: false,
      })
      expect(
        manualAssignmentDecision(state, target, 'pa', {
          expectedPolicyHash: assignmentPolicyHash(target, 'pa', assessment),
        })
      ).toMatchObject({
        ok: true,
        overrideAvailability: true,
        overrideSameDay: false,
        overrideWeek: false,
        overrideReason: null,
      })
    }
  )

  it('still hard-blocks an overlapping assignment when availability is also missing', () => {
    const state = snapshot()
    const target = workshop('target')
    state.availability = []
    const overlap = workshop('overlap', '2027-01-04', 630, 690)
    overlap.schoolId = 'another-school'
    overlap.assignments = [assignment()]
    state.workshops = [overlap]
    const assessment = assessAssignment(state, target, 'pa')
    expect(assessment.hardErrors).toContain('Conflicting assignment.')
    expect(assessment.availabilityWarnings).toEqual(['Availability is missing.'])
    expect(assessment.manualEligible).toBe(false)
    expect(
      manualAssignmentDecision(state, target, 'pa', {
        expectedPolicyHash: assignmentPolicyHash(target, 'pa', assessment),
        overrideReason: 'Cannot bypass a hard conflict',
      })
    ).toMatchObject({ ok: false, reasons: expect.arrayContaining(['Conflicting assignment.']) })
  })

  it('does not record an availability exception when coverage is complete', () => {
    const state = snapshot()
    const target = workshop('target')
    const assessment = assessAssignment(state, target, 'pa')
    expect(assessment.availabilityWarnings).toEqual([])
    expect(
      manualAssignmentDecision(state, target, 'pa', {
        expectedPolicyHash: assignmentPolicyHash(target, 'pa', assessment),
      })
    ).toMatchObject({ ok: true, overrideAvailability: false })
  })

  it('only honors an explicitly saved availability exception, without hiding the warning', () => {
    const state = snapshot()
    state.availability = []
    const target = workshop('target')
    target.assignments = [assignment()]
    state.workshops = [target]
    expect(eligibility(state, target, 'pa')).toEqual(['Availability is missing.'])
    target.assignments[0].overrideAvailability = true
    expect(eligibility(state, target, 'pa')).toEqual([])
    expect(assessAssignment(state, target, 'pa')).toMatchObject({
      availabilityWarnings: ['Availability is missing.'],
      automaticEligible: false,
    })
    state.pas = []
    expect(eligibility(state, target, 'pa')).toContain('PA account is inactive.')
  })

  it('requires a fresh policy hash when coverage changes into a warning', () => {
    const state = snapshot()
    const target = workshop('target')
    const expectedPolicyHash = assignmentPolicyHash(
      target,
      'pa',
      assessAssignment(state, target, 'pa')
    )
    state.availability = []
    const assessment = assessAssignment(state, target, 'pa')
    expect(assignmentPolicyHash(target, 'pa', assessment)).not.toBe(expectedPolicyHash)
    expect(
      manualAssignmentDecision(state, target, 'pa', {
        expectedPolicyHash,
      })
    ).toMatchObject({ ok: false })
  })

  it('records a same-day workload choice without confirmation or reason and revalidates its hash', () => {
    const state = snapshot()
    const target = workshop('target', '2027-01-04', 600, 660)
    const later = workshop('later', '2027-01-04', 720, 780)
    later.schoolId = 'another-school'
    later.assignments = [assignment()]
    state.workshops = [later]

    const assessment = assessAssignment(state, target, 'pa')
    expect(assessment).toMatchObject({
      hardErrors: [],
      manualEligible: true,
      automaticEligible: false,
    })
    expect(assessment.manualWarnings.map((warning) => warning.code)).toEqual([
      'SAME_DAY',
      'SAME_WEEK',
    ])
    expect(assessment.manualWarnings[0].commitments[0].minutesBetween).toBe(60)

    const expectedPolicyHash = assignmentPolicyHash(target, 'pa', assessment)
    expect(
      manualAssignmentDecision(state, target, 'pa', {
        expectedPolicyHash,
      })
    ).toMatchObject({ ok: true, overrideSameDay: true, overrideWeek: true, overrideReason: null })
    expect(
      manualAssignmentDecision(state, target, 'pa', {
        expectedPolicyHash: 'stale',
      })
    ).toMatchObject({ ok: false })
  })

  it('keeps consecutive same-school sessions as a separate hard block', () => {
    const state = snapshot()
    state.availability = []
    const target = workshop('target', '2027-01-04', 600, 660)
    const next = workshop('next', '2027-01-04', 660, 720)
    next.assignments = [assignment()]
    state.workshops = [next]
    const assessment = assessAssignment(state, target, 'pa')
    expect(assessment.hardErrors).toContain(
      'PA cannot teach consecutive sessions at the same school.'
    )
    expect(assessment.manualWarnings.map((warning) => warning.code)).toContain('SAME_DAY')
  })

  it.each([
    { date: '2027-01-04', sameDay: true },
    { date: '2027-01-05', sameDay: false },
  ])(
    'records workload and availability warnings without confirmations or a reason ($date)',
    ({ date, sameDay }) => {
      const state = snapshot()
      state.availability = []
      const target = workshop('target')
      const existing = workshop('existing', date, 720, 780)
      existing.schoolId = 'another-school'
      existing.assignments = [assignment()]
      state.workshops = [existing]
      const assessment = assessAssignment(state, target, 'pa')
      const input = {
        expectedPolicyHash: assignmentPolicyHash(target, 'pa', assessment),
      }
      expect(manualAssignmentDecision(state, target, 'pa', input)).toMatchObject({
        ok: true,
        overrideAvailability: true,
        overrideSameDay: sameDay,
        overrideWeek: true,
        overrideReason: null,
      })
      expect(assessment.automaticEligible).toBe(false)
    }
  )

  it('uses Monday–Friday Vancouver weeks and resets on the following Monday', () => {
    const state = snapshot()
    const monday = workshop('monday', '2027-01-04')
    const friday = workshop('friday', '2027-01-08')
    monday.assignments = [assignment()]
    state.workshops = [monday]
    expect(
      assessAssignment(state, friday, 'pa').manualWarnings.map((warning) => warning.code)
    ).toEqual(['SAME_WEEK'])

    const nextMonday = workshop('next-monday', '2027-01-11')
    expect(assessAssignment(state, nextMonday, 'pa').automaticEligible).toBe(true)
  })

  it('honors a saved workload exception for publication without making it automatic eligibility', () => {
    const state = snapshot()
    const existing = workshop('existing', '2027-01-04', 720, 780)
    existing.schoolId = 'another-school'
    existing.assignments = [assignment()]
    const target = workshop('target')
    target.assignments = [
      {
        ...assignment(),
        overrideSameDay: true,
        overrideWeek: true,
        overrideReason: 'Reviewed by an admin.',
      },
    ]
    state.workshops = [existing, target]
    expect(eligibility(state, target, 'pa')).toEqual([])
    expect(assessAssignment(state, target, 'pa').automaticEligible).toBe(false)
    expect(eligibility(state, existing, 'pa')).toEqual([])
  })

  it('does not grandfather old manual assignments with unapproved workload warnings', () => {
    const state = snapshot()
    const existing = workshop('existing', '2027-01-04', 720, 780)
    existing.schoolId = 'another-school'
    existing.assignments = [assignment()]
    const target = workshop('target')
    target.assignments = [assignment()]
    state.workshops = [existing, target]
    expect(eligibility(state, target, 'pa')).toEqual([
      'Already assigned another session on this day.',
      'Already assigned another session in this Monday–Friday week.',
    ])
  })

  it('invalidates a reviewed policy hash when travel context changes', () => {
    const state = snapshot()
    const target = workshop('target')
    const other = workshop('other', '2027-01-04', 720, 780)
    other.assignments = [assignment()]
    other.schoolName = 'First school'
    other.location = 'Room 101'
    state.workshops = [other]
    const before = assessAssignment(state, target, 'pa')
    const beforeHash = assignmentPolicyHash(target, 'pa', before)
    other.location = 'Remote campus'
    const after = assessAssignment(state, target, 'pa')
    expect(assignmentPolicyHash(target, 'pa', after)).not.toBe(beforeHash)
  })

  it('counts all active assignment records for fairness and excludes cancelled sessions', () => {
    const state = snapshot()
    const completed = workshop('completed', '2026-11-02')
    completed.status = 'COMPLETED'
    completed.assignments = [assignment()]
    const cancelled = workshop('cancelled', '2026-12-07')
    cancelled.status = 'CANCELLED'
    cancelled.assignments = [assignment()]
    state.workshops = [completed, cancelled]
    expect(totalAssignments(state, 'pa')).toBe(1)
  })

  it('applies bounded-preview deltas to the lifetime assignment aggregate', () => {
    const state = snapshot()
    const existing = workshop('existing')
    existing.assignments = [assignment()]
    state.workshops = [existing]
    state.assignmentTotals = { pa: 12 }
    state.baselineAssignmentKeys = ['existing:pa']

    expect(totalAssignments(state, 'pa')).toBe(12)
    existing.assignments = []
    expect(totalAssignments(state, 'pa')).toBe(11)

    const proposed = workshop('proposed')
    proposed.assignments = [assignment()]
    state.workshops.push(proposed)
    expect(totalAssignments(state, 'pa')).toBe(12)
    expect(totalAssignments(state, 'pa', proposed.id)).toBe(11)
  })

  it('applies dated availability exceptions without changing recurring rows', () => {
    const state = snapshot()
    const target = workshop('target')
    state.availabilityExceptions = [
      { userId: 'pa', date: '2027-01-04', kind: 'UNAVAILABLE', startMinute: 630, endMinute: 645 },
    ]
    expect(assessAssignment(state, target, 'pa').availabilityWarnings).toContain(
      'Availability does not cover the full workshop.'
    )
  })
})
