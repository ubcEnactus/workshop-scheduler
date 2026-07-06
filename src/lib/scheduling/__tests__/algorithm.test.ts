import { describe, expect, it } from 'vitest'
import { runSchedule, PAAvailability } from '../algorithm'
import type { Assignment, ClassMeeting, Cycle, Workshop } from '@prisma/client'

const mockCycle: Cycle = {
  id: 'cycle-1',
  name: 'Week 1 – June 2026',
  startDate: new Date('2026-06-08T00:00:00Z'),
  endDate: new Date('2026-06-12T00:00:00Z'),
  status: 'OPEN',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockClassMeetings: ClassMeeting[] = [
  { id: 'cm-1', classSectionId: 'cs-1', dayOfWeek: 0, startMinute: 540, endMinute: 600 }, // Mon 09:00 - 10:00
  { id: 'cm-2', classSectionId: 'cs-2', dayOfWeek: 2, startMinute: 840, endMinute: 900 }, // Wed 14:00 - 15:00
  { id: 'cm-3', classSectionId: 'cs-3', dayOfWeek: 4, startMinute: 660, endMinute: 720 }, // Fri 11:00 - 12:00
]

const mockWorkshops: Workshop[] = [
  {
    id: 'ws-1',
    cycleId: 'cycle-1',
    classSectionId: 'cs-1',
    minPAs: 1,
    maxPAs: 2,
    status: 'UNSCHEDULED',
    scheduledStart: null,
    scheduledEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'ws-2',
    cycleId: 'cycle-1',
    classSectionId: 'cs-2',
    minPAs: 1,
    maxPAs: 3,
    status: 'UNSCHEDULED',
    scheduledStart: null,
    scheduledEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'ws-3',
    cycleId: 'cycle-1',
    classSectionId: 'cs-3',
    minPAs: 3,
    maxPAs: 4,
    status: 'UNSCHEDULED',
    scheduledStart: null,
    scheduledEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const mockAvailabilities: PAAvailability[] = [
  { paId: 'pa-1', dayOfWeek: 0, startMinute: 480, endMinute: 660 }, // Mon 08-11
  { paId: 'pa-1', dayOfWeek: 2, startMinute: 780, endMinute: 960 }, // Wed 13-16
  { paId: 'pa-2', dayOfWeek: 0, startMinute: 480, endMinute: 660 }, // Mon 08-11
  { paId: 'pa-2', dayOfWeek: 4, startMinute: 600, endMinute: 780 }, // Fri 10-13
  { paId: 'pa-3', dayOfWeek: 2, startMinute: 780, endMinute: 960 }, // Wed 13-16
  { paId: 'pa-3', dayOfWeek: 4, startMinute: 600, endMinute: 780 }, // Fri 10-13
]

let idCounter = 1
const generateId = () => `a-${idCounter++}`

describe('runSchedule', () => {
  it('schedules ws-1 (Mon) into a valid slot with Alice and Bob', () => {
    const { workshops, assignments } = runSchedule(
      mockCycle,
      mockClassMeetings,
      mockWorkshops,
      [],
      mockAvailabilities,
      generateId
    )

    const ws = workshops.find((w) => w.id === 'ws-1')!
    expect(ws.status).toBe('SCHEDULED')
    // scheduledStart should be UTC representation of Vancouver 09:00 on June 8, 2026.
    // Vancouver is PDT (UTC-7) in June, so UTC should be 16:00
    expect(ws.scheduledStart?.toISOString()).toBe('2026-06-08T16:00:00.000Z')
    expect(ws.scheduledEnd?.toISOString()).toBe('2026-06-08T17:00:00.000Z')

    const paIds = assignments.filter((a) => a.workshopId === 'ws-1').map((a) => a.paId)
    expect(paIds).toContain('pa-1') // Alice
    expect(paIds).toContain('pa-2') // Bob
    expect(paIds.length).toBeLessThanOrEqual(2) // maxPAs=2
  })

  it('schedules ws-2 (Wed) into a valid slot with Alice and Carol', () => {
    const { workshops, assignments } = runSchedule(
      mockCycle,
      mockClassMeetings,
      mockWorkshops,
      [],
      mockAvailabilities,
      generateId
    )

    const ws = workshops.find((w) => w.id === 'ws-2')!
    expect(ws.status).toBe('SCHEDULED')
    expect(ws.scheduledStart?.toISOString()).toBe('2026-06-10T21:00:00.000Z') // Wed 14:00 + 7h = 21:00

    const paIds = assignments.filter((a) => a.workshopId === 'ws-2').map((a) => a.paId)
    expect(paIds).toContain('pa-1') // Alice
    expect(paIds).toContain('pa-3') // Carol
  })

  it('flags ws-3 (Fri, minPAs=3) as UNSCHEDULED when only 2 PAs are available', () => {
    const { workshops, assignments } = runSchedule(
      mockCycle,
      mockClassMeetings,
      mockWorkshops,
      [],
      mockAvailabilities,
      generateId
    )

    const ws = workshops.find((w) => w.id === 'ws-3')!
    expect(ws.status).toBe('UNSCHEDULED')

    const paIds = assignments.filter((a) => a.workshopId === 'ws-3')
    expect(paIds.length).toBe(0)
  })

  it('day/time matching: ClassMeeting dayOfWeek=0 maps to 2026-06-08 (Monday)', () => {
    const { workshops } = runSchedule(
      mockCycle,
      mockClassMeetings,
      mockWorkshops,
      [],
      mockAvailabilities,
      generateId
    )
    const ws = workshops.find((w) => w.id === 'ws-1')!
    // 2026-06-08 is a Monday — regression test for 0=Mon alignment
    expect(ws.scheduledStart?.toISOString().startsWith('2026-06-08')).toBe(true)
  })

  it('day/time matching: ClassMeeting dayOfWeek=4 maps to 2026-06-12 (Friday)', () => {
    // ws-3 is UNSCHEDULED but its meeting is on Fri — check via ws-3's class meeting date
    // indirectly: run with a patched ws-3 that has minPAs=1
    const patchedWorkshops = mockWorkshops.map((w) => (w.id === 'ws-3' ? { ...w, minPAs: 1 } : w))
    const { workshops } = runSchedule(
      mockCycle,
      mockClassMeetings,
      patchedWorkshops,
      [],
      mockAvailabilities,
      generateId
    )
    const ws2 = workshops.find((w) => w.id === 'ws-2')!
    expect(ws2.scheduledStart?.toISOString().startsWith('2026-06-10')).toBe(true) // Wednesday
    const ws3 = workshops.find((w) => w.id === 'ws-3')!
    expect(ws3.scheduledStart?.toISOString().startsWith('2026-06-12')).toBe(true) // Friday
  })
})

describe('idempotency', () => {
  it('running the algorithm twice produces the same result as running it once', () => {
    const first = runSchedule(
      mockCycle,
      mockClassMeetings,
      mockWorkshops,
      [],
      mockAvailabilities,
      generateId
    )
    // Running again using first output
    const second = runSchedule(
      mockCycle,
      mockClassMeetings,
      first.workshops,
      first.assignments as Assignment[],
      mockAvailabilities,
      generateId
    )

    const firstScheduled = first.workshops.filter((w) => w.status === 'SCHEDULED').map((w) => w.id)
    const secondScheduled = second.workshops
      .filter((w) => w.status === 'SCHEDULED')
      .map((w) => w.id)
    expect(firstScheduled.sort()).toEqual(secondScheduled.sort())
  })
})

describe('PA conflict avoidance', () => {
  it('does not double-book a PA across two workshops in the same time slot', () => {
    // Point ws-2 at the same class meeting as ws-1 (both Mon 09:00–10:00)
    // Alice and Bob are available Mon — they should be split, not shared
    const patchedWorkshops = mockWorkshops.map((w) =>
      w.id === 'ws-2' ? { ...w, classSectionId: 'cs-1' } : w
    )

    const { assignments, workshops } = runSchedule(
      mockCycle,
      mockClassMeetings,
      patchedWorkshops,
      [],
      mockAvailabilities,
      generateId
    )

    const monAssignments = assignments.filter((a) => {
      const ws = workshops.find((w) => w.id === a.workshopId)
      return ws?.scheduledStart?.toISOString().startsWith('2026-06-08')
    })

    // Count how many workshops each PA is assigned to on Mon
    const paWorkshopCount = new Map<string, Set<string>>()
    for (const a of monAssignments) {
      if (!paWorkshopCount.has(a.paId)) paWorkshopCount.set(a.paId, new Set())
      paWorkshopCount.get(a.paId)!.add(a.workshopId)
    }

    // No PA should appear in more than one workshop at the same slot
    for (const [, workshopIds] of paWorkshopCount) {
      expect(workshopIds.size).toBe(1)
    }
  })
})
