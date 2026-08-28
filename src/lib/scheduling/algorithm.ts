import type { Assignment, ClassMeeting, Cycle, Workshop } from '@prisma/client'

import {
  availabilityCovers,
  getDatesForDayOfWeek,
  intervalsOverlap,
  utcDateKey,
  vancouverDateKey,
  vancouverMinuteOfDay,
  vancouverToUtc,
} from '@/lib/time'

import { canCommute, sortByCommute } from './commute'
import { filterOverQuota, sortByQuotaDeficit } from './quota'

/**
 * A contiguous window a PA is free, in local wall-clock minutes. Built from
 * ticked `Availability` slots by `coalesceAvailability`.
 */
export interface PAAvailability {
  paId: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
}

export interface ScheduleInput {
  cycle: Cycle
  classMeetings: ClassMeeting[]
  workshops: Workshop[]
  assignments: Assignment[]
  availabilities: PAAvailability[]
  /** PA id → community string (null if not set) */
  paCommunities: Map<string, string | null>
  /** Workshop id → school community string (null if not set) */
  workshopSchoolCommunities: Map<string, string | null>
  /** PA id → current assignment count this cycle */
  assignmentCounts: Map<string, number>
  /** PA id → monthly quota */
  quotas: Map<string, number>
  generateId: () => string
  /** Max one-way commute in minutes. Default 45. */
  maxCommuteMinutes?: number
  /** Blocked dates per school. Key = "schoolId:YYYY-MM-DD" or "*:YYYY-MM-DD" for global. */
  blockedDates?: Set<string>
  /** PA id → set of school ids they have prior assignments at (for consistency preference). */
  paSchoolHistory?: Map<string, Set<string>>
  /** Workshop id → school id (for affinity lookups). */
  workshopSchoolIds?: Map<string, string>
}

export interface ScheduleResult {
  workshops: Workshop[]
  assignments: Omit<Assignment, 'assignedAt'>[]
}

/** A PA already committed to a time on a given date — can't be double-booked. */
type Booking = { paId: string; startMinute: number; endMinute: number }

/** Statuses the scheduler leaves alone: a human has already acted on them. */
const LOCKED_STATUSES: Workshop['status'][] = ['CONFIRMED', 'COMPLETED', 'CANCELLED']

function findAvailablePAs(
  meeting: ClassMeeting,
  availabilities: PAAvailability[],
  excluded: ReadonlySet<string>
): string[] {
  const ids = availabilities
    .filter(
      (av) =>
        av.dayOfWeek === meeting.dayOfWeek &&
        !excluded.has(av.paId) &&
        availabilityCovers(meeting.startMinute, meeting.endMinute, av.startMinute, av.endMinute)
    )
    .map((av) => av.paId)
  return [...new Set(ids)]
}

function conflictingPAs(bookings: Booking[], startMinute: number, endMinute: number): Set<string> {
  return new Set(
    bookings
      .filter((b) => intervalsOverlap(b.startMinute, b.endMinute, startMinute, endMinute))
      .map((b) => b.paId)
  )
}

/** Stable sort: PAs with prior history at this school float to the front. */
function sortByAffinity(
  paIds: string[],
  schoolId: string,
  history: Map<string, Set<string>>
): string[] {
  return [...paIds].sort((a, b) => {
    const aHas = history.get(a)?.has(schoolId) ? 1 : 0
    const bHas = history.get(b)?.has(schoolId) ? 1 : 0
    return bHas - aHas // PAs with history sort first
  })
}

/**
 * Fill unscheduled workshops from PA availability.
 *
 * Greedy and order-stable. For each workshop:
 * 1. Find PAs available at the meeting time
 * 2. Filter out PAs who can't commute to the school in time
 * 3. Filter out PAs who have already met their monthly quota
 * 4. Sort remaining by quota deficit (most under-scheduled first), then commute
 * 5. Assign up to maxPAs; leave UNSCHEDULED if minPAs can't be met
 *
 * Pure — the caller loads the rows and persists the result.
 */
export function runSchedule(input: ScheduleInput): ScheduleResult {
  const {
    cycle,
    classMeetings,
    workshops,
    assignments,
    availabilities,
    paCommunities,
    workshopSchoolCommunities,
    assignmentCounts,
    quotas,
    generateId,
    maxCommuteMinutes = 45,
    blockedDates = new Set<string>(),
    paSchoolHistory = new Map<string, Set<string>>(),
    workshopSchoolIds = new Map<string, string>(),
  } = input

  // Mutable copy of counts so we can track assignments made during this run
  const counts = new Map(assignmentCounts)

  const keptAssignments = assignments.filter((a) => a.status === 'CONFIRMED')
  const newAssignments: Omit<Assignment, 'assignedAt'>[] = [...keptAssignments]

  const bookedPerDate = new Map<string, Booking[]>()
  const addBooking = (date: string, booking: Booking) => {
    const existing = bookedPerDate.get(date)
    if (existing) existing.push(booking)
    else bookedPerDate.set(date, [booking])
  }

  // Seed bookings from confirmed assignments
  for (const a of keptAssignments) {
    const ws = workshops.find((w) => w.id === a.workshopId)
    if (!ws?.scheduledStart || !ws.scheduledEnd) continue
    addBooking(vancouverDateKey(ws.scheduledStart), {
      paId: a.paId,
      startMinute: vancouverMinuteOfDay(ws.scheduledStart),
      endMinute: vancouverMinuteOfDay(ws.scheduledEnd),
    })
  }

  const cycleStart = utcDateKey(cycle.startDate)
  const cycleEnd = utcDateKey(cycle.endDate)
  const newWorkshops: Workshop[] = []

  for (const ws of workshops) {
    if (LOCKED_STATUSES.includes(ws.status)) {
      newWorkshops.push(ws)
      continue
    }

    const schoolCommunity = workshopSchoolCommunities.get(ws.id) ?? null
    const meetings = classMeetings.filter((cm) => cm.classSectionId === ws.classSectionId)
    let best: { meeting: ClassMeeting; date: string; available: string[] } | null = null

    for (const meeting of meetings) {
      const dates = getDatesForDayOfWeek(meeting.dayOfWeek, cycleStart, cycleEnd)
      if (dates.length === 0) continue

      // Try all matching dates in the cycle (not just week 1)
      for (const date of dates) {
        // Skip blocked dates (school-specific or global)
        const schoolId = workshopSchoolIds.get(ws.id)
        if (schoolId && blockedDates.has(`${schoolId}:${date}`)) continue
        if (blockedDates.has(`*:${date}`)) continue

        const excluded = conflictingPAs(
          bookedPerDate.get(date) ?? [],
          meeting.startMinute,
          meeting.endMinute
        )

        let available = findAvailablePAs(meeting, availabilities, excluded)

        // Filter by commute feasibility
        available = available.filter((paId) =>
          canCommute(paCommunities.get(paId), schoolCommunity, maxCommuteMinutes)
        )

        // Filter out PAs over quota
        available = filterOverQuota(available, counts, quotas)

        if (available.length < ws.minPAs) continue
        if (!best || available.length > best.available.length) {
          best = { meeting, date, available }
        }
      }
    }

    if (!best) {
      newWorkshops.push({ ...ws, status: 'UNSCHEDULED', scheduledStart: null, scheduledEnd: null })
      continue
    }

    const { meeting, date, available } = best

    // Sort candidates: quota deficit first, then shorter commute, then school affinity
    let sorted = sortByQuotaDeficit(available, counts, quotas)
    sorted = sortByCommute(sorted, paCommunities, schoolCommunity)
    const schoolId = workshopSchoolIds.get(ws.id)
    if (schoolId) {
      sorted = sortByAffinity(sorted, schoolId, paSchoolHistory)
    }

    // Assign up to maxPAs
    const assigned = sorted.slice(0, ws.maxPAs)
    for (const paId of assigned) {
      addBooking(date, {
        paId,
        startMinute: meeting.startMinute,
        endMinute: meeting.endMinute,
      })
      newAssignments.push({ id: generateId(), workshopId: ws.id, paId, status: 'PROPOSED' })
      counts.set(paId, (counts.get(paId) ?? 0) + 1)
    }

    newWorkshops.push({
      ...ws,
      status: 'SCHEDULED',
      scheduledStart: vancouverToUtc(date, meeting.startMinute),
      scheduledEnd: vancouverToUtc(date, meeting.endMinute),
    })
  }

  return { workshops: newWorkshops, assignments: newAssignments }
}
