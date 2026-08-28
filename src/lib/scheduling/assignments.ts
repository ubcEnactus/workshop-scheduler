// Manual PA assignment management for admins.
//
// These functions let admins override the scheduler: assign, unassign, or
// swap PAs on individual workshops. Each validates constraints (availability,
// commute, double-booking) and throws descriptive errors on violations.

import { prisma } from '@/lib/db'
import {
  availabilityCovers,
  intervalsOverlap,
  vancouverDateKey,
  vancouverMinuteOfDay,
} from '@/lib/time'
import { SLOT_MINUTES } from '@/lib/schemas/availability'
import { canCommute } from './commute'
import { coalesceAvailability } from './availability'

export class AssignmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssignmentError'
  }
}

/**
 * Manually assign a PA to a workshop. Validates:
 * - Workshop is scheduled (has a time)
 * - PA isn't already assigned to this workshop
 * - PA is available during the workshop time
 * - PA can commute to the school
 * - PA isn't double-booked at that time
 */
export async function assignPA(workshopId: string, paId: string): Promise<void> {
  const workshop = await prisma.workshop.findUniqueOrThrow({
    where: { id: workshopId },
    include: {
      classSection: { include: { school: true } },
      assignments: true,
    },
  })

  if (!workshop.scheduledStart || !workshop.scheduledEnd) {
    throw new AssignmentError('Cannot assign PA to an unscheduled workshop')
  }

  const existing = workshop.assignments.find((a) => a.paId === paId)
  if (existing) {
    throw new AssignmentError('PA is already assigned to this workshop')
  }

  const pa = await prisma.user.findUniqueOrThrow({
    where: { id: paId },
    select: { id: true, community: true, availabilities: true },
  })

  // Check commute
  const schoolCommunity = workshop.classSection.school.community
  if (!canCommute(pa.community, schoolCommunity)) {
    throw new AssignmentError(
      `PA cannot commute from ${pa.community ?? 'unknown'} to ${schoolCommunity ?? 'unknown'} within the allowed time`
    )
  }

  // Check availability covers the workshop time
  const wsDate = vancouverDateKey(workshop.scheduledStart)
  const wsDay = workshop.scheduledStart.getUTCDay()
  // Convert JS getUTCDay (0=Sun) to our dayOfWeek (0=Mon)
  const dayOfWeek = wsDay === 0 ? 6 : wsDay - 1
  const wsStartMin = vancouverMinuteOfDay(workshop.scheduledStart)
  const wsEndMin = vancouverMinuteOfDay(workshop.scheduledEnd)

  const paSlots = pa.availabilities.filter((a) => a.dayOfWeek === dayOfWeek)
  const windows = coalesceAvailability(
    paSlots.map((s) => ({ userId: paId, dayOfWeek: s.dayOfWeek, startMin: s.startMin }))
  )
  const covers = windows.some((w) =>
    availabilityCovers(wsStartMin, wsEndMin, w.startMinute, w.endMinute)
  )
  if (!covers) {
    throw new AssignmentError('PA is not available during the workshop time')
  }

  // Check double-booking: does the PA have another workshop at the same time on the same date?
  const paAssignments = await prisma.assignment.findMany({
    where: {
      paId,
      status: { in: ['PROPOSED', 'CONFIRMED'] },
      workshop: {
        scheduledStart: { not: null },
        id: { not: workshopId },
      },
    },
    include: { workshop: { select: { scheduledStart: true, scheduledEnd: true } } },
  })

  const conflicting = paAssignments.some((a) => {
    if (!a.workshop.scheduledStart || !a.workshop.scheduledEnd) return false
    if (vancouverDateKey(a.workshop.scheduledStart) !== wsDate) return false
    return intervalsOverlap(
      vancouverMinuteOfDay(a.workshop.scheduledStart),
      vancouverMinuteOfDay(a.workshop.scheduledEnd),
      wsStartMin,
      wsEndMin
    )
  })

  if (conflicting) {
    throw new AssignmentError('PA is already booked for another workshop at this time')
  }

  await prisma.assignment.create({
    data: { workshopId, paId, status: 'CONFIRMED' },
  })
}

/**
 * Remove a PA from a workshop assignment.
 */
export async function unassignPA(workshopId: string, paId: string): Promise<void> {
  const assignment = await prisma.assignment.findUnique({
    where: { workshopId_paId: { workshopId, paId } },
  })

  if (!assignment) {
    throw new AssignmentError('PA is not assigned to this workshop')
  }

  await prisma.assignment.delete({
    where: { id: assignment.id },
  })
}

/**
 * Swap one PA for another on a workshop. The new PA is validated the same as
 * `assignPA`. Runs in a transaction.
 */
export async function swapPA(
  workshopId: string,
  oldPaId: string,
  newPaId: string
): Promise<void> {
  if (oldPaId === newPaId) {
    throw new AssignmentError('Cannot swap a PA with themselves')
  }

  // Validate the new PA can take this slot (reuses assignPA logic)
  // First remove old, then assign new — in a transaction-safe way
  const oldAssignment = await prisma.assignment.findUnique({
    where: { workshopId_paId: { workshopId, paId: oldPaId } },
  })

  if (!oldAssignment) {
    throw new AssignmentError('Original PA is not assigned to this workshop')
  }

  // Delete old assignment first so double-booking check against self doesn't fire
  await prisma.assignment.delete({ where: { id: oldAssignment.id } })

  try {
    await assignPA(workshopId, newPaId)
  } catch (err) {
    // Rollback: re-create the old assignment
    await prisma.assignment.create({
      data: { workshopId, paId: oldPaId, status: oldAssignment.status },
    })
    throw err
  }
}

/**
 * Get all PAs who could be assigned to a workshop (available, can commute,
 * not double-booked, not already assigned). Used for the admin dropdown.
 */
export async function getAvailablePAsForWorkshop(workshopId: string): Promise<
  { id: string; name: string | null; email: string; community: string | null }[]
> {
  const workshop = await prisma.workshop.findUniqueOrThrow({
    where: { id: workshopId },
    include: {
      classSection: { include: { school: true } },
      assignments: { select: { paId: true } },
    },
  })

  if (!workshop.scheduledStart || !workshop.scheduledEnd) return []

  const wsStartMin = vancouverMinuteOfDay(workshop.scheduledStart)
  const wsEndMin = vancouverMinuteOfDay(workshop.scheduledEnd)
  const wsDate = vancouverDateKey(workshop.scheduledStart)
  const wsDay = workshop.scheduledStart.getUTCDay()
  const dayOfWeek = wsDay === 0 ? 6 : wsDay - 1
  const schoolCommunity = workshop.classSection.school.community

  const alreadyAssigned = new Set(workshop.assignments.map((a) => a.paId))

  // Get slots needed for this workshop duration
  const slotsNeeded: number[] = []
  for (let m = wsStartMin; m < wsEndMin; m += SLOT_MINUTES) {
    slotsNeeded.push(m)
  }

  // Find PAs with availability on this day covering the full duration
  const pas = await prisma.user.findMany({
    where: {
      role: 'PA',
      deletedAt: null,
      id: { notIn: [...alreadyAssigned] },
      availabilities: {
        some: { dayOfWeek, startMin: { in: slotsNeeded } },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      community: true,
      availabilities: {
        where: { dayOfWeek, startMin: { in: slotsNeeded } },
        select: { startMin: true },
      },
    },
  })

  // Filter: must cover all slots, commute OK, not double-booked
  const allAssignmentsOnDate = await prisma.assignment.findMany({
    where: {
      paId: { in: pas.map((p) => p.id) },
      status: { in: ['PROPOSED', 'CONFIRMED'] },
      workshop: { scheduledStart: { not: null } },
    },
    include: { workshop: { select: { scheduledStart: true, scheduledEnd: true } } },
  })

  const paBookings = new Map<string, { start: number; end: number; date: string }[]>()
  for (const a of allAssignmentsOnDate) {
    if (!a.workshop.scheduledStart || !a.workshop.scheduledEnd) continue
    const date = vancouverDateKey(a.workshop.scheduledStart)
    if (date !== wsDate) continue
    const existing = paBookings.get(a.paId) ?? []
    existing.push({
      start: vancouverMinuteOfDay(a.workshop.scheduledStart),
      end: vancouverMinuteOfDay(a.workshop.scheduledEnd),
      date,
    })
    paBookings.set(a.paId, existing)
  }

  return pas
    .filter((pa) => {
      // Must cover all slots
      const covered = new Set(pa.availabilities.map((a) => a.startMin))
      if (!slotsNeeded.every((s) => covered.has(s))) return false

      // Commute check
      if (!canCommute(pa.community, schoolCommunity)) return false

      // Double-booking check
      const bookings = paBookings.get(pa.id) ?? []
      const hasConflict = bookings.some((b) => intervalsOverlap(b.start, b.end, wsStartMin, wsEndMin))
      if (hasConflict) return false

      return true
    })
    .map((pa) => ({
      id: pa.id,
      name: pa.name,
      email: pa.email,
      community: pa.community,
    }))
}
