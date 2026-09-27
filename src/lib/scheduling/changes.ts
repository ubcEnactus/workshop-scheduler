import type { Prisma } from '@prisma/client'
import type { ChangeRequest } from '@/lib/schemas/changes'
import { workshopSchema } from '@/lib/schemas/workshops'
import {
  assessAssignment,
  assignmentPolicyHash,
  manualAssignmentDecision,
  type ScheduleSnapshot,
  type ScheduledWorkshop,
} from './eligibility'
import { validateSlot, SchedulingError, type ScheduleLoadScope } from './store'
import { vancouverToUtc } from '@/lib/time'
import { clockMinutes } from '@/lib/schemas/workshops'

export function changeScheduleScope(data: ChangeRequest): ScheduleLoadScope {
  return {
    kind: 'sessions',
    workshopSessionIds: [data.id],
    ...(['EDIT', 'RESCHEDULE'].includes(data.kind) && 'date' in data
      ? {
          neighborhoods: [
            {
              start: vancouverToUtc(data.date, clockMinutes(data.startTime)),
              end: vancouverToUtc(data.date, clockMinutes(data.endTime)),
            },
          ],
        }
      : {}),
  }
}

export function auditState(w: ScheduledWorkshop, snapshot: ScheduleSnapshot) {
  return {
    schemaVersion: 2,
    status: w.status,
    start: w.scheduledStart.toISOString(),
    end: w.scheduledEnd.toISOString(),
    minPAs: w.minPAs,
    maxPAs: w.maxPAs,
    mode: w.mode ?? 'IN_PERSON',
    location: w.location ?? null,
    notes: w.notes ?? null,
    participantInstructions: w.participantInstructions ?? null,
    dateExceptionReason: w.dateExceptionReason ?? null,
    pas: w.assignments.map((a) => ({
      id: a.paId,
      name:
        snapshot.pas.find((p) => p.id === a.paId)?.name ??
        snapshot.pas.find((p) => p.id === a.paId)?.email ??
        'Inactive PA',
    })),
    availabilityOverrides: w.assignments
      .filter((a) => a.overrideAvailability)
      .map((a) => ({ paId: a.paId })),
    workloadOverrides: w.assignments
      .filter((a) => a.overrideSameDay || a.overrideWeek)
      .map((a) => ({
        paId: a.paId,
        sameDay: a.overrideSameDay ?? false,
        week: a.overrideWeek ?? false,
        reason: a.overrideReason ?? null,
      })),
  }
}

// Stage a complete final state, then revalidate that same state when applying it.
// Preview may describe unconfirmed exceptions; only the apply path can commit them.
export async function proposeChange(
  tx: Prisma.TransactionClient,
  snapshot: ScheduleSnapshot,
  data: ChangeRequest,
  options?: { actorId: string; preview?: boolean }
) {
  const current = snapshot.workshops.find((w) => w.id === data.id)
  if (!current || !['DRAFT', 'PUBLISHED'].includes(current.status))
    throw new SchedulingError('Only draft or published workshops can be changed.')
  if (current.version !== data.version)
    throw new SchedulingError('This workshop changed. Reload and review a new change.')
  const next: ScheduledWorkshop = {
    ...current,
    assignments: current.assignments.map((a) => ({ ...a })),
    locked: current.status === 'DRAFT' ? current.locked : true,
  }
  let slotData: Awaited<ReturnType<typeof validateSlot>> | undefined
  if (data.kind === 'CANCEL') next.status = 'CANCELLED'
  if (data.kind === 'COMPLETE') {
    if (current.status !== 'PUBLISHED' || current.scheduledEnd.getTime() > Date.now())
      throw new SchedulingError('Only a published workshop that has ended can be completed.')
    next.status = 'COMPLETED'
  }
  if (data.kind === 'REPLACE') {
    if (
      data.oldPaId === data.newPaId ||
      !current.assignments.some((a) => a.paId === data.oldPaId) ||
      current.assignments.some((a) => a.paId === data.newPaId)
    )
      throw new SchedulingError('Choose an assigned PA and a different replacement.')
    next.assignments = current.assignments.filter((a) => a.paId !== data.oldPaId)
    next.assignments.push({
      paId: data.newPaId,
      status: current.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      source: 'MANUAL',
    })
  }
  if (data.kind === 'EDIT') {
    if (data.maxPAs < data.minPAs)
      throw new SchedulingError('Maximum staffing must be at least the minimum.')
    if (data.paIds.length > data.maxPAs)
      throw new SchedulingError('Remove PAs or increase the maximum staffing.')
    next.assignments = data.paIds.map((paId) => {
      const existing = current.assignments.find((a) => a.paId === paId)
      return existing
        ? { ...existing }
        : { paId, status: current.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT', source: 'MANUAL' }
    })
    Object.assign(next, {
      minPAs: data.minPAs,
      maxPAs: data.maxPAs,
      mode: data.mode,
      location: data.location || null,
      notes: data.notes || null,
      participantInstructions: data.participantInstructions || null,
    })
  }
  if (data.kind === 'RESCHEDULE' || data.kind === 'EDIT') {
    const parsed = workshopSchema.safeParse({
      ...data,
      classSectionId: current.classSectionId,
      workshopDefinitionId: current.workshopDefinitionId,
      minPAs: next.minPAs,
      maxPAs: next.maxPAs,
    })
    if (!parsed.success) throw new SchedulingError(parsed.error.issues[0].message)
    // Prefer ordinary authorization. Only an actual failure may need an explicit date exception.
    try {
      slotData = await validateSlot(tx, parsed.data, current.id)
    } catch (error) {
      if (
        !(error instanceof SchedulingError) ||
        !options?.actorId ||
        (!options.preview && !data.dateExceptionConfirmed)
      )
        throw error
      slotData = await validateSlot(tx, parsed.data, current.id, {
        actorId: options.actorId,
        dateExceptionReason: data.reason,
        hostingConfirmed: true,
      })
    }
    Object.assign(next, slotData, {
      hostingValid: true,
      dateExceptionApproved: Boolean(slotData.dateExceptionReason),
    })
  }
  const final: ScheduleSnapshot = {
    ...snapshot,
    workshops: snapshot.workshops.map((w) => (w.id === next.id ? next : w)),
  }
  const moved =
    current.scheduledStart.getTime() !== next.scheduledStart.getTime() ||
    current.scheduledEnd.getTime() !== next.scheduledEnd.getTime()
  const warningDetails: { paId: string; assessment: ReturnType<typeof assessAssignment> }[] = []
  if (['EDIT', 'REPLACE', 'RESCHEDULE'].includes(data.kind)) {
    for (const assignment of next.assignments) {
      const previous = current.assignments.find((a) => a.paId === assignment.paId)
      if (previous && !moved) continue
      const assessment = assessAssignment(final, next, assignment.paId)
      const decision = manualAssignmentDecision(final, next, assignment.paId, {
        expectedPolicyHash: assignmentPolicyHash(next, assignment.paId, assessment),
        overrideReason: data.reason,
      })
      if (!decision.ok) throw new SchedulingError(decision.reasons.join(' '))
      assignment.overrideAvailability = decision.overrideAvailability
      assignment.overrideSameDay = decision.overrideSameDay
      assignment.overrideWeek = decision.overrideWeek
      assignment.overrideReason = decision.overrideReason
      if (decision.overrideAvailability || decision.overrideSameDay || decision.overrideWeek)
        assignment.source = 'MANUAL'
      if (assessment.manualWarnings.length || assessment.availabilityWarnings.length)
        warningDetails.push({ paId: assignment.paId, assessment })
    }
  }
  return { current, next, final, slotData, warningDetails }
}
