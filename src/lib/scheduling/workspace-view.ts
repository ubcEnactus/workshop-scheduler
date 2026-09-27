import {
  assessAssignment,
  assignmentPolicyHash,
  eligibility,
  staffingProblems,
  type ScheduleSnapshot,
} from './eligibility'
import { formatInstantRange } from '@/lib/time'

export function workshopWorkspaceRows(
  snapshot: ScheduleSnapshot,
  workshopDefinitionId: string,
  classes: { id: string; name: string; schoolName: string }[],
  exclusions: { workshopSessionId: string; paId: string }[]
) {
  return snapshot.workshops
    .filter((session) => session.workshopDefinitionId === workshopDefinitionId)
    .sort(
      (a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime() || a.id.localeCompare(b.id)
    )
    .map((session) => {
      const cls = classes.find((item) => item.id === session.classSectionId)
      const describePA = (paId: string) => {
        const pa = snapshot.pas.find((item) => item.id === paId)
        const assessment = assessAssignment(snapshot, session, paId)
        return {
          id: paId,
          name: pa?.name ?? pa?.email ?? 'Inactive PA',
          hardErrors: assessment.hardErrors,
          availabilityWarnings: assessment.availabilityWarnings,
          warnings: assessment.manualWarnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
            commitments: warning.commitments.map(
              (item) =>
                `${item.schoolName ?? 'School'} · ${formatInstantRange(item.scheduledStart, item.scheduledEnd)} · ${item.minutesBetween} minutes between sessions`
            ),
          })),
          expectedPolicyHash: assignmentPolicyHash(session, paId, assessment),
          totalAssignments: assessment.totalAssignments,
          excluded: exclusions.some(
            (item) => item.workshopSessionId === session.id && item.paId === paId
          ),
          canKeep: assessment.manualEligible && eligibility(snapshot, session, paId).length > 0,
        }
      }
      return {
        id: session.id,
        version: session.version,
        classSectionId: session.classSectionId,
        name: cls?.name ?? 'Teacher session',
        school: cls?.schoolName ?? session.schoolName ?? 'School',
        date: formatInstantRange(session.scheduledStart, session.scheduledEnd),
        status: session.status,
        locked: session.locked,
        minPAs: session.minPAs,
        maxPAs: session.maxPAs,
        problems: staffingProblems(snapshot, session),
        assignments: session.assignments.map((item) => describePA(item.paId)),
        candidates: snapshot.pas
          .filter((pa) => !session.assignments.some((item) => item.paId === pa.id))
          .map((pa) => describePA(pa.id))
          .sort(
            (a, b) =>
              Number(a.hardErrors.length > 0) - Number(b.hardErrors.length > 0) ||
              Number(a.availabilityWarnings.length + a.warnings.length > 0) -
                Number(b.availabilityWarnings.length + b.warnings.length > 0) ||
              a.totalAssignments - b.totalAssignments ||
              a.name.localeCompare(b.name)
          ),
      }
    })
}

export type WorkshopWorkspaceRow = ReturnType<typeof workshopWorkspaceRows>[number]
export type WorkshopWorkspacePA = WorkshopWorkspaceRow['candidates'][number]
export type DraftActivity = { id: string; summary: string; createdAt: string; undone: boolean }
