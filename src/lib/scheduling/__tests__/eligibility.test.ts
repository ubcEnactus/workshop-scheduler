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
    minimumGapMinutes: 60,
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
    s.minimumGapMinutes = null
    expect(eligibility(s, w, 'pa')).toContain('Set a positive minimum assignment gap.')
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
  it('enforces gaps at the same school and across a month boundary', () => {
    const s = snapshot(),
      w = workshop('one'),
      next = workshop('next', '2025-03-31', 690, 750)
    next.assignments = [{ paId: 'pa', status: 'DRAFT', source: 'MANUAL' }]
    s.workshops = [w, next]
    expect(eligibility(s, w, 'pa')).toContain('Insufficient gap between assignments.')
    next.scheduledStart = vancouverToUtc('2025-03-31', 720)
    expect(eligibility(s, w, 'pa')).toEqual([])
    next.scheduledStart = vancouverToUtc('2025-03-31', 630)
    expect(eligibility(s, w, 'pa')).toContain('Conflicting assignment.')
    const april = workshop('april', '2025-04-01')
    w.assignments = [{ paId: 'pa', status: 'PUBLISHED', source: 'MANUAL' }]
    s.workshops = [w]
    s.minimumGapMinutes = 1440
    expect(eligibility(s, april, 'pa')).toContain('Insufficient gap between assignments.')
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
