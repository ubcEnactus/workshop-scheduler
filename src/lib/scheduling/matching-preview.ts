import { createHash } from 'node:crypto'
import type { ScheduleSnapshot } from './eligibility'
export function scheduleHash(snapshot: ScheduleSnapshot) {
  const policyInput = {
    pas: snapshot.pas,
    // SQL GROUP BY has no implicit ordering. Fairness totals are a mapping,
    // so a different row order must not make an unchanged review appear stale.
    assignmentTotals: Object.fromEntries(
      Object.entries(snapshot.assignmentTotals ?? {}).sort(([a], [b]) => a.localeCompare(b))
    ),
    availability: snapshot.availability,
    availabilityExceptions: snapshot.availabilityExceptions ?? [],
    workshops: snapshot.workshops.map((workshop) => ({
      id: workshop.id,
      classSectionId: workshop.classSectionId,
      schoolId: workshop.schoolId,
      scheduledStart: workshop.scheduledStart,
      scheduledEnd: workshop.scheduledEnd,
      minPAs: workshop.minPAs,
      maxPAs: workshop.maxPAs,
      status: workshop.status,
      version: workshop.version,
      locked: workshop.locked,
      activeClass: workshop.activeClass,
      hostingValid: workshop.hostingValid,
      dateExceptionApproved: workshop.dateExceptionApproved,
      assignments: workshop.assignments,
    })),
  }
  return createHash('sha256').update(JSON.stringify(policyInput)).digest('hex')
}
