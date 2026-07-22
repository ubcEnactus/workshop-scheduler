import { availabilityCovers, getDatesForDayOfWeek, intervalsOverlap, vancouverToUtc } from '../time'
import type { Assignment, ClassMeeting, Cycle, Workshop } from '@prisma/client'

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

function findAvailablePAs(
  dayOfWeek: number,
  startMinute: number,
  endMinute: number,
  availabilities: PAAvailability[]
): string[] {
  const ids = availabilities
    .filter(
      (av) =>
        av.dayOfWeek === dayOfWeek &&
        availabilityCovers(startMinute, endMinute, av.startMinute, av.endMinute)
    )
    .map((av) => av.paId)
  return [...new Set(ids)]
}

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

  const bookedPerDate = new Map<
    string,
    { paId: string; startMinute: number; endMinute: number }[]
  >()

  for (const a of keptAssignments) {
    const ws = workshops.find((w) => w.id === a.workshopId)
    const meeting = classMeetings.find((cm) => cm.classSectionId === ws?.classSectionId)
    if (ws?.scheduledStart && meeting) {
      // Find local date from scheduledStart (which is UTC).
      // A quick hack for the date key: we can format scheduledStart back to YYYY-MM-DD in Vancouver,
      // or we can just derive it assuming the algorithm logic is predictable.
      // But actually, it's safer to use the meeting's properties since they don't change.
      // In this system, dates come from `getDatesForDayOfWeek(meeting.dayOfWeek, ...)`.
      const dates = getDatesForDayOfWeek(
        meeting.dayOfWeek,
        cycle.startDate.toISOString().slice(0, 10),
        cycle.endDate.toISOString().slice(0, 10)
      )
      if (dates.length > 0) {
        const date = dates[0]
        if (!bookedPerDate.has(date)) bookedPerDate.set(date, [])
        bookedPerDate
          .get(date)!
          .push({ paId: a.paId, startMinute: meeting.startMinute, endMinute: meeting.endMinute })
      }
    }
  }

  const newWorkshops: Workshop[] = []

  for (const ws of workshops) {
    if (ws.status === 'CONFIRMED' || ws.status === 'COMPLETED' || ws.status === 'CANCELLED') {
      newWorkshops.push(ws)
      continue
    }

    const meeting = classMeetings.find((cm) => cm.classSectionId === ws.classSectionId)
    if (!meeting) {
      newWorkshops.push({
        ...ws,
        status: 'UNSCHEDULED', // Previously UNDER_SUPPLIED but UNSCHEDULED isn't an error state in Prisma? Wait, Prisma WorkshopStatus has UNSCHEDULED, SCHEDULED, CONFIRMED, COMPLETED, CANCELLED.
        // Prisma schema doesn't have UNDER_SUPPLIED. Let's use UNSCHEDULED if we can't schedule it.
        scheduledStart: null,
        scheduledEnd: null,
      })
      continue
    }

    const cycleStartStr =
      typeof cycle.startDate === 'string'
        ? cycle.startDate
        : (cycle.startDate as Date).toISOString().slice(0, 10)
    const cycleEndStr =
      typeof cycle.endDate === 'string'
        ? cycle.endDate
        : (cycle.endDate as Date).toISOString().slice(0, 10)

    const dates = getDatesForDayOfWeek(meeting.dayOfWeek, cycleStartStr, cycleEndStr)
    if (dates.length === 0) {
      newWorkshops.push({
        ...ws,
        status: 'UNSCHEDULED',
        scheduledStart: null,
        scheduledEnd: null,
      })
      continue
    }

    const date = dates[0]
    const bookedOnDate = bookedPerDate.get(date) ?? []

    // Find who is booked at a conflicting time
    const conflictingPAIds = new Set(
      bookedOnDate
        .filter((b) =>
          intervalsOverlap(b.startMinute, b.endMinute, meeting.startMinute, meeting.endMinute)
        )
        .map((b) => b.paId)
    )

    const availablePAIds = findAvailablePAs(
      meeting.dayOfWeek,
      meeting.startMinute,
      meeting.endMinute,
      availabilities
    ).filter((paId) => !conflictingPAIds.has(paId))

    if (availablePAIds.length < ws.minPAs) {
      newWorkshops.push({
        ...ws,
        status: 'UNSCHEDULED', // Cannot meet minPAs
        scheduledStart: null,
        scheduledEnd: null,
      })
      continue
    }

    const assignedPAIds = availablePAIds.slice(0, ws.maxPAs)

    if (!bookedPerDate.has(date)) bookedPerDate.set(date, [])
    for (const paId of assignedPAIds) {
      bookedPerDate
        .get(date)!
        .push({ paId, startMinute: meeting.startMinute, endMinute: meeting.endMinute })
      newAssignments.push({ id: generateId(), workshopId: ws.id, paId, status: 'PROPOSED' })
    }

    newWorkshops.push({
      ...ws,
      status: 'SCHEDULED', // Prisma Enum uses SCHEDULED instead of PROPOSED for Workshop
      scheduledStart: vancouverToUtc(date, meeting.startMinute),
      scheduledEnd: vancouverToUtc(date, meeting.endMinute),
    })
  }

  return { workshops: newWorkshops, assignments: newAssignments }
}
