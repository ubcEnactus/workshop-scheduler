import { createHash } from 'node:crypto'
import { matchPlanSchema, type MatchingPlan } from '@/lib/schemas/matching'
import { DAY_LABELS, formatInstantRange, formatSlotRange, vancouverDateKey } from '@/lib/time'
import { paAvailabilityCoversInterval } from './availability'
import {
  assessAssignment,
  assignmentPolicyHash,
  mondayFridayWeekKey,
  totalAssignments,
  type ScheduleSnapshot,
} from './eligibility'

export function matchingPlanHash(plan: MatchingPlan) {
  return createHash('sha256')
    .update(JSON.stringify(matchPlanSchema.parse(plan)))
    .digest('hex')
}

export function proposedSchedule(snapshot: ScheduleSnapshot, plan: MatchingPlan): ScheduleSnapshot {
  return {
    ...snapshot,
    workshops: snapshot.workshops.map((workshop) => {
      const row = plan.find((item) => item.workshopSessionId === workshop.id && !item.protected)
      return row
        ? {
            ...workshop,
            assignments: row.paIds.map((paId) => ({
              paId,
              status: 'DRAFT' as const,
              source: row.manuallyEdited ? ('MANUAL' as const) : ('AUTOMATIC' as const),
              ...row.overrides?.find((item) => item.paId === paId),
            })),
          }
        : workshop
    }),
  }
}

/** Use all interval boundaries, preserving exact legacy and exception minutes. */
export function previewWeekAvailability(snapshot: ScheduleSnapshot, paId: string, monday: string) {
  const slots = snapshot.availability
    .filter((slot) => slot.userId === paId)
    .map((slot) => ({ ...slot, effectiveFrom: slot.effectiveFrom ?? '2000-01-01' }))
  const exceptions = (snapshot.availabilityExceptions ?? []).filter((item) => item.userId === paId)
  const boundaries = [
    ...new Set([
      0,
      1440,
      ...slots.flatMap((slot) => [slot.startMin, slot.startMin + 15]),
      ...exceptions.flatMap((item) => [item.startMinute ?? 0, item.endMinute ?? 1440]),
    ]),
  ].sort((a, b) => a - b)
  return DAY_LABELS.map((day, index) => {
    const date = new Date(`${monday}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    const key = date.toISOString().slice(0, 10)
    const windows: { start: number; end: number }[] = []
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i],
        end = boundaries[i + 1]
      if (
        paAvailabilityCoversInterval({
          paId,
          date: key,
          startMinute: start,
          endMinute: end,
          slots,
          exceptions,
        })
      ) {
        const last = windows.at(-1)
        if (last?.end === start) last.end = end
        else windows.push({ start, end })
      }
    }
    return {
      date: key,
      day,
      windows: windows.map(({ start, end }) => formatSlotRange(start, end - start)),
    }
  })
}

export function previewStaffingView(
  snapshot: ScheduleSnapshot,
  plan: MatchingPlan,
  sessionId: string,
  runTotals: Record<string, number>
) {
  const final = proposedSchedule(snapshot, plan)
  const workshop = final.workshops.find((item) => item.id === sessionId)!
  const row = plan.find((item) => item.workshopSessionId === sessionId)!
  const date = vancouverDateKey(workshop.scheduledStart)
  const weekStart = new Date(`${date}T12:00:00Z`)
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7))
  const week = weekStart.toISOString().slice(0, 10)
  return {
    planHash: matchingPlanHash(plan),
    sessionLabel: `${workshop.definitionTitle} · ${workshop.schoolName} · ${formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd)}`,
    minPAs: workshop.minPAs,
    maxPAs: workshop.maxPAs,
    selected: row.paIds,
    candidates: final.pas
      .map((pa) => {
        const assessment = assessAssignment(final, workshop, pa.id)
        const inRun = (schedule: ScheduleSnapshot) =>
          schedule.workshops.filter(
            (item) =>
              item.status !== 'CANCELLED' &&
              item.workshopDefinitionId === workshop.workshopDefinitionId &&
              item.assignments.some((assignment) => assignment.paId === pa.id)
          ).length
        const commitments = final.workshops.filter(
          (item) =>
            item.status !== 'CANCELLED' &&
            mondayFridayWeekKey(vancouverDateKey(item.scheduledStart)) === week &&
            item.assignments.some((assignment) => assignment.paId === pa.id)
        )
        return {
          id: pa.id,
          name: pa.name ?? pa.email,
          hardErrors: assessment.hardErrors,
          availabilityWarnings: assessment.availabilityWarnings,
          policyHash: assignmentPolicyHash(workshop, pa.id, assessment),
          warnings: assessment.manualWarnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
            commitments: warning.commitments.map(
              (item) =>
                `${item.definitionTitle ?? 'Workshop'} · ${item.schoolName ?? 'School'} · ${formatInstantRange(item.scheduledStart, item.scheduledEnd)} · ${item.minutesBetween} minutes between sessions`
            ),
          })),
          weekCount: commitments.length,
          runCount: (runTotals[pa.id] ?? 0) + inRun(final) - inRun(snapshot),
          lifetimeCount: totalAssignments(final, pa.id),
          availability: previewWeekAvailability(snapshot, pa.id, week),
          commitments: commitments.map(
            (item) =>
              `${item.definitionTitle} · ${item.schoolName} · ${formatInstantRange(item.scheduledStart, item.scheduledEnd)}${plan.some((p) => p.workshopSessionId === item.id && !p.protected) ? ' · Proposed' : ' · Scheduled'}`
          ),
        }
      })
      .sort(
        (a, b) =>
          Number(a.hardErrors.length > 0) - Number(b.hardErrors.length > 0) ||
          Number(a.availabilityWarnings.length > 0) - Number(b.availabilityWarnings.length > 0) ||
          Number(a.warnings.length > 0) - Number(b.warnings.length > 0) ||
          a.lifetimeCount - b.lifetimeCount ||
          a.name.localeCompare(b.name)
      ),
  }
}
export type PreviewStaffingView = ReturnType<typeof previewStaffingView>
