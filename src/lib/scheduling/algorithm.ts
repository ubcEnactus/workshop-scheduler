import { availabilityCovers, getDatesForDayOfWeek } from '../time'
import type { Assignment, Workshop } from '../types'
import { getStore, nextId, updateAssignments, updateWorkshops } from './store'

export interface ScheduleResult {
  workshops: Workshop[]
  assignments: Assignment[]
}

/**
 * Resolves available PA IDs for a given meeting slot (dayOfWeek + time window).
 */
function findAvailablePAs(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  availabilities: ReturnType<typeof getStore>['availabilities']
): string[] {
  const ids = availabilities
    .filter(
      (av) =>
        av.dayOfWeek === dayOfWeek &&
        availabilityCovers(startTime, endTime, av.startTime, av.endTime)
    )
    .map((av) => av.paId)
  return [...new Set(ids)]
}

/**
 * Runs the scheduling algorithm against the current store state.
 *
 * Idempotent: clears PROPOSED workshops/assignments and re-derives them on
 * every call. CONFIRMED workshops are left untouched.
 */
export function runSchedule(): ScheduleResult {
  const { cycle, classMeetings, availabilities, workshops, assignments } = getStore()

  // Keep only confirmed assignments; re-derive everything else
  const keptAssignments = assignments.filter((a) => a.status === 'CONFIRMED')
  const newAssignments: Assignment[] = [...keptAssignments]

  const newWorkshops: Workshop[] = workshops.map((ws) => {
    if (ws.status === 'CONFIRMED') return ws

    const meeting = classMeetings.find((cm) => cm.id === ws.classMeetingId)
    if (!meeting) return { ...ws, status: 'UNDER_SUPPLIED' as const }

    const dates = getDatesForDayOfWeek(meeting.dayOfWeek, cycle.startDate, cycle.endDate)
    if (dates.length === 0) return { ...ws, status: 'UNDER_SUPPLIED' as const }

    const availablePAIds = findAvailablePAs(
      meeting.dayOfWeek,
      meeting.startTime,
      meeting.endTime,
      availabilities
    )

    if (availablePAIds.length < ws.minPAs) {
      return { ...ws, status: 'UNDER_SUPPLIED' as const }
    }

    const assignedPAIds = availablePAIds.slice(0, ws.maxPAs)
    const date = dates[0]

    for (const paId of assignedPAIds) {
      newAssignments.push({
        id: nextId(),
        workshopId: ws.id,
        paId,
        status: 'PROPOSED',
      })
    }

    return {
      ...ws,
      status: 'PROPOSED' as const,
      scheduledStart: `${date}T${meeting.startTime}:00`,
      scheduledEnd: `${date}T${meeting.endTime}:00`,
    }
  })

  updateWorkshops(newWorkshops)
  updateAssignments(newAssignments)

  return { workshops: newWorkshops, assignments: newAssignments }
}

/**
 * Promotes all PROPOSED workshops and assignments to CONFIRMED.
 */
export function confirmSchedule(): ScheduleResult {
  const { workshops, assignments } = getStore()

  const newWorkshops = workshops.map((ws) =>
    ws.status === 'PROPOSED' ? { ...ws, status: 'CONFIRMED' as const } : ws
  )
  const newAssignments = assignments.map((a) =>
    a.status === 'PROPOSED' ? { ...a, status: 'CONFIRMED' as const } : a
  )

  updateWorkshops(newWorkshops)
  updateAssignments(newAssignments)

  return { workshops: newWorkshops, assignments: newAssignments }
}
