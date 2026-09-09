import type { AssignmentSource, AssignmentStatus, WorkshopStatus } from '@prisma/client'
import { coalesceAvailability, type AvailabilitySlot } from './availability'
import { vancouverDateKey, vancouverMinuteOfDay, vancouverMonthKey } from '@/lib/time'

export type ScheduledWorkshop = {
  id: string
  classSectionId: string
  scheduledStart: Date
  scheduledEnd: Date
  minPAs: number
  maxPAs: number
  status: WorkshopStatus
  version: number
  locked: boolean
  activeClass: boolean
  assignments: { paId: string; status: AssignmentStatus; source: AssignmentSource }[]
}
export type ScheduleSnapshot = {
  minimumGapMinutes: number | null
  pas: { id: string; name: string | null; email: string }[]
  availability: AvailabilitySlot[]
  quotas: { paId: string; month: string; quota: number }[]
  workshops: ScheduledWorkshop[]
}
export function workload(
  snapshot: ScheduleSnapshot,
  paId: string,
  month: string,
  excludeId?: string
) {
  return snapshot.workshops.filter(
    (w) =>
      w.id !== excludeId &&
      w.status !== 'CANCELLED' &&
      vancouverMonthKey(w.scheduledStart) === month &&
      w.assignments.some((a) => a.paId === paId)
  ).length
}
export function eligibility(
  snapshot: ScheduleSnapshot,
  workshop: ScheduledWorkshop,
  paId: string
): string[] {
  const reasons: string[] = []
  if (!workshop.activeClass) reasons.push('Inactive class, teacher or school.')
  if (!snapshot.pas.some((pa) => pa.id === paId)) reasons.push('PA account is inactive.')
  if (snapshot.minimumGapMinutes === null || snapshot.minimumGapMinutes <= 0)
    reasons.push('Set a positive minimum assignment gap.')
  if (workshop.status === 'CANCELLED') reasons.push('Workshop is cancelled.')
  const existing = workshop.assignments.some((a) => a.paId === paId)
  if (workshop.assignments.length + (existing ? 0 : 1) > workshop.maxPAs)
    reasons.push('Staffing capacity reached.')
  const month = vancouverMonthKey(workshop.scheduledStart)
  const quota = snapshot.quotas.find((q) => q.paId === paId && q.month === month)
  if (!quota) reasons.push('Monthly quota is missing.')
  else if (workload(snapshot, paId, month, workshop.id) >= quota.quota)
    reasons.push('Monthly quota reached.')
  const date = vancouverDateKey(workshop.scheduledStart)
  const day = new Date(date + 'T12:00:00Z').getUTCDay() - 1
  const slots = snapshot.availability.filter((slot) => slot.userId === paId)
  if (slots.length === 0) reasons.push('Availability is missing.')
  else if (
    date !== vancouverDateKey(workshop.scheduledEnd) ||
    !coalesceAvailability(slots).some(
      (window) =>
        window.dayOfWeek === day &&
        window.startMinute <= vancouverMinuteOfDay(workshop.scheduledStart) &&
        window.endMinute >= vancouverMinuteOfDay(workshop.scheduledEnd)
    )
  )
    reasons.push('Availability does not cover the full workshop.')
  for (const other of snapshot.workshops) {
    if (
      other.id === workshop.id ||
      other.status === 'CANCELLED' ||
      !other.assignments.some((a) => a.paId === paId)
    )
      continue
    const start = workshop.scheduledStart.getTime(),
      end = workshop.scheduledEnd.getTime()
    const otherStart = other.scheduledStart.getTime(),
      otherEnd = other.scheduledEnd.getTime()
    if (start < otherEnd && otherStart < end) reasons.push('Conflicting assignment.')
    else if (
      Math.max(start - otherEnd, otherStart - end) <
      (snapshot.minimumGapMinutes ?? 0) * 60_000
    )
      reasons.push('Insufficient gap between assignments.')
  }
  return [...new Set(reasons)]
}
export function staffingProblems(snapshot: ScheduleSnapshot, workshop: ScheduledWorkshop) {
  const problems =
    workshop.assignments.length < workshop.minPAs ? ['Minimum staffing is not met.'] : []
  if (workshop.assignments.length > workshop.maxPAs) problems.push('Staffing capacity exceeded.')
  for (const assignment of workshop.assignments) {
    const pa = snapshot.pas.find((p) => p.id === assignment.paId)
    problems.push(
      ...eligibility(snapshot, workshop, assignment.paId).map(
        (reason) => (pa?.name ?? pa?.email ?? 'Inactive PA') + ': ' + reason
      )
    )
  }
  return problems
}
