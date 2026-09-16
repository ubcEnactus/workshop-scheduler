import { describe, expect, it } from 'vitest'
import { matchWorkshops } from './matcher'
import type { ScheduleSnapshot, ScheduledWorkshop } from './eligibility'
import { vancouverToUtc } from '@/lib/time'
function workshop(id: string, date = '2027-01-04', minute = 600): ScheduledWorkshop {
  return {
    id,
    classSectionId: id,
    schoolId: 'school',
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
function snapshot(workshops: ScheduledWorkshop[]): ScheduleSnapshot {
  return {
    minimumGapDays: 1,
    pas: ['a', 'b'].map((id) => ({ id, name: id, email: id + '@test.local' })),
    availability: ['a', 'b'].flatMap((userId) =>
      [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
        Array.from({ length: 13 }, (_, i) => ({ userId, dayOfWeek, startMin: 510 + i * 30 }))
      )
    ),
    quotas: ['a', 'b'].map((paId) => ({ paId, month: '2027-01', quota: 4 })),
    workshops,
  }
}
describe('pure automatic matcher', () => {
  it('prioritizes scarce slots and fills every minimum before optional capacity', () => {
    const early = workshop('early'),
      scarce = workshop('scarce', '2027-01-04', 720)
    early.maxPAs = 2
    const s = snapshot([early, scarce])
    s.availability = s.availability.filter((a) => a.userId !== 'b' || a.startMin < 720)
    s.quotas.forEach((q) => (q.quota = 1))
    const result = matchWorkshops(s, ['early', 'scarce'])
    expect(result.find((p) => p.workshopId === 'scarce')?.paIds).toEqual(['a'])
    expect(result.find((p) => p.workshopId === 'early')?.paIds).toEqual(['b'])
  })
  it('balances proportionally toward uneven quotas with deterministic ties', () => {
    const ws = Array.from({ length: 4 }, (_, i) =>
      workshop(String(i), '2027-01-' + String(4 + i * 7).padStart(2, '0'))
    )
    const s = snapshot(ws)
    s.quotas[0].quota = 1
    s.quotas[1].quota = 3
    const output = matchWorkshops(
      s,
      ws.map((w) => w.id)
    )
    expect(output.flatMap((p) => p.paIds).filter((id) => id === 'a')).toHaveLength(1)
    expect(output.flatMap((p) => p.paIds).filter((id) => id === 'b')).toHaveLength(3)
    expect(matchWorkshops(s, ws.map((w) => w.id).reverse())).toEqual(output)
  })
  it('preserves manual, locked, published and historical work and leaves input dates unchanged', () => {
    const ws = ['manual', 'locked', 'published', 'completed', 'cancelled', 'auto'].map((id) =>
      workshop(id)
    )
    ws[0].assignments = [{ paId: 'a', status: 'DRAFT', source: 'MANUAL' }]
    ws[1].locked = true
    ws[2].status = 'PUBLISHED'
    ws[3].status = 'COMPLETED'
    ws[4].status = 'CANCELLED'
    const s = snapshot(ws),
      before = JSON.stringify(s)
    const output = matchWorkshops(
      s,
      ws.map((w) => w.id)
    )
    expect(output.filter((p) => p.protected)).toHaveLength(5)
    expect(JSON.stringify(s)).toBe(before)
    expect(Object.keys(output[0]).sort()).toEqual(['paIds', 'protected', 'reasons', 'workshopId'])
  })
  it('reports missing and zero quotas, unavailable PAs and adjacent-month conflicts', () => {
    const w = workshop('target', '2027-02-01', 540),
      prior = workshop('prior', '2027-01-29', 840)
    prior.status = 'PUBLISHED'
    prior.assignments = [{ paId: 'a', status: 'PUBLISHED', source: 'MANUAL' }]
    const s = snapshot([w, prior])
    s.minimumGapDays = 4
    s.quotas = [
      { paId: 'a', month: '2027-02', quota: 1 },
      { paId: 'b', month: '2027-02', quota: 0 },
    ]
    const output = matchWorkshops(s, ['target'])[0]
    expect(output.paIds).toEqual([])
    expect(output.reasons.join(' ')).toContain('Insufficient gap')
    expect(output.reasons.join(' ')).toContain('quota reached')
    s.quotas = []
    s.availability = []
    expect(matchWorkshops(s, ['target'])[0].reasons.join(' ')).toContain('quota is missing')
    expect(matchWorkshops(s, ['target'])[0].reasons.join(' ')).toContain('Availability is missing')
  })
  it('reruns automatic drafts without inflating quota counts', () => {
    const w = workshop('target')
    w.assignments = [{ paId: 'a', status: 'DRAFT', source: 'AUTOMATIC' }]
    const s = snapshot([w])
    s.quotas.forEach((q) => (q.quota = 1))
    expect(matchWorkshops(s, ['target'])[0].paIds).toEqual(['a'])
  })
  it('never staffs two same-school classes on one date with the same PA on a rerun', () => {
    const early = workshop('early'),
      later = workshop('later', '2027-01-04', 720)
    const s = snapshot([early, later])
    s.pas = s.pas.filter((pa) => pa.id === 'a')
    const initial = matchWorkshops(s, ['early', 'later'])
    expect(initial.flatMap((proposal) => proposal.paIds)).toEqual(['a'])
    expect(
      initial.find((proposal) => proposal.workshopId === 'later')?.reasons.join(' ')
    ).toContain('already has a workshop at this school')
    early.assignments = [{ paId: 'a', status: 'DRAFT', source: 'AUTOMATIC' }]
    expect(matchWorkshops(s, ['early', 'later'])).toEqual(initial)
    expect(matchWorkshops(s, ['later', 'early'])).toEqual(initial)
  })
  it('respects same-school commitments outside the match scope and frees cancelled visits', () => {
    const protectedVisit = workshop('protected'),
      target = workshop('target', '2027-01-04', 720)
    protectedVisit.status = 'PUBLISHED'
    protectedVisit.assignments = [{ paId: 'a', status: 'PUBLISHED', source: 'MANUAL' }]
    const s = snapshot([protectedVisit, target])
    s.pas = s.pas.filter((pa) => pa.id === 'a')
    expect(matchWorkshops(s, ['target'])[0].paIds).toEqual([])
    expect(matchWorkshops(s, ['target'])[0].reasons.join(' ')).toContain(
      'already has a workshop at this school'
    )
    protectedVisit.status = 'CANCELLED'
    expect(matchWorkshops(s, ['target'])[0].paIds).toEqual(['a'])
  })
})
