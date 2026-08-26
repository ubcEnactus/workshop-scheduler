import { describe, expect, it } from 'vitest'
import type { ClassMeeting, Cycle, Workshop } from '@prisma/client'

import { runSchedule } from '../algorithm'
import { coalesceAvailability } from '../availability'

/**
 * The scheduler against the dataset `npm run db:seed` produces.
 *
 * These fixtures mirror `prisma/seed.ts` — the cycle bounds, both class
 * meeting times, and the ticked availability slots. Change the seed and this
 * file has to change with it; that coupling is deliberate, since the point is
 * to catch the seed and the scheduler drifting apart.
 */

// Spring 2026: Mon 2026-01-05 through Fri 2026-04-03. January is PST (UTC-8).
const cycle: Cycle = {
  id: 'seed-cycle-spring-2026',
  name: 'Spring 2026',
  startDate: new Date('2026-01-05T00:00:00Z'),
  endDate: new Date('2026-04-03T00:00:00Z'),
  status: 'OPEN',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const meetings: ClassMeeting[] = [
  // Block A Biology 11 — Tue 10:00–11:00
  { id: 'cm-bio', classSectionId: 'cs-bio', dayOfWeek: 1, startMinute: 600, endMinute: 660 },
  // Block C Math 10 — Wed 13:00–14:30 (90 minutes: three ticked slots)
  { id: 'cm-math', classSectionId: 'cs-math', dayOfWeek: 2, startMinute: 780, endMinute: 870 },
]

function workshop(id: string, classSectionId: string): Workshop {
  return {
    id,
    cycleId: cycle.id,
    classSectionId,
    minPAs: 1, // schema defaults, as the seed creates them
    maxPAs: 3,
    status: 'UNSCHEDULED',
    scheduledStart: null,
    scheduledEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

const workshops = [workshop('ws-bio', 'cs-bio'), workshop('ws-math', 'cs-math')]

// One row per ticked 30-minute slot, exactly as the seed writes them.
const ticks = (dayOfWeek: number, startMin: number, endMin: number, userId: string) =>
  Array.from({ length: (endMin - startMin) / 30 }, (_, i) => ({
    userId,
    dayOfWeek,
    startMin: startMin + i * 30,
  }))

const seededSlots = [
  ...ticks(1, 570, 690, 'priya'), // Tue 9:30–11:30
  ...ticks(2, 780, 900, 'priya'), // Wed 13:00–15:00
  ...ticks(1, 570, 690, 'pat'), // Tue 9:30–11:30 only
]

let counter = 1
const generateId = () => `seed-a-${counter++}`

describe('scheduling the seeded dataset', () => {
  it('places both workshops in their class meeting slots', () => {
    const { workshops: result } = runSchedule(
      cycle,
      meetings,
      workshops,
      [],
      coalesceAvailability(seededSlots),
      generateId
    )

    const bio = result.find((w) => w.id === 'ws-bio')!
    expect(bio.status).toBe('SCHEDULED')
    // Tue 2026-01-06, 10:00 PST → 18:00Z
    expect(bio.scheduledStart?.toISOString()).toBe('2026-01-06T18:00:00.000Z')
    expect(bio.scheduledEnd?.toISOString()).toBe('2026-01-06T19:00:00.000Z')

    const math = result.find((w) => w.id === 'ws-math')!
    expect(math.status).toBe('SCHEDULED')
    // Wed 2026-01-07, 13:00 PST → 21:00Z
    expect(math.scheduledStart?.toISOString()).toBe('2026-01-07T21:00:00.000Z')
    expect(math.scheduledEnd?.toISOString()).toBe('2026-01-07T22:30:00.000Z')
  })

  it('assigns both PAs to Tuesday and only Priya to Wednesday', () => {
    const { assignments } = runSchedule(
      cycle,
      meetings,
      workshops,
      [],
      coalesceAvailability(seededSlots),
      generateId
    )

    const bioPAs = assignments.filter((a) => a.workshopId === 'ws-bio').map((a) => a.paId)
    expect(bioPAs.sort()).toEqual(['pat', 'priya'])

    // Pat has no Wednesday availability, so the 90-minute class runs one-up.
    const mathPAs = assignments.filter((a) => a.workshopId === 'ws-math').map((a) => a.paId)
    expect(mathPAs).toEqual(['priya'])

    expect(assignments.every((a) => a.status === 'PROPOSED')).toBe(true)
  })

  it('flags an under-supplied workshop instead of assigning too few PAs', () => {
    // The Wednesday class needs two PAs, but only Priya is free then.
    const needsTwo = workshops.map((w) => (w.id === 'ws-math' ? { ...w, minPAs: 2 } : w))

    const { workshops: result, assignments } = runSchedule(
      cycle,
      meetings,
      needsTwo,
      [],
      coalesceAvailability(seededSlots),
      generateId
    )

    const math = result.find((w) => w.id === 'ws-math')!
    expect(math.status).toBe('UNSCHEDULED')
    expect(math.scheduledStart).toBeNull()
    expect(assignments.filter((a) => a.workshopId === 'ws-math')).toHaveLength(0)

    // The workshop that can be staffed is unaffected.
    expect(result.find((w) => w.id === 'ws-bio')!.status).toBe('SCHEDULED')
  })

  it('lines up ClassMeeting and Availability on the same 0=Mon…4=Fri scale', () => {
    // Regression: if either side shifted by a day, Tuesday availability would
    // stop covering the Tuesday class and nothing would schedule.
    const tuesdayOnly = coalesceAvailability(ticks(1, 570, 690, 'priya'))
    const { workshops: result } = runSchedule(
      cycle,
      meetings,
      workshops,
      [],
      tuesdayOnly,
      generateId
    )

    expect(result.find((w) => w.id === 'ws-bio')!.status).toBe('SCHEDULED')
    expect(result.find((w) => w.id === 'ws-math')!.status).toBe('UNSCHEDULED')
  })
})
