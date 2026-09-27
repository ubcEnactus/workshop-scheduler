import {
  assessAssignment,
  type ScheduleSnapshot,
  type ScheduledAssignment,
  type ScheduledWorkshop,
} from './eligibility'

export type ManualRelaxation = 'WEEKLY' | 'SAME_DAY'

export type ManualFeasibilityAssignment = {
  workshopSessionId: string
  paId: string
  warningCodes: ('SAME_DAY' | 'SAME_WEEK')[]
}

export type ManualFeasibilityResult = {
  status: 'COMPLETE' | 'NO_PLAN_FOUND' | 'BUDGET_REACHED'
  assignments: ManualFeasibilityAssignment[]
  visited: number
}

export type FeasibilityPlanKind = 'AUTOMATIC' | 'WEEKLY' | 'SAME_DAY'

export function feasibilityPlanKind(
  result: ManualFeasibilityResult | null
): FeasibilityPlanKind | null {
  if (result?.status !== 'COMPLETE') return null
  if (result.assignments.some((assignment) => assignment.warningCodes.includes('SAME_DAY')))
    return 'SAME_DAY'
  if (result.assignments.some((assignment) => assignment.warningCodes.includes('SAME_WEEK')))
    return 'WEEKLY'
  return 'AUTOMATIC'
}

function cloneSnapshot(input: ScheduleSnapshot): ScheduleSnapshot {
  return {
    ...input,
    pas: input.pas.map((pa) => ({ ...pa })),
    availability: input.availability.map((slot) => ({ ...slot })),
    availabilityExceptions: input.availabilityExceptions?.map((item) => ({ ...item })),
    quotas: input.quotas.map((quota) => ({ ...quota })),
    workshops: input.workshops.map((workshop) => ({
      ...workshop,
      scheduledStart: new Date(workshop.scheduledStart),
      scheduledEnd: new Date(workshop.scheduledEnd),
      assignments: workshop.assignments.map((assignment) => ({ ...assignment })),
    })),
  }
}

function warningCodes(
  assessment: ReturnType<typeof assessAssignment>
): ('SAME_DAY' | 'SAME_WEEK')[] {
  return assessment.manualWarnings.map((warning) => warning.code)
}

function allowed(assessment: ReturnType<typeof assessAssignment>, relaxation: ManualRelaxation) {
  if (!assessment.manualEligible || assessment.availabilityWarnings.length) return false
  return (
    relaxation === 'SAME_DAY' ||
    !assessment.manualWarnings.some((warning) => warning.code === 'SAME_DAY')
  )
}

/**
 * Find a temporary, complete staffing plan while preserving all existing and
 * automatic assignments. Hard constraints are never relaxed. WEEKLY permits
 * weekly warnings only; SAME_DAY permits both workload warning levels.
 */
export function findManualFeasibilityPlan(
  input: ScheduleSnapshot,
  targetIds: readonly string[],
  relaxation: ManualRelaxation,
  options: { searchBudget?: number } = {}
): ManualFeasibilityResult {
  const snapshot = cloneSnapshot(input)
  const targets = snapshot.workshops.filter((workshop) => targetIds.includes(workshop.id))
  const chosen: ManualFeasibilityAssignment[] = []
  const searchBudget = Math.max(1, Math.floor(options.searchBudget ?? 20_000))
  let visited = 0
  let budgetReached = false

  const candidates = (workshop: ScheduledWorkshop) =>
    snapshot.pas
      .filter((pa) => !workshop.assignments.some((assignment) => assignment.paId === pa.id))
      .map((pa) => ({ pa, assessment: assessAssignment(snapshot, workshop, pa.id) }))
      .filter((candidate) => allowed(candidate.assessment, relaxation))
      .sort(
        (a, b) =>
          a.assessment.totalAssignments - b.assessment.totalAssignments ||
          a.pa.id.localeCompare(b.pa.id)
      )

  const visit = (): boolean => {
    if (targets.every((workshop) => workshop.assignments.length >= workshop.minPAs)) return true
    if (visited >= searchBudget) {
      budgetReached = true
      return false
    }
    visited += 1
    const choices = targets
      .filter((workshop) => workshop.assignments.length < workshop.minPAs)
      .map((workshop) => ({ workshop, candidates: candidates(workshop) }))
      .sort(
        (a, b) =>
          a.candidates.length - b.candidates.length ||
          a.workshop.scheduledStart.getTime() - b.workshop.scheduledStart.getTime() ||
          a.workshop.id.localeCompare(b.workshop.id)
      )
    const next = choices[0]
    if (!next?.candidates.length) return false

    for (const candidate of next.candidates) {
      const codes = warningCodes(candidate.assessment)
      const assignment: ScheduledAssignment = {
        paId: candidate.pa.id,
        status: 'DRAFT',
        source: 'MANUAL',
        overrideSameDay: codes.includes('SAME_DAY'),
        overrideWeek: codes.includes('SAME_WEEK'),
        overrideReason: null,
      }
      next.workshop.assignments.push(assignment)
      chosen.push({
        workshopSessionId: next.workshop.id,
        paId: candidate.pa.id,
        warningCodes: codes,
      })
      if (visit()) return true
      chosen.pop()
      next.workshop.assignments.pop()
      if (budgetReached) return false
    }
    return false
  }

  const complete = visit()
  if (!complete)
    return {
      status: budgetReached ? 'BUDGET_REACHED' : 'NO_PLAN_FOUND',
      assignments: [],
      visited,
    }

  return {
    status: 'COMPLETE',
    assignments: chosen,
    visited,
  }
}

/** Count unassigned PAs who could automatically replace at least one final assignment. */
export function automaticBackupCount(input: ScheduleSnapshot, workshopSessionId: string): number {
  const original = input.workshops.find((item) => item.id === workshopSessionId)
  if (!original || original.assignments.length < original.minPAs) return 0
  const assignedIds = new Set(original.assignments.map((assignment) => assignment.paId))
  const substitutes = new Set<string>()
  for (let index = 0; index < original.assignments.length; index += 1) {
    const snapshot = cloneSnapshot(input)
    const workshop = snapshot.workshops.find((item) => item.id === workshopSessionId)
    if (!workshop) continue
    workshop.assignments.splice(index, 1)
    for (const pa of snapshot.pas)
      if (!assignedIds.has(pa.id) && assessAssignment(snapshot, workshop, pa.id).automaticEligible)
        substitutes.add(pa.id)
  }
  return substitutes.size
}
