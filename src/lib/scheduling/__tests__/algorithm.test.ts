import { describe, expect, it } from 'vitest'
import { runSchedule, PAAvailability, ScheduleInput } from '../algorithm'
import { coalesceAvailability } from '../availability'
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

function makeInput(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    cycle: mockCycle,
    classMeetings: mockClassMeetings,
    workshops: mockWorkshops,
    assignments: [],
    availabilities: mockAvailabilities,
    paCommunities: new Map(),
    workshopSchoolCommunities: new Map(),
    assignmentCounts: new Map(),
    quotas: new Map(),
    generateId,
    ...overrides,
  }
}

describe('runSchedule', () => {
  it('schedules ws-1 (Mon) into a valid slot with Alice and Bob', () => {
    const { workshops, assignments } = runSchedule(makeInput())

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
    const { workshops, assignments } = runSchedule(makeInput())

    const ws = workshops.find((w) => w.id === 'ws-2')!
    expect(ws.status).toBe('SCHEDULED')
    expect(ws.scheduledStart?.toISOString()).toBe('2026-06-10T21:00:00.000Z') // Wed 14:00 + 7h = 21:00

    const paIds = assignments.filter((a) => a.workshopId === 'ws-2').map((a) => a.paId)
    expect(paIds).toContain('pa-1') // Alice
    expect(paIds).toContain('pa-3') // Carol
  })

  it('flags ws-3 (Fri, minPAs=3) as UNSCHEDULED when only 2 PAs are available', () => {
    const { workshops, assignments } = runSchedule(makeInput())

    const ws = workshops.find((w) => w.id === 'ws-3')!
    expect(ws.status).toBe('UNSCHEDULED')

    const paIds = assignments.filter((a) => a.workshopId === 'ws-3')
    expect(paIds.length).toBe(0)
  })

  it('day/time matching: ClassMeeting dayOfWeek=0 maps to 2026-06-08 (Monday)', () => {
    const { workshops } = runSchedule(makeInput())
    const ws = workshops.find((w) => w.id === 'ws-1')!
    // 2026-06-08 is a Monday — regression test for 0=Mon alignment
    expect(ws.scheduledStart?.toISOString().startsWith('2026-06-08')).toBe(true)
  })

  it('day/time matching: ClassMeeting dayOfWeek=4 maps to 2026-06-12 (Friday)', () => {
    const patchedWorkshops = mockWorkshops.map((w) => (w.id === 'ws-3' ? { ...w, minPAs: 1 } : w))
    const { workshops } = runSchedule(makeInput({ workshops: patchedWorkshops }))
    const ws2 = workshops.find((w) => w.id === 'ws-2')!
    expect(ws2.scheduledStart?.toISOString().startsWith('2026-06-10')).toBe(true) // Wednesday
    const ws3 = workshops.find((w) => w.id === 'ws-3')!
    expect(ws3.scheduledStart?.toISOString().startsWith('2026-06-12')).toBe(true) // Friday
  })
})

describe('idempotency', () => {
  it('running the algorithm twice produces the same result as running it once', () => {
    const first = runSchedule(makeInput())
    const second = runSchedule(
      makeInput({ workshops: first.workshops, assignments: first.assignments as Assignment[] })
    )

    const firstScheduled = first.workshops.filter((w) => w.status === 'SCHEDULED').map((w) => w.id)
    const secondScheduled = second.workshops
      .filter((w) => w.status === 'SCHEDULED')
      .map((w) => w.id)
    expect(firstScheduled.sort()).toEqual(secondScheduled.sort())
  })

  it('does not accumulate duplicate assignments across re-runs', () => {
    const first = runSchedule(makeInput())
    const second = runSchedule(
      makeInput({ workshops: first.workshops, assignments: first.assignments as Assignment[] })
    )

    // Same workshop staffed by the same PA must appear exactly once.
    const pairs = second.assignments.map((a) => `${a.workshopId}-${a.paId}`)
    expect(new Set(pairs).size).toBe(pairs.length)
    // And re-running must not grow the roster.
    expect(second.assignments.length).toBe(first.assignments.length)
  })

  it('carries confirmed assignments through without re-proposing them', () => {
    const first = runSchedule(makeInput())
    const confirmed = first.assignments.map((a) => ({ ...a, status: 'CONFIRMED' })) as Assignment[]
    const confirmedWorkshops = first.workshops.map((w) =>
      w.status === 'SCHEDULED' ? { ...w, status: 'CONFIRMED' as const } : w
    )

    const second = runSchedule(
      makeInput({ workshops: confirmedWorkshops, assignments: confirmed })
    )

    const pairs = second.assignments.map((a) => `${a.workshopId}-${a.paId}`)
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(second.assignments.every((a) => a.status === 'CONFIRMED')).toBe(true)
  })
})

describe('PA conflict avoidance', () => {
  it('does not double-book a PA across two workshops in the same time slot', () => {
    const patchedWorkshops = mockWorkshops.map((w) =>
      w.id === 'ws-2' ? { ...w, classSectionId: 'cs-1' } : w
    )

    const { assignments, workshops } = runSchedule(makeInput({ workshops: patchedWorkshops }))

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

describe('classes that meet more than once a week', () => {
  const twoMeetings: ClassMeeting[] = [
    { id: 'cm-a', classSectionId: 'cs-1', dayOfWeek: 0, startMinute: 540, endMinute: 600 }, // Mon 09:00–10:00
    { id: 'cm-b', classSectionId: 'cs-1', dayOfWeek: 3, startMinute: 540, endMinute: 600 }, // Thu 09:00–10:00
  ]
  const onlyWorkshop = [mockWorkshops[0]]

  it('uses the second meeting when nobody can cover the first', () => {
    const thursdayOnly: PAAvailability[] = [
      { paId: 'pa-9', dayOfWeek: 3, startMinute: 480, endMinute: 660 },
    ]

    const { workshops, assignments } = runSchedule(
      makeInput({ classMeetings: twoMeetings, workshops: onlyWorkshop, availabilities: thursdayOnly })
    )

    const ws = workshops.find((w) => w.id === 'ws-1')!
    expect(ws.status).toBe('SCHEDULED')
    // 2026-06-11 is the Thursday of the cycle week
    expect(ws.scheduledStart?.toISOString()).toBe('2026-06-11T16:00:00.000Z')
    expect(assignments.map((a) => a.paId)).toEqual(['pa-9'])
  })

  it('prefers the meeting more PAs can staff', () => {
    const lopsided: PAAvailability[] = [
      { paId: 'pa-1', dayOfWeek: 0, startMinute: 480, endMinute: 660 }, // Mon: 1 PA
      { paId: 'pa-2', dayOfWeek: 3, startMinute: 480, endMinute: 660 }, // Thu: 2 PAs
      { paId: 'pa-3', dayOfWeek: 3, startMinute: 480, endMinute: 660 },
    ]

    const { workshops } = runSchedule(
      makeInput({ classMeetings: twoMeetings, workshops: onlyWorkshop, availabilities: lopsided })
    )

    const ws = workshops.find((w) => w.id === 'ws-1')!
    expect(ws.scheduledStart?.toISOString().startsWith('2026-06-11')).toBe(true) // Thursday
  })
})

describe('availability sourced from ticked 30-minute slots', () => {
  it('staffs a 60-minute meeting from contiguous slots', () => {
    const ticked = [
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 540 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 570 },
    ]

    const { workshops, assignments } = runSchedule(
      makeInput({ workshops: [mockWorkshops[0]], availabilities: coalesceAvailability(ticked) })
    )

    expect(workshops.find((w) => w.id === 'ws-1')!.status).toBe('SCHEDULED')
    expect(assignments.map((a) => a.paId)).toEqual(['pa-1'])
  })

  it('leaves the workshop unscheduled when the ticked slots have a gap', () => {
    const ticked = [
      { userId: 'pa-1', dayOfWeek: 0, startMin: 510 },
      { userId: 'pa-1', dayOfWeek: 0, startMin: 570 },
    ]

    const { workshops, assignments } = runSchedule(
      makeInput({ workshops: [mockWorkshops[0]], availabilities: coalesceAvailability(ticked) })
    )

    expect(workshops.find((w) => w.id === 'ws-1')!.status).toBe('UNSCHEDULED')
    expect(assignments).toHaveLength(0)
  })
})

describe('blocked dates', () => {
  it('skips dates that are globally blocked', () => {
    const blockedDates = new Set(['*:2026-06-08']) // Monday is blocked globally
    const { workshops } = runSchedule(
      makeInput({
        workshops: [mockWorkshops[0]], // ws-1: Mon 09:00-10:00
        blockedDates,
      })
    )
    const ws = workshops.find((w) => w.id === 'ws-1')!
    expect(ws.status).toBe('UNSCHEDULED')
  })

  it('skips dates blocked for a specific school', () => {
    const blockedDates = new Set(['school-1:2026-06-08'])
    const workshopSchoolIds = new Map([['ws-1', 'school-1']])
    const { workshops } = runSchedule(
      makeInput({
        workshops: [mockWorkshops[0]],
        blockedDates,
        workshopSchoolIds,
      })
    )
    const ws = workshops.find((w) => w.id === 'ws-1')!
    expect(ws.status).toBe('UNSCHEDULED')
  })

  it('does not block a date for a different school', () => {
    const blockedDates = new Set(['school-other:2026-06-08'])
    const workshopSchoolIds = new Map([['ws-1', 'school-1']])
    const { workshops } = runSchedule(
      makeInput({
        workshops: [mockWorkshops[0]],
        blockedDates,
        workshopSchoolIds,
      })
    )
    const ws = workshops.find((w) => w.id === 'ws-1')!
    expect(ws.status).toBe('SCHEDULED')
  })
})

describe('school affinity', () => {
  it('prefers PAs with history at the same school', () => {
    // pa-1 and pa-2 both available Mon 08-11 (both can cover ws-1 Mon 09-10)
    // pa-1 has history at school-1, pa-2 does not
    // maxPAs=1 so only one gets assigned
    const ws = { ...mockWorkshops[0], maxPAs: 1 }
    const paSchoolHistory = new Map([
      ['pa-2', new Set(['school-1'])],
    ])
    const workshopSchoolIds = new Map([['ws-1', 'school-1']])
    const { assignments } = runSchedule(
      makeInput({
        workshops: [ws],
        paSchoolHistory,
        workshopSchoolIds,
      })
    )
    // pa-2 should be preferred because they have history at school-1
    expect(assignments[0].paId).toBe('pa-2')
  })
})
