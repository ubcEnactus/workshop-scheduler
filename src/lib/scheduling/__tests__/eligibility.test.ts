import { describe, expect, it } from 'vitest'
import {
  eligibility,
  workload,
  type ScheduleSnapshot,
  type ScheduledWorkshop,
} from '../eligibility'
import { vancouverToUtc } from '@/lib/time'

function workshop(id: string, date = '2025-03-31', start = 600, end = 660): ScheduledWorkshop {
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
    minimumGapDays: 1,
    pas: [{ id: 'pa', name: 'PA', email: 'pa@test.local' }],
    availability: [0, 1].flatMap((dayOfWeek) =>
      Array.from({ length: 13 }, (_, i) => ({ userId: 'pa', dayOfWeek, startMin: 510 + 30 * i }))
    ),
    quotas: [
      { paId: 'pa', month: '2025-03', quota: 2 },
      { paId: 'pa', month: '2025-04', quota: 2 },
    ],
    workshops: [],
  }
}
describe('shared staffing eligibility', () => {
  it('requires explicit quota and gap and full-duration availability', () => {
    const s = snapshot(),
      w = workshop('one')
    expect(eligibility(s, w, 'pa')).toEqual([])
    s.quotas = []
    expect(eligibility(s, w, 'pa')).toContain('Monthly quota is missing.')
    s.minimumGapDays = null
    expect(eligibility(s, w, 'pa')).toContain(
      'Set a minimum assignment gap of 1 to 365 whole days.'
    )
    s.availability = s.availability.filter((a) => a.startMin !== 630)
    expect(eligibility(s, w, 'pa')).toContain('Availability does not cover the full workshop.')
  })
  it('counts completed commitments across classes but excludes cancelled and current work', () => {
    const s = snapshot(),
      w = workshop('one'),
      other = workshop('other', '2025-03-03')
    w.assignments = [{ paId: 'pa', status: 'DRAFT', source: 'MANUAL' }]
    other.assignments = [{ paId: 'pa', status: 'PUBLISHED', source: 'MANUAL' }]
    other.status = 'COMPLETED'
    s.workshops = [w, other]
    expect(workload(s, 'pa', '2025-03')).toBe(2)
    expect(eligibility(s, w, 'pa')).toEqual([])
    s.quotas[0].quota = 1
    expect(eligibility(s, w, 'pa')).toContain('Monthly quota reached.')
    other.status = 'CANCELLED'
    expect(eligibility(s, w, 'pa')).toEqual([])
    s.quotas[0].quota = 0
    expect(eligibility(s, w, 'pa')).toContain('Monthly quota reached.')
  })
  it('rejects same-school repeats across classes even when their times do not overlap', () => {
    const s = snapshot(),
      w = workshop('one'),
      next = workshop('next', '2025-03-31', 690, 750)
    next.assignments = [{ paId: 'pa', status: 'DRAFT', source: 'MANUAL' }]
    s.workshops = [w, next]
    expect(eligibility(s, w, 'pa')).toContain(
      'PA already has a workshop at this school on this Vancouver date.'
    )
    expect(eligibility(s, w, 'pa')).toContain('Insufficient gap between assignments.')
    next.scheduledStart = vancouverToUtc('2025-03-31', 720)
    expect(eligibility(s, w, 'pa')).toContain('Insufficient gap between assignments.')
    next.scheduledStart = vancouverToUtc('2025-03-31', 630)
    expect(eligibility(s, w, 'pa')).toContain('Conflicting assignment.')
    const april = workshop('april', '2025-04-01')
    w.assignments = [{ paId: 'pa', status: 'PUBLISHED', source: 'MANUAL' }]
    s.workshops = [w]
    expect(eligibility(s, april, 'pa')).toEqual([])
    s.minimumGapDays = 2
    expect(eligibility(s, april, 'pa')).toContain('Insufficient gap between assignments.')
  })
  it.each([
    ['2025-03-07', '2025-03-10', 3],
    ['2025-10-31', '2025-11-03', 3],
    ['2025-12-31', '2026-01-01', 1],
    ['2024-02-28', '2024-03-01', 2],
  ])('uses calendar days across DST and boundaries: %s to %s', (first, second, days) => {
    const s = snapshot()
    const earlier = workshop('earlier', first, 840, 900)
    const later = workshop('later', second, 540, 600)
    s.minimumGapDays = days
    s.availability = [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
      Array.from({ length: 48 }, (_, i) => ({ userId: 'pa', dayOfWeek, startMin: i * 30 }))
    )
    s.quotas = [...new Set([first.slice(0, 7), second.slice(0, 7)])].map((month) => ({
      paId: 'pa',
      month,
      quota: 10,
    }))
    earlier.assignments = [{ paId: 'pa', status: 'PUBLISHED', source: 'MANUAL' }]
    s.workshops = [earlier]
    expect(eligibility(s, later, 'pa')).toEqual([])
    s.minimumGapDays = days + 1
    expect(eligibility(s, later, 'pa')).toContain('Insufficient gap between assignments.')
    earlier.assignments = []
    later.assignments = [{ paId: 'pa', status: 'PUBLISHED', source: 'MANUAL' }]
    s.workshops = [later]
    expect(eligibility(s, earlier, 'pa')).toContain('Insufficient gap between assignments.')
    s.minimumGapDays = days
    expect(eligibility(s, earlier, 'pa')).toEqual([])
  })
  it('uses Vancouver dates even when UTC dates differ and distinguishes other schools and PAs', () => {
    const s = snapshot()
    const w = workshop('one', '2025-03-31', 1020, 1080)
    const other = workshop('other', '2025-03-31', 900, 960)
    other.assignments = [{ paId: 'pa', status: 'DRAFT', source: 'MANUAL' }]
    s.workshops = [other]
    expect(w.scheduledStart.toISOString().slice(0, 10)).not.toBe(
      other.scheduledStart.toISOString().slice(0, 10)
    )
    const reason = 'PA already has a workshop at this school on this Vancouver date.'
    expect(eligibility(s, w, 'pa')).toContain(reason)
    other.schoolId = 'another-school'
    expect(eligibility(s, w, 'pa')).not.toContain(reason)
    expect(eligibility(s, w, 'pa')).toContain('Insufficient gap between assignments.')
    other.schoolId = w.schoolId
    other.assignments[0].paId = 'another-pa'
    expect(eligibility(s, w, 'pa')).not.toContain(reason)
    expect(eligibility(s, w, 'pa')).not.toContain('Insufficient gap between assignments.')
  })
  it('allows adjacent Vancouver dates that share one UTC date', () => {
    const s = snapshot()
    const earlier = workshop('earlier', '2025-03-31', 1380, 1410)
    const later = workshop('later', '2025-04-01', 0, 30)
    earlier.assignments = [{ paId: 'pa', status: 'PUBLISHED', source: 'MANUAL' }]
    s.workshops = [earlier]
    s.availability = [0, 1].flatMap((dayOfWeek) =>
      Array.from({ length: 48 }, (_, i) => ({ userId: 'pa', dayOfWeek, startMin: i * 30 }))
    )
    expect(earlier.scheduledStart.toISOString().slice(0, 10)).toBe(
      later.scheduledStart.toISOString().slice(0, 10)
    )
    expect(eligibility(s, later, 'pa')).toEqual([])
  })
  it.each(['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'] as const)(
    'handles a %s same-day commitment and excludes the current workshop',
    (status) => {
      const s = snapshot(),
        w = workshop('one'),
        other = workshop('other', '2025-03-31', 720, 780)
      w.assignments = [{ paId: 'pa', status: 'DRAFT', source: 'MANUAL' }]
      other.assignments = [{ paId: 'pa', status: 'PUBLISHED', source: 'MANUAL' }]
      other.status = status
      s.quotas[0].quota = 10
      s.workshops = [w, other]
      const reason = 'PA already has a workshop at this school on this Vancouver date.'
      if (status === 'CANCELLED') expect(eligibility(s, w, 'pa')).toEqual([])
      else expect(eligibility(s, w, 'pa')).toContain(reason)
      s.workshops = [w]
      expect(eligibility(s, w, 'pa')).toEqual([])
    }
  )
  it.each([null, 0, -1, 1.5, 366, Number.NaN])('rejects invalid gap configuration %s', (gap) => {
    const s = snapshot()
    s.minimumGapDays = gap
    expect(eligibility(s, workshop('one'), 'pa')).toContain(
      'Set a minimum assignment gap of 1 to 365 whole days.'
    )
  })
  it('rejects inactive PAs and staffing above capacity', () => {
    const s = snapshot(),
      w = workshop('one')
    w.maxPAs = 1
    w.assignments = [{ paId: 'other', status: 'DRAFT', source: 'MANUAL' }]
    expect(eligibility(s, w, 'pa')).toContain('Staffing capacity reached.')
    expect(eligibility(s, w, 'removed')).toContain('PA account is inactive.')
  })
})
