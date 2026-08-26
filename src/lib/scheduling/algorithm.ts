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

/**
 * Fill unscheduled workshops from PA availability.
 *
 * Greedy and order-stable: each workshop takes the meeting time its class
 * already holds that the most PAs can cover, then claims up to `maxPAs` of
 * them. A workshop whose best option still can't reach `minPAs` is left
 * UNSCHEDULED rather than under-staffed. PAs already booked at an overlapping
 * time that day are excluded, so nobody is double-booked.
 *
 * Pure — the caller loads the rows and persists the result.
 *
 * Known limitation: each class is placed on the *first* matching weekday in
 * the cycle, so a multi-week cycle stacks everything into week one. Spreading
 * across the cycle is the next thing to fix here.
 */
export function runSchedule(
  cycle: Cycle,
  classMeetings: ClassMeeting[],
  workshops: Workshop[],
  assignments: Assignment[],
  availabilities: PAAvailability[],
  generateId: () => string
): ScheduleResult {
  const keptAssignments = assignments.filter((a) => a.status === 'CONFIRMED')
  const newAssignments: Omit<Assignment, 'assignedAt'>[] = [...keptAssignments]

  // Confirmed work already owns its PAs. Seed the booking map from the
  // workshop's own scheduled instants — that's the authoritative time.
  const bookedPerDate = new Map<string, Booking[]>()
  const addBooking = (date: string, booking: Booking) => {
    const existing = bookedPerDate.get(date)
    if (existing) existing.push(booking)
    else bookedPerDate.set(date, [booking])
  }

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

    // A class can meet more than once a week; try every meeting and keep the
    // one the most PAs can staff.
    const meetings = classMeetings.filter((cm) => cm.classSectionId === ws.classSectionId)
    let best: { meeting: ClassMeeting; date: string; available: string[] } | null = null

    for (const meeting of meetings) {
      const dates = getDatesForDayOfWeek(meeting.dayOfWeek, cycleStart, cycleEnd)
      if (dates.length === 0) continue

      const date = dates[0]
      const excluded = conflictingPAs(
        bookedPerDate.get(date) ?? [],
        meeting.startMinute,
        meeting.endMinute
      )
      const available = findAvailablePAs(meeting, availabilities, excluded)

      if (available.length < ws.minPAs) continue
      if (!best || available.length > best.available.length) best = { meeting, date, available }
    }

    if (!best) {
      newWorkshops.push({ ...ws, status: 'UNSCHEDULED', scheduledStart: null, scheduledEnd: null })
      continue
    }

    const { meeting, date, available } = best
    for (const paId of available.slice(0, ws.maxPAs)) {
      addBooking(date, {
        paId,
        startMinute: meeting.startMinute,
        endMinute: meeting.endMinute,
      })
      newAssignments.push({ id: generateId(), workshopId: ws.id, paId, status: 'PROPOSED' })
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
