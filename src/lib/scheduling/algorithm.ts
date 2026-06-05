import { availabilityCovers, getDatesForDayOfWeek } from '../time'
import type { Assignment, Workshop } from '../types'
import { getStore, nextId, updateAssignments, updateWorkshops } from './store'

export interface ScheduleResult {
  workshops: Workshop[]
  assignments: Assignment[]
}

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
 *
 * PA conflict-safe: tracks which PAs are already booked per concrete time slot
 * so the same PA is never double-assigned across concurrent workshops.
 */
export function runSchedule(): ScheduleResult {
  const { cycle, classMeetings, availabilities, workshops, assignments } = getStore()

  const keptAssignments = assignments.filter((a) => a.status === 'CONFIRMED')
  const newAssignments: Assignment[] = [...keptAssignments]

  // Track booked PAs per concrete slot "YYYY-MM-DD:HH:MM"
  const bookedPerSlot = new Map<string, Set<string>>()

  for (const a of keptAssignments) {
    const ws = workshops.find((w) => w.id === a.workshopId)
    if (ws?.scheduledStart) {
      const key = `${ws.scheduledStart.slice(0, 10)}:${ws.scheduledStart.slice(11, 16)}`
      if (!bookedPerSlot.has(key)) bookedPerSlot.set(key, new Set())
      bookedPerSlot.get(key)!.add(a.paId)
    }
  }

  const newWorkshops: Workshop[] = []

  for (const ws of workshops) {
    if (ws.status === 'CONFIRMED') {
      newWorkshops.push(ws)
      continue
    }

    const meeting = classMeetings.find((cm) => cm.id === ws.classMeetingId)
    if (!meeting) {
      newWorkshops.push({
        ...ws,
        status: 'UNDER_SUPPLIED',
        scheduledStart: undefined,
        scheduledEnd: undefined,
      })
      continue
    }

    const dates = getDatesForDayOfWeek(meeting.dayOfWeek, cycle.startDate, cycle.endDate)
    if (dates.length === 0) {
      newWorkshops.push({
        ...ws,
        status: 'UNDER_SUPPLIED',
        scheduledStart: undefined,
        scheduledEnd: undefined,
      })
      continue
    }

    const date = dates[0]
    const slotKey = `${date}:${meeting.startTime}`
    const alreadyBooked = bookedPerSlot.get(slotKey) ?? new Set<string>()

    const availablePAIds = findAvailablePAs(
      meeting.dayOfWeek,
      meeting.startTime,
      meeting.endTime,
      availabilities
    ).filter((paId) => !alreadyBooked.has(paId))

    if (availablePAIds.length < ws.minPAs) {
      newWorkshops.push({
        ...ws,
        status: 'UNDER_SUPPLIED',
        scheduledStart: undefined,
        scheduledEnd: undefined,
      })
      continue
    }

    const assignedPAIds = availablePAIds.slice(0, ws.maxPAs)

    if (!bookedPerSlot.has(slotKey)) bookedPerSlot.set(slotKey, new Set())
    for (const paId of assignedPAIds) {
      bookedPerSlot.get(slotKey)!.add(paId)
      newAssignments.push({ id: nextId(), workshopId: ws.id, paId, status: 'PROPOSED' })
    }

    // No Z suffix — times are stored as wall-clock (local) so the browser
    // displays them correctly without timezone conversion
    newWorkshops.push({
      ...ws,
      status: 'PROPOSED',
      scheduledStart: `${date}T${meeting.startTime}:00`,
      scheduledEnd: `${date}T${meeting.endTime}:00`,
    })
  }

  updateWorkshops(newWorkshops)
  updateAssignments(newAssignments)

  return { workshops: newWorkshops, assignments: newAssignments }
}

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
