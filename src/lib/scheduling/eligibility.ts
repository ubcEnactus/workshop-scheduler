import { createHash } from 'node:crypto'
import type {
  AssignmentSource,
  AssignmentStatus,
  SessionMode,
  WorkshopStatus,
} from '@prisma/client'
import {
  paAvailabilityCoversInterval,
  type AvailabilitySlot,
  type PAAvailabilityExceptionInput,
} from './availability'
import { vancouverDateKey, vancouverMinuteOfDay, vancouverMonthKey } from '@/lib/time'

export type ScheduledAssignment = {
  paId: string
  status: AssignmentStatus
  source: AssignmentSource
  overrideAvailability?: boolean
  overrideSameDay?: boolean
  overrideWeek?: boolean
  overrideReason?: string | null
}

export type ScheduledWorkshop = {
  id: string
  workshopDefinitionId?: string
  definitionTitle?: string
  classSectionId: string
  schoolId: string
  schoolName?: string
  scheduledStart: Date
  scheduledEnd: Date
  minPAs: number
  maxPAs: number
  status: WorkshopStatus
  version: number
  locked: boolean
  activeClass: boolean
  mode?: SessionMode
  location?: string | null
  notes?: string | null
  participantInstructions?: string | null
  dateExceptionReason?: string | null
  hostingValid?: boolean
  dateExceptionApproved?: boolean
  assignments: ScheduledAssignment[]
}

export type ScheduleSnapshot = {
  /** Retained while legacy readers migrate. Weekly capacity replaces rolling-day gaps. */
  minimumGapDays: number | null
  pas: { id: string; name: string | null; email: string }[]
  availability: (AvailabilitySlot & {
    effectiveFrom?: Date | string
    effectiveUntil?: Date | string | null
  })[]
  availabilityExceptions?: PAAvailabilityExceptionInput[]
  /** Historical input only. Monthly quotas do not authorize or block assignments. */
  quotas: { paId: string; month: string; quota: number }[]
  /** Database aggregate across all non-cancelled sessions, before preview mutations. */
  assignmentTotals?: Record<string, number>
  /** Assignment keys represented by the snapshot when aggregates were read. */
  baselineAssignmentKeys?: string[]
  workshops: ScheduledWorkshop[]
}

export type AssignmentCommitment = {
  workshopSessionId: string
  schoolId: string
  schoolName?: string
  definitionTitle?: string
  mode?: SessionMode
  location?: string | null
  scheduledStart: Date
  scheduledEnd: Date
  vancouverDate: string
  /** Gap between the proposed and existing half-open intervals; zero when they overlap. */
  minutesBetween: number
}

export type WorkloadWarning = {
  code: 'SAME_DAY' | 'SAME_WEEK'
  severity: 'critical' | 'warning'
  message: string
  commitments: AssignmentCommitment[]
}

export type AssignmentAssessment = {
  hardErrors: string[]
  availabilityWarnings: string[]
  manualWarnings: WorkloadWarning[]
  manualEligible: boolean
  automaticEligible: boolean
  totalAssignments: number
  commitments: AssignmentCommitment[]
}

export type ManualAssignmentInput = {
  overrideReason?: string
  expectedPolicyHash: string
}

export type ManualAssignmentDecision =
  | {
      ok: true
      policyHash: string
      overrideAvailability: boolean
      overrideSameDay: boolean
      overrideWeek: boolean
      overrideReason: string | null
    }
  | { ok: false; policyHash: string; reasons: string[] }

function unique(values: readonly string[]) {
  return [...new Set(values)]
}

function assignedTo(workshop: ScheduledWorkshop, paId: string) {
  return workshop.assignments.some((assignment) => assignment.paId === paId)
}

function activeCommitments(snapshot: ScheduleSnapshot, paId: string, excludeId?: string) {
  return snapshot.workshops.filter(
    (workshop) =>
      workshop.id !== excludeId && workshop.status !== 'CANCELLED' && assignedTo(workshop, paId)
  )
}

export function mondayFridayWeekKey(date: string): string | null {
  const value = new Date(`${date}T12:00:00Z`)
  const day = value.getUTCDay()
  if (day === 0 || day === 6) return null
  value.setUTCDate(value.getUTCDate() - (day - 1))
  return value.toISOString().slice(0, 10)
}

function minutesBetween(a: ScheduledWorkshop, b: ScheduledWorkshop) {
  if (a.scheduledEnd <= b.scheduledStart)
    return Math.floor((b.scheduledStart.getTime() - a.scheduledEnd.getTime()) / 60_000)
  if (b.scheduledEnd <= a.scheduledStart)
    return Math.floor((a.scheduledStart.getTime() - b.scheduledEnd.getTime()) / 60_000)
  return 0
}

function commitment(
  workshop: ScheduledWorkshop,
  proposed: ScheduledWorkshop
): AssignmentCommitment {
  return {
    workshopSessionId: workshop.id,
    schoolId: workshop.schoolId,
    schoolName: workshop.schoolName,
    definitionTitle: workshop.definitionTitle,
    mode: workshop.mode,
    location: workshop.location,
    scheduledStart: workshop.scheduledStart,
    scheduledEnd: workshop.scheduledEnd,
    vancouverDate: vancouverDateKey(workshop.scheduledStart),
    minutesBetween: minutesBetween(workshop, proposed),
  }
}

/** Lifetime assignment count used only as a fairness signal. */
export function totalAssignments(snapshot: ScheduleSnapshot, paId: string, excludeId?: string) {
  if (snapshot.assignmentTotals) {
    const baseline = new Set(snapshot.baselineAssignmentKeys ?? [])
    const current = new Set(
      snapshot.workshops
        .filter((workshop) => workshop.status !== 'CANCELLED')
        .flatMap((workshop) =>
          workshop.assignments.map((assignment) => `${workshop.id}:${assignment.paId}`)
        )
    )
    let count = snapshot.assignmentTotals[paId] ?? 0
    for (const key of current) if (key.endsWith(`:${paId}`) && !baseline.has(key)) count += 1
    for (const key of baseline) if (key.endsWith(`:${paId}`) && !current.has(key)) count -= 1
    if (excludeId && current.has(`${excludeId}:${paId}`)) count -= 1
    return Math.max(0, count)
  }
  return activeCommitments(snapshot, paId, excludeId).length
}

/** Legacy monthly reporting helper. It is not an eligibility rule. */
export function workload(
  snapshot: ScheduleSnapshot,
  paId: string,
  month: string,
  excludeId?: string
) {
  return activeCommitments(snapshot, paId, excludeId).filter(
    (workshop) => vancouverMonthKey(workshop.scheduledStart) === month
  ).length
}

/**
 * Evaluate one PA against one dated session.
 *
 * Hard errors block automatic and manual assignment. Availability and workload
 * warnings block automatic choices; selecting the PA records the admin's
 * exceptions without additional confirmations or a separate reason. Saved
 * exceptions are considered only by `eligibility`, which validates an existing
 * assignment for publication; they never make a new automatic choice eligible.
 */
export function assessAssignment(
  snapshot: ScheduleSnapshot,
  workshop: ScheduledWorkshop,
  paId: string
): AssignmentAssessment {
  const hardErrors: string[] = []
  const availabilityWarnings: string[] = []
  if (!workshop.activeClass) hardErrors.push('Inactive teacher, teacher or school.')
  if (workshop.hostingValid === false && !workshop.dateExceptionApproved)
    hardErrors.push('Workshop no longer fits its recorded candidate availability.')
  if (!snapshot.pas.some((pa) => pa.id === paId)) hardErrors.push('PA account is inactive.')
  if (workshop.status === 'CANCELLED') hardErrors.push('Workshop is cancelled.')

  const existing = assignedTo(workshop, paId)
  if (workshop.assignments.length + (existing ? 0 : 1) > workshop.maxPAs)
    hardErrors.push('Staffing capacity reached.')

  const date = vancouverDateKey(workshop.scheduledStart)
  const endDate = vancouverDateKey(workshop.scheduledEnd)
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() - 1
  const slots = snapshot.availability.filter((slot) => slot.userId === paId)
  const datedAvailability = (snapshot.availabilityExceptions ?? []).filter(
    (item) =>
      item.userId === paId &&
      item.kind === 'AVAILABLE' &&
      (typeof item.date === 'string'
        ? item.date.slice(0, 10)
        : item.date.toISOString().slice(0, 10)) === date
  )
  if (slots.length === 0 && datedAvailability.length === 0)
    availabilityWarnings.push('Availability is missing.')
  else if (
    date !== endDate ||
    weekday < 0 ||
    weekday > 4 ||
    !paAvailabilityCoversInterval({
      paId,
      date,
      startMinute: vancouverMinuteOfDay(workshop.scheduledStart),
      endMinute: vancouverMinuteOfDay(workshop.scheduledEnd),
      slots: slots.map((slot) => ({
        ...slot,
        effectiveFrom: slot.effectiveFrom ?? '2000-01-01',
      })),
      exceptions: snapshot.availabilityExceptions,
    })
  )
    availabilityWarnings.push('Availability does not cover the full workshop.')

  const commitments = activeCommitments(snapshot, paId, workshop.id)
  const sameDay: AssignmentCommitment[] = []
  const sameWeek: AssignmentCommitment[] = []
  const proposedWeek = mondayFridayWeekKey(date)

  for (const other of commitments) {
    const otherDate = vancouverDateKey(other.scheduledStart)
    const overlaps =
      workshop.scheduledStart < other.scheduledEnd && other.scheduledStart < workshop.scheduledEnd
    if (overlaps) hardErrors.push('Conflicting assignment.')

    const touches =
      workshop.scheduledStart.getTime() === other.scheduledEnd.getTime() ||
      other.scheduledStart.getTime() === workshop.scheduledEnd.getTime()
    if (workshop.schoolId === other.schoolId && date === otherDate && touches)
      hardErrors.push('PA cannot teach consecutive sessions at the same school.')

    const detail = commitment(other, workshop)
    if (date === otherDate) sameDay.push(detail)
    if (proposedWeek && mondayFridayWeekKey(otherDate) === proposedWeek) sameWeek.push(detail)
  }

  const manualWarnings: WorkloadWarning[] = []
  if (sameDay.length)
    manualWarnings.push({
      code: 'SAME_DAY',
      severity: 'critical',
      message: 'Already assigned another session on this day.',
      commitments: sameDay,
    })
  if (sameWeek.length)
    manualWarnings.push({
      code: 'SAME_WEEK',
      severity: 'warning',
      message: 'Already assigned another session in this Monday–Friday week.',
      commitments: sameWeek,
    })

  const errors = unique(hardErrors)
  return {
    hardErrors: errors,
    availabilityWarnings,
    manualWarnings,
    manualEligible: errors.length === 0,
    automaticEligible:
      errors.length === 0 && availabilityWarnings.length === 0 && manualWarnings.length === 0,
    totalAssignments: totalAssignments(snapshot, paId, workshop.id),
    commitments: commitments.map((other) => commitment(other, workshop)),
  }
}

export function assignmentPolicyHash(
  workshop: ScheduledWorkshop,
  paId: string,
  assessment: AssignmentAssessment
) {
  const payload = {
    workshopSessionId: workshop.id,
    paId,
    schoolId: workshop.schoolId,
    schoolName: workshop.schoolName,
    mode: workshop.mode,
    location: workshop.location,
    start: workshop.scheduledStart.toISOString(),
    end: workshop.scheduledEnd.toISOString(),
    hardErrors: assessment.hardErrors,
    availabilityWarnings: assessment.availabilityWarnings,
    warnings: assessment.manualWarnings.map((warning) => ({
      code: warning.code,
      commitments: warning.commitments.map((item) => ({
        id: item.workshopSessionId,
        schoolId: item.schoolId,
        schoolName: item.schoolName,
        mode: item.mode,
        location: item.location,
        start: item.scheduledStart.toISOString(),
        end: item.scheduledEnd.toISOString(),
      })),
    })),
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

/** Revalidate a reviewed manual choice and derive the only override fields that may be persisted. */
export function manualAssignmentDecision(
  snapshot: ScheduleSnapshot,
  workshop: ScheduledWorkshop,
  paId: string,
  input: ManualAssignmentInput
): ManualAssignmentDecision {
  const assessment = assessAssignment(snapshot, workshop, paId)
  const policyHash = assignmentPolicyHash(workshop, paId, assessment)
  const reasons = [...assessment.hardErrors]
  if (input.expectedPolicyHash !== policyHash)
    reasons.push('PA availability or nearby commitments changed. Review this assignment again.')

  const requiresSameDay = assessment.manualWarnings.some((warning) => warning.code === 'SAME_DAY')
  const requiresWeek = assessment.manualWarnings.some((warning) => warning.code === 'SAME_WEEK')
  const reason = input.overrideReason?.trim()

  if (reasons.length) return { ok: false, policyHash, reasons: unique(reasons) }
  return {
    ok: true,
    policyHash,
    overrideAvailability: assessment.availabilityWarnings.length > 0,
    overrideSameDay: requiresSameDay,
    overrideWeek: requiresWeek,
    overrideReason: requiresSameDay || requiresWeek ? reason || null : null,
  }
}

/**
 * Compatibility validator for existing call sites. New manual assignment UIs
 * should consume `assessAssignment` so warnings are visible before selection.
 */
export function eligibility(
  snapshot: ScheduleSnapshot,
  workshop: ScheduledWorkshop,
  paId: string
): string[] {
  const assessment = assessAssignment(snapshot, workshop, paId)
  const saved = workshop.assignments.find((assignment) => assignment.paId === paId)
  const approvedByCounterparts = (warning: WorkloadWarning) =>
    warning.commitments.every((item) => {
      const counterpart = snapshot.workshops
        .find((candidate) => candidate.id === item.workshopSessionId)
        ?.assignments.find((assignment) => assignment.paId === paId)
      return warning.code === 'SAME_DAY'
        ? counterpart?.overrideSameDay === true
        : counterpart?.overrideWeek === true
    })
  const unapprovedWarnings = assessment.manualWarnings.filter(
    (warning) =>
      ((warning.code === 'SAME_DAY' && !saved?.overrideSameDay) ||
        (warning.code === 'SAME_WEEK' && !saved?.overrideWeek)) &&
      !approvedByCounterparts(warning)
  )
  return unique([
    ...assessment.hardErrors,
    ...(saved?.overrideAvailability ? [] : assessment.availabilityWarnings),
    ...unapprovedWarnings.map((warning) => warning.message),
  ])
}

export function staffingProblems(snapshot: ScheduleSnapshot, workshop: ScheduledWorkshop) {
  const problems =
    workshop.assignments.length < workshop.minPAs ? ['Minimum staffing is not met.'] : []
  if (workshop.assignments.length > workshop.maxPAs) problems.push('Staffing capacity exceeded.')
  for (const assignment of workshop.assignments) {
    const pa = snapshot.pas.find((candidate) => candidate.id === assignment.paId)
    problems.push(
      ...eligibility(snapshot, workshop, assignment.paId).map(
        (reason) => (pa?.name ?? pa?.email ?? 'Inactive PA') + ': ' + reason
      )
    )
  }
  return unique(problems)
}
